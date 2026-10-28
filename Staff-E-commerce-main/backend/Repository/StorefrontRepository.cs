using backend.Data;
using backend.DTO;
using backend.Models;
using Microsoft.EntityFrameworkCore;

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
        if (account != null)
        {
            account.FullName = customer.FullName;
            account.Email = customer.Email;
            account.UpdatedAt = DateTime.UtcNow;
        }
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

    public Task<List<StorefrontCustomerOrderDTO>> GetCustomerOrdersAsync(int customerId)
    {
        return _context.Orders.AsNoTracking()
            .Where(order => order.CustomerId == customerId)
            .OrderByDescending(order => order.CreatedAt)
            .ThenByDescending(order => order.Id)
            .Select(order => new StorefrontCustomerOrderDTO
            {
                Id = order.Id,
                OrderNumber = order.OrderNumber,
                OrderType = order.OrderNumber.StartsWith("WEB-") ? "mobile" : order.OrderType,
                Status = order.Status,
                PaymentStatus = order.PaymentStatus,
                PaymentMethod = order.PaymentMethod,
                Subtotal = order.Subtotal,
                Discount = order.Discount,
                TotalAmount = order.TotalAmount,
                Note = order.Note,
                RecipientName = order.RecipientName,
                RecipientPhone = order.RecipientPhone,
                ShippingAddress = order.ShippingAddress,
                CreatedAt = order.CreatedAt,
                Items = order.OrderItems.Select(line => new StorefrontCustomerOrderItemDTO
                {
                    ProductId = line.ProductId,
                    ProductName = line.Product != null ? line.Product.ProductName : "Sản phẩm",
                    ImageUrl = line.Product != null ? line.Product.ImageUrl : null,
                    Quantity = line.Quantity,
                    UnitPrice = line.UnitPrice,
                    TotalPrice = line.TotalPrice
                }).ToList()
            })
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

    public Task<List<StorefrontProductDTO>> GetAvailableProductsAsync()
    {
        return _context.Products.AsNoTracking()
            .Where(product => product.IsActive && product.StockQuantity > 0)
            .OrderBy(product => product.ProductName)
            .Select(product => new StorefrontProductDTO
            {
                Id = product.Id, ProductName = product.ProductName, Description = product.Description,
                CategoryId = product.CategoryId, CategoryName = product.Category != null ? product.Category.Name : null,
                Price = product.Price, OriginalPrice = product.Price,
                UnitName = product.Unit != null ? product.Unit.Name : null,
                StockQuantity = product.StockQuantity,
                ImageUrl = product.ImageUrl
            }).ToListAsync();
    }

    public Task<List<StorefrontProductPromotionDTO>> GetActiveProductPromotionsAsync(List<int> productIds, DateTime today)
    {
        return (from link in _context.ProductPromotions.AsNoTracking()
                join promotion in _context.Promotions.AsNoTracking() on link.PromotionId equals promotion.Id
                where productIds.Contains(link.ProductId) && !promotion.IsDeleted && promotion.Status == "active" &&
                      promotion.Type == "product" &&
                      (!promotion.StartDate.HasValue || promotion.StartDate.Value.Date <= today) &&
                      (!promotion.EndDate.HasValue || promotion.EndDate.Value.Date >= today) &&
                      (!promotion.UsageLimit.HasValue || promotion.UsedCount < promotion.UsageLimit)
                select new StorefrontProductPromotionDTO
                {
                    ProductId = link.ProductId, Name = promotion.Name, DiscountType = promotion.DiscountType,
                    Value = promotion.Value, MaxDiscount = promotion.MaxDiscount, EndDate = promotion.EndDate
                }).ToListAsync();
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

    public async Task<Customer> AddCustomerAsync(Customer customer)
    {
        _context.Customers.Add(customer);
        await _context.SaveChangesAsync();
        return customer;
    }

    public async Task SaveOrderAndReduceInventoryAsync(
        Order order,
        Promotion? appliedPromotion,
        List<(int ProductId, int Quantity)> requestedLines,
        IReadOnlyDictionary<int, string> productNames)
    {
        await using var transaction = await _context.Database.BeginTransactionAsync();
        try
        {
            _context.Orders.Add(order);
            if (appliedPromotion != null)
                appliedPromotion.UsedCount++;
            await _context.SaveChangesAsync();

            foreach (var line in requestedLines)
            {
                var updated = await _context.Products
                    .Where(product => product.Id == line.ProductId && product.StockQuantity >= line.Quantity)
                    .ExecuteUpdateAsync(update => update
                        .SetProperty(product => product.StockQuantity, product => product.StockQuantity - line.Quantity)
                        .SetProperty(product => product.UpdatedAt, DateTime.UtcNow));
                if (updated != 1)
                    throw new InvalidOperationException($"Sản phẩm {productNames[line.ProductId]} vừa hết hàng hoặc không đủ số lượng.");
            }

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }
}
