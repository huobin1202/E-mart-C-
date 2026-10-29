using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using System.Data;

namespace backend.Repository;

public sealed class StorefrontRepository
{
    private readonly AppDbContext _context;

    public StorefrontRepository(AppDbContext context) => _context = context;

    public Task<Customer?> GetActiveCustomerAsync(int customerId)
    {
        return _context.Customers.FirstOrDefaultAsync(c => c.Id == customerId && c.IsActive);
    }

    public Task<bool> UsernameExistsAsync(string username) =>
        _context.Users.AnyAsync(user => user.Username == username);

    public Task<Customer?> GetCustomerByPhoneAsync(string phone, string internationalPhone) =>
        _context.Customers.FirstOrDefaultAsync(customer =>
            customer.Phone == phone || customer.Phone == internationalPhone);

    public Task<bool> CustomerHasAccountAsync(int customerId) =>
        _context.Users.AnyAsync(user => user.CustomerId == customerId);

    public Task<Role?> GetActiveCustomerRoleAsync() =>
        _context.Roles.FirstOrDefaultAsync(role => role.Name == "customer" && role.IsActive);

    public Task<User?> GetCustomerLoginAsync(string identifier, string normalizedPhone) =>
        _context.Users.Include(user => user.RoleEntity).Include(user => user.Customer)
            .FirstOrDefaultAsync(user => user.Username == identifier ||
                (user.Customer != null && user.Customer.Phone == normalizedPhone));

    public async Task SaveRegistrationAsync(Customer customer, User user)
    {
        if (customer.Id == 0)
            _context.Customers.Add(customer);
        _context.Users.Add(user);
        await _context.SaveChangesAsync();
    }

    public async Task UpdateLastLoginAsync(int userId, DateTime lastLogin)
    {
        var user = await _context.Users.FindAsync(userId);
        if (user == null) return;
        user.LastLogin = lastLogin;
        await _context.SaveChangesAsync();
    }

    public Task<bool> EmailUsedByOtherAsync(int customerId, string email) =>
        _context.Customers.AnyAsync(item => item.Id != customerId && item.Email == email);

    public Task<bool> UserEmailExistsAsync(string email) =>
        _context.Users.AnyAsync(user => user.Email == email);

    public Task<User?> GetUserByCustomerIdAsync(int customerId) =>
        _context.Users.FirstOrDefaultAsync(user => user.CustomerId == customerId);

    public async Task SaveAccountAsync(Customer customer, User? account)
    {
        await _context.SaveChangesAsync();
    }

    public Task SaveCustomerAsync(Customer customer) => _context.SaveChangesAsync();

    public Task<Order?> GetOrderForPaymentStatusAsync(int orderId)
    {
        return _context.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.Id == orderId);
    }

    public Task<(bool Exists, string? Status)> GetCustomerOrderStatusAsync(int orderId, int customerId)
    {
        return GetCustomerOrderStatusInternalAsync(orderId, customerId);
    }

    public Task<List<Order>> GetCustomerOrdersAsync(int customerId)
    {
        return _context.Orders.AsNoTracking()
            .Include(order => order.OrderItems)
                .ThenInclude(line => line.Product)
            .Where(order => order.CustomerId == customerId)
            .OrderByDescending(order => order.CreatedAt)
            .ThenByDescending(order => order.Id)
            .ToListAsync();
    }

    private async Task<(bool Exists, string? Status)> GetCustomerOrderStatusInternalAsync(int orderId, int customerId)
    {
        var status = await _context.Orders.AsNoTracking()
            .Where(o => o.Id == orderId && o.CustomerId == customerId)
            .Select(o => o.Status)
            .FirstOrDefaultAsync();
        return (status != null, status);
    }

    public Task<List<Category>> GetActiveCategoriesAsync()
    {
        return _context.Categories.AsNoTracking()
            .Where(c => c.IsActive)
            .OrderBy(c => c.Name)
            .ToListAsync();
    }

    public Task<List<Product>> GetAvailableProductsAsync()
    {
        return _context.Products.AsNoTracking()
            .Include(product => product.Category)
            .Include(product => product.Unit)
            .Where(product => product.IsActive && product.StockQuantity > 0)
            .OrderBy(product => product.ProductName)
            .ToListAsync();
    }

    public Task<List<ProductPromotion>> GetActiveProductPromotionsAsync(List<int> productIds, DateTime today)
    {
        return _context.ProductPromotions.AsNoTracking()
            .Include(link => link.Promotion)
            .Where(link => productIds.Contains(link.ProductId) && link.Promotion != null &&
                !link.Promotion.IsDeleted && link.Promotion.Status == "active" &&
                link.Promotion.Type == "product" &&
                (!link.Promotion.StartDate.HasValue || link.Promotion.StartDate.Value.Date <= today) &&
                (!link.Promotion.EndDate.HasValue || link.Promotion.EndDate.Value.Date >= today) &&
                (!link.Promotion.UsageLimit.HasValue || link.Promotion.UsedCount < link.Promotion.UsageLimit))
            .ToListAsync();
    }

    public async Task<Dictionary<int, Product>> GetActiveProductsByIdsAsync(List<int> productIds)
    {
        return await _context.Products
            .Where(product => productIds.Contains(product.Id) && product.IsActive)
            .ToDictionaryAsync(product => product.Id);
    }

    public Task<Promotion?> GetPromotionAsync(int promotionId)
    {
        return _context.Promotions.Include(promotion => promotion.EventDetails)
            .SingleOrDefaultAsync(promotion => promotion.Id == promotionId);
    }

    public Task<IDbContextTransaction> BeginSerializableTransactionAsync() =>
        _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);

    public Task LockCheckoutAsync() => _context.Database.ExecuteSqlRawAsync("""
        DECLARE @result INT;
        EXEC @result = sys.sp_getapplock @Resource = 'storefront-checkout', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
        IF @result < 0 THROW 51000, 'Checkout is busy. Please retry.', 1;
        """);

    public Task LockRegistrationAsync() => _context.Database.ExecuteSqlRawAsync("""
        DECLARE @result INT;
        EXEC @result = sys.sp_getapplock @Resource = 'storefront-registration', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
        IF @result < 0 THROW 51000, 'Registration is busy. Please retry.', 1;
        """);

    public Task<Order?> GetByCheckoutKeyAsync(string key) =>
        _context.Orders.FirstOrDefaultAsync(order => order.CheckoutKey == key);

    public Task<Dictionary<int, Product>> GetTrackedActiveProductsByIdsAsync(List<int> productIds) =>
        _context.Products.Where(product => productIds.Contains(product.Id) && product.IsActive)
            .ToDictionaryAsync(product => product.Id);

    public Task<List<ProductPromotion>> GetTrackedProductPromotionsAsync(List<int> productIds) =>
        _context.ProductPromotions.Include(link => link.Promotion)
            .Where(link => productIds.Contains(link.ProductId)).ToListAsync();

    public void AddOrder(Order order) => _context.Orders.Add(order);
    public void AddInventoryAdjustment(InventoryAdjustment adjustment) => _context.InventoryAdjustments.Add(adjustment);
    public void AddPromotionRedemption(PromotionRedemption redemption) => _context.PromotionRedemptions.Add(redemption);
    public Task SaveChangesAsync() => _context.SaveChangesAsync();

    public async Task<bool> TryReduceStockAsync(int productId, int quantity, DateTime updatedAt)
    {
        var updated = await _context.Products
            .Where(product => product.Id == productId && product.StockQuantity >= quantity)
            .ExecuteUpdateAsync(update => update
                .SetProperty(product => product.StockQuantity, product => product.StockQuantity - quantity)
                .SetProperty(product => product.UpdatedAt, updatedAt));
        return updated == 1;
    }
}
