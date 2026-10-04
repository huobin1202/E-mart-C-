using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Repository;

public class PurchaseOrderRepository
{
    private readonly AppDbContext _context;

    public PurchaseOrderRepository(AppDbContext context) => _context = context;

    public async Task<(List<PurchaseOrder> Items, int TotalItems)> GetPagedAsync(int page, int pageSize, string? search, string? status, int? supplierId)
    {
        var query = _context.PurchaseOrders.Include(po => po.Supplier).Include(po => po.User).Include(po => po.Details).AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var keyword = search.Trim();
            query = query.Where(po => po.PoCode.Contains(keyword) || po.Supplier!.Name.Contains(keyword));
        }
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(po => po.Status == status);
        if (supplierId.HasValue) query = query.Where(po => po.SupplierId == supplierId.Value);

        var totalItems = await query.CountAsync();
        var items = await query.OrderByDescending(po => po.CreatedAt).ThenByDescending(po => po.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).AsNoTracking().ToListAsync();
        return (items, totalItems);
    }

    public Task<PurchaseOrder?> GetByIdAsync(int id) => _context.PurchaseOrders
        .Include(po => po.Supplier).Include(po => po.User)
        .Include(po => po.Details).ThenInclude(detail => detail.Product)
        .FirstOrDefaultAsync(po => po.Id == id);
}
