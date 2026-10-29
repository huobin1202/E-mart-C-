using backend.Data;
using backend.DTO;
using backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
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

    public Task<List<PurchaseOrder>> GetAllForCacheAsync()
    {
        return _context.PurchaseOrders.AsNoTracking()
            .Include(po => po.Supplier).Include(po => po.User).Include(po => po.Employee)
            .Include(po => po.Details)
            .OrderByDescending(po => po.CreatedAt).ThenByDescending(po => po.Id)
            .ToListAsync();
    }

    public Task<PurchaseOrder?> GetByIdAsync(int id) => _context.PurchaseOrders
        .Include(po => po.Supplier).Include(po => po.User).Include(po => po.Employee)
        .Include(po => po.Details).ThenInclude(detail => detail.Product)
        .FirstOrDefaultAsync(po => po.Id == id);

    public async Task<PurchaseOrder> CreateAsync(PurchaseOrder purchaseOrder)
    {
        _context.PurchaseOrders.Add(purchaseOrder);
        await _context.SaveChangesAsync();
        return purchaseOrder;
    }

    public Task<int?> GetEmployeeIdForUserAsync(int userId) => _context.Users
        .Where(user => user.Id == userId).Select(user => user.EmployeeId).SingleOrDefaultAsync();

    public Task<IDbContextTransaction> BeginSerializableTransactionAsync() =>
        _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);

    public Task LockAsync(int id)
    {
        var resource = $"purchase-order-{id}";
        return _context.Database.ExecuteSqlInterpolatedAsync($"""
            DECLARE @result INT;
            EXEC @result = sys.sp_getapplock @Resource = {resource}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
            IF @result < 0 THROW 51000, 'Purchase order is busy. Please retry.', 1;
            """);
    }

    public Task<PurchaseOrder?> GetForUpdateAsync(int id) => _context.PurchaseOrders
        .Include(po => po.Details).FirstOrDefaultAsync(po => po.Id == id);

    public Task<Dictionary<int, Product>> GetProductsForUpdateAsync(IEnumerable<int> productIds)
    {
        var ids = productIds.Distinct().ToList();
        return _context.Products.Where(product => ids.Contains(product.Id)).ToDictionaryAsync(product => product.Id);
    }

    public void AddInventoryAdjustment(InventoryAdjustment adjustment) => _context.InventoryAdjustments.Add(adjustment);
    public void AddActivityLog(ActivityLog activityLog) => _context.ActivityLogs.Add(activityLog);
    public Task SaveChangesAsync() => _context.SaveChangesAsync();
}
