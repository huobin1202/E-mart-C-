using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using System.Data;

namespace backend.Repository;

public sealed class PosCheckoutRepository
{
    private readonly AppDbContext _context;
    public PosCheckoutRepository(AppDbContext context) => _context = context;

    public Task<Order?> GetPosOrderForDisplayAsync(int id) => _context.Orders.AsNoTracking()
        .Include(o => o.User)
        .Include(o => o.Customer)
        .Include(o => o.OrderItems).ThenInclude(i => i.Product)
        .SingleOrDefaultAsync(o => o.Id == id && o.OrderType == "pos");

    public Task<int?> GetOrderIdByCheckoutKeyAsync(string key, int userId) => _context.Orders.AsNoTracking()
        .Where(o => o.CheckoutKey == key && o.UserId == userId)
        .Select(o => (int?)o.Id)
        .SingleOrDefaultAsync();

    public Task<IDbContextTransaction> BeginSerializableTransactionAsync() =>
        _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);

    public Task LockAsync() => SalesTransaction.LockAsync(_context);

    public Task<Order?> GetByCheckoutKeyAsync(string key) => _context.Orders.FirstOrDefaultAsync(o => o.CheckoutKey == key);

    public Task<Customer?> GetActiveCustomerAsync(int customerId) =>
        _context.Customers.SingleOrDefaultAsync(c => c.Id == customerId && c.IsActive);

    public Task<Dictionary<int, Product>> GetActiveProductsByIdsAsync(List<int> productIds) =>
        _context.Products.Where(p => productIds.Contains(p.Id) && p.IsActive).ToDictionaryAsync(p => p.Id);

    public Task<List<ProductPromotion>> GetProductPromotionsAsync(List<int> productIds) =>
        _context.ProductPromotions.Include(p => p.Promotion).Where(p => productIds.Contains(p.ProductId)).ToListAsync();

    public Task<Promotion?> GetPromotionForCheckoutAsync(int promotionId) =>
        _context.Promotions.Include(p => p.EventDetails).SingleOrDefaultAsync(p => p.Id == promotionId);

    public void AddOrder(Order order) => _context.Orders.Add(order);
    public void AddInventoryAdjustment(InventoryAdjustment adjustment) => _context.InventoryAdjustments.Add(adjustment);
    public void AddPromotionRedemption(PromotionRedemption redemption) => _context.PromotionRedemptions.Add(redemption);
    public void AddActivityLog(ActivityLog log) => _context.ActivityLogs.Add(log);
    public Task SaveChangesAsync() => _context.SaveChangesAsync();

    public async Task<bool> TryReduceInventoryAsync(int productId, int quantity, DateTime updatedAt)
    {
        var updated = await _context.Inventory.Where(i => i.ProductId == productId && i.Quantity >= quantity)
            .ExecuteUpdateAsync(update => update
                .SetProperty(i => i.Quantity, i => i.Quantity - quantity)
                .SetProperty(i => i.UpdatedAt, updatedAt));
        return updated == 1;
    }

    public Task<Order?> GetOrderForConfirmationAsync(int orderId) => _context.Orders
        .Include(o => o.Customer).Include(o => o.Payments)
        .SingleOrDefaultAsync(o => o.Id == orderId && o.OrderType == "pos");

    public Task<bool> HasCompletedTransactionAsync(string reference, int orderId) =>
        _context.Payments.AnyAsync(p => p.Status == "completed" && p.TransactionRef == reference && p.OrderId != orderId);

    public Task<Order?> GetLegacyCashOrderAsync(int orderId) => _context.Orders
        .Include(o => o.Customer).Include(o => o.OrderItems).Include(o => o.Payments)
        .SingleOrDefaultAsync(o => o.Id == orderId && o.OrderType == "pos");

    public Task<Order> GetOrderForCancelAsync(int orderId) => _context.Orders
        .Include(o => o.OrderItems).Include(o => o.Customer).SingleAsync(o => o.Id == orderId);

    public Task<List<PromotionRedemption>> GetRedemptionsAsync(int orderId) =>
        _context.PromotionRedemptions.Where(p => p.OrderId == orderId).ToListAsync();

    public Task<List<Promotion>> GetPromotionsAsync(List<int> promotionIds) =>
        _context.Promotions.Where(p => promotionIds.Contains(p.Id)).ToListAsync();

    public void RemoveRedemptions(List<PromotionRedemption> redemptions) => _context.PromotionRedemptions.RemoveRange(redemptions);

    public async Task<bool> RestoreInventoryAsync(int productId, int quantity, DateTime updatedAt)
    {
        var updated = await _context.Inventory.Where(i => i.ProductId == productId)
            .ExecuteUpdateAsync(update => update
                .SetProperty(i => i.Quantity, i => i.Quantity + quantity)
                .SetProperty(i => i.UpdatedAt, updatedAt));
        return updated == 1;
    }
}
