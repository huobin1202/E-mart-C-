using System.Security.Claims;
using backend.DTO;
using backend.Models;
using backend.Repository;

namespace backend.Services;

public class PurchaseOrderService
{
    private readonly PurchaseOrderRepository _repository;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly BusMemoryCache<PurchaseOrderListDTO> _cache;
    private readonly RealtimeNotificationService _realtime;
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(15);

    public PurchaseOrderService(PurchaseOrderRepository repository, IHttpContextAccessor httpContextAccessor, BusMemoryCache<PurchaseOrderListDTO> cache, RealtimeNotificationService realtime)
    {
        _repository = repository;
        _httpContextAccessor = httpContextAccessor;
        _cache = cache;
        _realtime = realtime;
    }

    public async Task<PaginationResult<PurchaseOrderListDTO>> GetPagedAsync(int page, int pageSize, string? search, string? status, int? supplierId)
    {
        var (cachedItems, _) = await _cache.GetOrCreateAsync(
            async () => (await _repository.GetAllForCacheAsync()).Select(MapList).ToList(), CacheTtl);
        IEnumerable<PurchaseOrderListDTO> filtered = cachedItems;
        if (!string.IsNullOrWhiteSpace(search))
        {
            var keyword = search.Trim();
            filtered = filtered.Where(item => item.PoCode.Contains(keyword, StringComparison.OrdinalIgnoreCase) ||
                                              item.SupplierName.Contains(keyword, StringComparison.OrdinalIgnoreCase));
        }
        if (!string.IsNullOrWhiteSpace(status))
            filtered = filtered.Where(item => string.Equals(item.Status, status, StringComparison.OrdinalIgnoreCase));
        if (supplierId.HasValue)
            filtered = filtered.Where(item => item.SupplierId == supplierId.Value);

        var totalItems = filtered.Count();
        var items = filtered.Skip((page - 1) * pageSize).Take(pageSize).ToList();
        return new PaginationResult<PurchaseOrderListDTO>
        {
            Items = items, TotalItems = totalItems, CurrentPage = page, PageSize = pageSize,
            TotalPages = (int)Math.Ceiling(totalItems / (double)pageSize), HasPrevious = page > 1, HasNext = page * pageSize < totalItems
        };
    }

    public async Task<PurchaseOrderDetailDTO?> GetByIdAsync(int id)
    {
        var purchaseOrder = await _repository.GetByIdAsync(id);
        return purchaseOrder == null ? null : MapDetail(purchaseOrder);
    }

    public async Task<PurchaseOrderDetailDTO> CreateAsync(PurchaseOrderCreateDTO request)
    {
        if (request.SupplierId <= 0 || request.Items.Count == 0) throw new ArgumentException("Nhà cung cấp và ít nhất một sản phẩm là bắt buộc.");
        if (request.Items.Any(item => item.ProductId <= 0 || item.Quantity <= 0 || item.ImportPrice < 0)) throw new ArgumentException("Sản phẩm, số lượng và giá nhập không hợp lệ.");
        if (request.Items.GroupBy(item => item.ProductId).Any(group => group.Count() > 1)) throw new ArgumentException("Một sản phẩm chỉ được xuất hiện một lần trong phiếu nhập.");

        var userId = GetCurrentUserId();
        var supplier = await _repository.GetActiveSupplierAsync(request.SupplierId);
        if (supplier == null) throw new ArgumentException("Nhà cung cấp không tồn tại hoặc đã ngừng hoạt động.");

        var productIds = request.Items.Select(item => item.ProductId).ToList();
        if (await _repository.CountActiveProductsAsync(productIds) != productIds.Count)
            throw new ArgumentException("Có sản phẩm không tồn tại hoặc đã ngừng kinh doanh.");

        var now = DateTime.UtcNow;
        var purchaseOrder = new PurchaseOrder
        {
            PoCode = $"PN{now:yyMMdd}{Guid.NewGuid():N}"[..20], SupplierId = supplier.Id, UserId = userId,
            EmployeeId = await _repository.GetEmployeeIdForUserAsync(userId),
            Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(), Status = "pending",
            TotalAmount = request.Items.Sum(item => item.Quantity * item.ImportPrice), CreatedAt = now, UpdatedAt = now,
            Details = request.Items.Select(item => new PurchaseOrderDetail { ProductId = item.ProductId, Quantity = item.Quantity, ImportPrice = item.ImportPrice }).ToList()
        };
        await _repository.CreateAsync(purchaseOrder);
        _cache.Clear();
        return (await GetByIdAsync(purchaseOrder.Id))!;
    }

    public async Task<PurchaseOrderDetailDTO> CompleteAsync(int id)
    {
        var userId = GetCurrentUserId();
        await using var transaction = await _repository.BeginSerializableTransactionAsync();
        await _repository.LockAsync(id);
        var purchaseOrder = await _repository.GetForUpdateAsync(id)
            ?? throw new KeyNotFoundException("Không tìm thấy phiếu nhập.");
        if (!string.Equals(purchaseOrder.Status, "pending", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Chỉ có thể hoàn tất phiếu nhập đang chờ xử lý.");

        var products = await _repository.GetProductsForUpdateAsync(purchaseOrder.Details.Select(detail => detail.ProductId));
        var now = DateTime.UtcNow;
        foreach (var detail in purchaseOrder.Details)
        {
            if (!products.TryGetValue(detail.ProductId, out var product))
                throw new InvalidOperationException($"Không tìm thấy sản phẩm ID {detail.ProductId}.");
            product.StockQuantity += detail.Quantity;
            product.UpdatedAt = now;
            _repository.AddInventoryAdjustment(new InventoryAdjustment
            {
                ProductId = detail.ProductId,
                ChangeAmount = detail.Quantity,
                Reason = $"Nhập hàng {purchaseOrder.PoCode}",
                UserId = userId,
                CreatedAt = now
            });
        }
        purchaseOrder.Status = "completed";
        purchaseOrder.UpdatedAt = now;
        _repository.AddActivityLog(new ActivityLog
        {
            UserId = userId,
            Action = "complete_purchase_order",
            EntityType = "purchase_orders",
            EntityId = purchaseOrder.Id.ToString(),
            Payload = purchaseOrder.PoCode,
            CreatedAt = now
        });
        await _repository.SaveChangesAsync();
        await transaction.CommitAsync();
        _cache.Clear();
        var completed = (await GetByIdAsync(id))!;
        await _realtime.BroadcastStock("StockUpdated", new
        {
            productIds = completed.Items.Select(item => item.ProductId).Distinct().ToArray(),
            purchaseOrderId = completed.Id,
            source = "purchase-order",
            changedAt = DateTime.UtcNow
        });
        return completed;
    }

    public async Task<PurchaseOrderDetailDTO> CancelAsync(int id)
    {
        var userId = GetCurrentUserId();
        await using var transaction = await _repository.BeginSerializableTransactionAsync();
        await _repository.LockAsync(id);
        var purchaseOrder = await _repository.GetForUpdateAsync(id)
            ?? throw new KeyNotFoundException("Không tìm thấy phiếu nhập.");
        if (!string.Equals(purchaseOrder.Status, "pending", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Chỉ có thể hủy phiếu nhập đang chờ xử lý.");
        var now = DateTime.UtcNow;
        purchaseOrder.Status = "cancelled";
        purchaseOrder.UpdatedAt = now;
        _repository.AddActivityLog(new ActivityLog
        {
            UserId = userId,
            Action = "cancel_purchase_order",
            EntityType = "purchase_orders",
            EntityId = purchaseOrder.Id.ToString(),
            Payload = purchaseOrder.PoCode,
            CreatedAt = now
        });
        await _repository.SaveChangesAsync();
        await transaction.CommitAsync();
        _cache.Clear();
        return (await GetByIdAsync(id))!;
    }

    private int GetCurrentUserId()
    {
        var user = _httpContextAccessor.HttpContext?.User;
        var claim = user?.FindFirst("uid") ?? user?.FindFirst(ClaimTypes.NameIdentifier);
        return claim != null && int.TryParse(claim.Value, out var userId) ? userId : throw new UnauthorizedAccessException("Không xác định được người dùng hiện tại.");
    }

    private static PurchaseOrderListDTO MapList(PurchaseOrder purchaseOrder) => new()
    {
        Id = purchaseOrder.Id, PoCode = purchaseOrder.PoCode, SupplierId = purchaseOrder.SupplierId, SupplierName = purchaseOrder.Supplier?.Name ?? string.Empty,
        UserName = purchaseOrder.User?.FullName ?? string.Empty, EmployeeId = purchaseOrder.EmployeeId, EmployeeName = purchaseOrder.Employee?.FullName,
        TotalAmount = purchaseOrder.TotalAmount, ItemCount = purchaseOrder.Details.Count, Status = purchaseOrder.Status, CreatedAt = purchaseOrder.CreatedAt
    };

    private static PurchaseOrderDetailDTO MapDetail(PurchaseOrder purchaseOrder) => new()
    {
        Id = purchaseOrder.Id, PoCode = purchaseOrder.PoCode, SupplierId = purchaseOrder.SupplierId, SupplierName = purchaseOrder.Supplier?.Name ?? string.Empty,
        UserName = purchaseOrder.User?.FullName ?? string.Empty, EmployeeId = purchaseOrder.EmployeeId, EmployeeName = purchaseOrder.Employee?.FullName,
        TotalAmount = purchaseOrder.TotalAmount, ItemCount = purchaseOrder.Details.Count, Status = purchaseOrder.Status,
        CreatedAt = purchaseOrder.CreatedAt, UpdatedAt = purchaseOrder.UpdatedAt, Note = purchaseOrder.Note,
        Items = purchaseOrder.Details.Select(detail => new PurchaseOrderItemDTO { ProductId = detail.ProductId, ProductName = detail.Product?.ProductName ?? string.Empty, Sku = detail.Product?.Sku, Quantity = detail.Quantity, ImportPrice = detail.ImportPrice, Subtotal = detail.Quantity * detail.ImportPrice }).ToList()
    };
}
