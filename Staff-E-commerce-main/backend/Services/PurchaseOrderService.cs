using System.Data;
using System.Security.Claims;
using backend.Data;
using backend.DTO;
using backend.Models;
using backend.Repository;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

public class PurchaseOrderService
{
    private readonly AppDbContext _context;
    private readonly PurchaseOrderRepository _repository;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public PurchaseOrderService(AppDbContext context, PurchaseOrderRepository repository, IHttpContextAccessor httpContextAccessor)
    {
        _context = context;
        _repository = repository;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task<PaginationResult<PurchaseOrderListDTO>> GetPagedAsync(int page, int pageSize, string? search, string? status, int? supplierId)
    {
        var (items, totalItems) = await _repository.GetPagedAsync(page, pageSize, search, status, supplierId);
        return new PaginationResult<PurchaseOrderListDTO>
        {
            Items = items.Select(MapList).ToList(), TotalItems = totalItems, CurrentPage = page, PageSize = pageSize,
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
        var supplier = await _context.Suppliers.SingleOrDefaultAsync(item => item.Id == request.SupplierId && item.IsActive);
        if (supplier == null) throw new ArgumentException("Nhà cung cấp không tồn tại hoặc đã ngừng hoạt động.");

        var productIds = request.Items.Select(item => item.ProductId).ToList();
        var products = await _context.Products.Where(product => productIds.Contains(product.Id) && product.IsActive).ToListAsync();
        if (products.Count != productIds.Count) throw new ArgumentException("Có sản phẩm không tồn tại hoặc đã ngừng kinh doanh.");

        var now = DateTime.UtcNow;
        var purchaseOrder = new PurchaseOrder
        {
            PoCode = $"PN{now:yyMMdd}{Guid.NewGuid():N}"[..20], SupplierId = supplier.Id, UserId = userId,
            Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(), Status = "pending",
            TotalAmount = request.Items.Sum(item => item.Quantity * item.ImportPrice), CreatedAt = now, UpdatedAt = now,
            Details = request.Items.Select(item => new PurchaseOrderDetail { ProductId = item.ProductId, Quantity = item.Quantity, ImportPrice = item.ImportPrice }).ToList()
        };
        _context.PurchaseOrders.Add(purchaseOrder);
        await _context.SaveChangesAsync();
        return (await GetByIdAsync(purchaseOrder.Id))!;
    }

    public async Task<PurchaseOrderDetailDTO> CompleteAsync(int id)
    {
        var userId = GetCurrentUserId();
        await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var purchaseOrder = await _context.PurchaseOrders.Include(po => po.Details).FirstOrDefaultAsync(po => po.Id == id);
        if (purchaseOrder == null) throw new KeyNotFoundException("Không tìm thấy phiếu nhập.");
        if (!string.Equals(purchaseOrder.Status, "pending", StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Chỉ có thể hoàn tất phiếu nhập đang chờ xử lý.");

        var productIds = purchaseOrder.Details.Select(detail => detail.ProductId).ToList();
        var inventories = await _context.Inventory.Where(item => productIds.Contains(item.ProductId)).ToDictionaryAsync(item => item.ProductId);
        var now = DateTime.UtcNow;
        foreach (var detail in purchaseOrder.Details)
        {
            if (!inventories.TryGetValue(detail.ProductId, out var inventory))
            {
                inventory = new Inventory { ProductId = detail.ProductId, Quantity = 0, UpdatedAt = now };
                _context.Inventory.Add(inventory);
                inventories[detail.ProductId] = inventory;
            }
            inventory.Quantity += detail.Quantity;
            inventory.UpdatedAt = now;
            inventory.LastCheckedAt = now;
            _context.InventoryAdjustments.Add(new InventoryAdjustment { ProductId = detail.ProductId, ChangeAmount = detail.Quantity, Reason = $"Nhập hàng {purchaseOrder.PoCode}", UserId = userId, CreatedAt = now });
        }
        purchaseOrder.Status = "completed";
        purchaseOrder.UpdatedAt = now;
        _context.ActivityLogs.Add(new ActivityLog { UserId = userId, Action = "complete_purchase_order", EntityType = "purchase_orders", EntityId = purchaseOrder.Id.ToString(), Payload = purchaseOrder.PoCode, CreatedAt = now });
        await _context.SaveChangesAsync();
        await transaction.CommitAsync();
        return (await GetByIdAsync(id))!;
    }

    public async Task<PurchaseOrderDetailDTO> CancelAsync(int id)
    {
        var userId = GetCurrentUserId();
        var purchaseOrder = await _context.PurchaseOrders.FindAsync(id);
        if (purchaseOrder == null) throw new KeyNotFoundException("Không tìm thấy phiếu nhập.");
        if (!string.Equals(purchaseOrder.Status, "pending", StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Chỉ có thể hủy phiếu nhập đang chờ xử lý.");
        purchaseOrder.Status = "cancelled";
        purchaseOrder.UpdatedAt = DateTime.UtcNow;
        _context.ActivityLogs.Add(new ActivityLog { UserId = userId, Action = "cancel_purchase_order", EntityType = "purchase_orders", EntityId = purchaseOrder.Id.ToString(), Payload = purchaseOrder.PoCode, CreatedAt = DateTime.UtcNow });
        await _context.SaveChangesAsync();
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
        UserName = purchaseOrder.User?.FullName ?? string.Empty, TotalAmount = purchaseOrder.TotalAmount, ItemCount = purchaseOrder.Details.Count, Status = purchaseOrder.Status, CreatedAt = purchaseOrder.CreatedAt
    };

    private static PurchaseOrderDetailDTO MapDetail(PurchaseOrder purchaseOrder) => new()
    {
        Id = purchaseOrder.Id, PoCode = purchaseOrder.PoCode, SupplierId = purchaseOrder.SupplierId, SupplierName = purchaseOrder.Supplier?.Name ?? string.Empty,
        UserName = purchaseOrder.User?.FullName ?? string.Empty, TotalAmount = purchaseOrder.TotalAmount, ItemCount = purchaseOrder.Details.Count, Status = purchaseOrder.Status,
        CreatedAt = purchaseOrder.CreatedAt, UpdatedAt = purchaseOrder.UpdatedAt, Note = purchaseOrder.Note,
        Items = purchaseOrder.Details.Select(detail => new PurchaseOrderItemDTO { ProductId = detail.ProductId, ProductName = detail.Product?.ProductName ?? string.Empty, Sku = detail.Product?.Sku, Quantity = detail.Quantity, ImportPrice = detail.ImportPrice, Subtotal = detail.Quantity * detail.ImportPrice }).ToList()
    };
}
