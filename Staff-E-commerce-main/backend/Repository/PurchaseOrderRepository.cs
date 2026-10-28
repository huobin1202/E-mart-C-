using backend.Data;
using backend.DTO;
using backend.Models;
using Microsoft.EntityFrameworkCore;
using System.Data;

namespace backend.Repository;

public class PurchaseOrderRepository
{
    private readonly AppDbContext _context;

    public PurchaseOrderRepository(AppDbContext context) => _context = context;

    public Task<Supplier?> GetActiveSupplierAsync(int supplierId)
    {
        return _context.Suppliers.SingleOrDefaultAsync(item => item.Id == supplierId && item.IsActive);
    }

    public Task<int> CountActiveProductsAsync(IEnumerable<int> productIds)
    {
        var ids = productIds.Distinct().ToList();
        return _context.Products.CountAsync(product => ids.Contains(product.Id) && product.IsActive);
    }

    public Task<List<PurchaseOrderListDTO>> GetAllForCacheAsync()
    {
        return _context.PurchaseOrders.AsNoTracking()
            .OrderByDescending(po => po.CreatedAt).ThenByDescending(po => po.Id)
            .Select(po => new PurchaseOrderListDTO
            {
                Id = po.Id,
                PoCode = po.PoCode,
                SupplierId = po.SupplierId,
                SupplierName = po.Supplier != null ? po.Supplier.Name : string.Empty,
                UserName = po.User != null ? po.User.FullName : string.Empty,
                EmployeeId = po.EmployeeId,
                EmployeeName = po.Employee != null ? po.Employee.FullName : null,
                TotalAmount = po.TotalAmount,
                ItemCount = po.Details.Count,
                Status = po.Status,
                CreatedAt = po.CreatedAt
            }).ToListAsync();
    }

    public Task<PurchaseOrder?> GetByIdAsync(int id) => _context.PurchaseOrders
        .Include(po => po.Supplier).Include(po => po.User).Include(po => po.Employee)
        .Include(po => po.Details).ThenInclude(detail => detail.Product)
        .FirstOrDefaultAsync(po => po.Id == id);

    public async Task<PurchaseOrder> CreateAsync(PurchaseOrder purchaseOrder)
    {
        purchaseOrder.EmployeeId = await _context.Users
            .Where(user => user.Id == purchaseOrder.UserId)
            .Select(user => user.EmployeeId)
            .SingleOrDefaultAsync();
        _context.PurchaseOrders.Add(purchaseOrder);
        await _context.SaveChangesAsync();
        return purchaseOrder;
    }

    public async Task CompleteAsync(int id, int userId)
    {
        await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var purchaseOrder = await _context.PurchaseOrders
            .Include(po => po.Details)
            .FirstOrDefaultAsync(po => po.Id == id);
        if (purchaseOrder == null) throw new KeyNotFoundException("Không tìm thấy phiếu nhập.");
        if (!string.Equals(purchaseOrder.Status, "pending", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Chỉ có thể hoàn tất phiếu nhập đang chờ xử lý.");

        var productIds = purchaseOrder.Details.Select(detail => detail.ProductId).ToList();
        var products = await _context.Products
            .Where(item => productIds.Contains(item.Id))
            .ToDictionaryAsync(item => item.Id);
        var now = DateTime.UtcNow;
        foreach (var detail in purchaseOrder.Details)
        {
            if (!products.TryGetValue(detail.ProductId, out var product))
                throw new InvalidOperationException($"Không tìm thấy sản phẩm ID {detail.ProductId}.");
            product.StockQuantity += detail.Quantity;
            product.UpdatedAt = now;
            _context.InventoryAdjustments.Add(new InventoryAdjustment
            {
                ProductId = detail.ProductId, ChangeAmount = detail.Quantity,
                Reason = $"Nhập hàng {purchaseOrder.PoCode}", UserId = userId, CreatedAt = now
            });
        }

        purchaseOrder.Status = "completed";
        purchaseOrder.UpdatedAt = now;
        _context.ActivityLogs.Add(new ActivityLog
        {
            UserId = userId, Action = "complete_purchase_order", EntityType = "purchase_orders",
            EntityId = purchaseOrder.Id.ToString(), Payload = purchaseOrder.PoCode, CreatedAt = now
        });
        await _context.SaveChangesAsync();
        await transaction.CommitAsync();
    }

    public async Task CancelAsync(int id, int userId)
    {
        var purchaseOrder = await _context.PurchaseOrders.FindAsync(id);
        if (purchaseOrder == null) throw new KeyNotFoundException("Không tìm thấy phiếu nhập.");
        if (!string.Equals(purchaseOrder.Status, "pending", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Chỉ có thể hủy phiếu nhập đang chờ xử lý.");
        purchaseOrder.Status = "cancelled";
        purchaseOrder.UpdatedAt = DateTime.UtcNow;
        _context.ActivityLogs.Add(new ActivityLog
        {
            UserId = userId, Action = "cancel_purchase_order", EntityType = "purchase_orders",
            EntityId = purchaseOrder.Id.ToString(), Payload = purchaseOrder.PoCode, CreatedAt = DateTime.UtcNow
        });
        await _context.SaveChangesAsync();
    }
}
