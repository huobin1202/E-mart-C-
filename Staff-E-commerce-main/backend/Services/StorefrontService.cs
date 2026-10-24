using backend.Controllers;
using backend.DTO;
using backend.Helpers;
using backend.Models;
using backend.Repository;

namespace backend.Services;

public sealed class StorefrontService(
    StorefrontRepository repository,
    BusMemoryCache<StorefrontProductDTO> productCache,
    BusMemoryCache<StorefrontCategoryResponse> categoryCache)
{
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(15);

    public Task<bool> UsernameExistsAsync(string username) => repository.UsernameExistsAsync(username);
    public Task<Customer?> GetCustomerByPhoneAsync(string phone, string internationalPhone) => repository.GetCustomerByPhoneAsync(phone, internationalPhone);
    public Task<bool> CustomerHasAccountAsync(int customerId) => repository.CustomerHasAccountAsync(customerId);
    public Task<Role?> GetActiveCustomerRoleAsync() => repository.GetActiveCustomerRoleAsync();
    public Task<User?> GetCustomerLoginAsync(string username) => repository.GetCustomerLoginAsync(username);
    public Task SaveRegistrationAsync(Customer customer, User user) => repository.SaveRegistrationAsync(customer, user);
    public Task UpdateLastLoginAsync(int userId, DateTime lastLogin) => repository.UpdateLastLoginAsync(userId, lastLogin);
    public Task<bool> EmailUsedByOtherAsync(int customerId, string email) => repository.EmailUsedByOtherAsync(customerId, email);
    public Task<User?> GetUserByCustomerIdAsync(int customerId) => repository.GetUserByCustomerIdAsync(customerId);
    public Task SaveAccountAsync(Customer customer, User? account) => repository.SaveAccountAsync(customer, account);
    public Task SaveCustomerAsync(Customer customer) => repository.SaveCustomerAsync(customer);
    public Task<Customer?> GetActiveCustomerAsync(int customerId) => repository.GetActiveCustomerAsync(customerId);

    public Task<Order?> GetOrderForPaymentStatusAsync(int orderId) => repository.GetOrderForPaymentStatusAsync(orderId);

    public Task<(bool Exists, string? Status)> GetCustomerOrderStatusAsync(int orderId, int customerId)
        => repository.GetCustomerOrderStatusAsync(orderId, customerId);

    public Task<List<StorefrontCustomerOrderDTO>> GetCustomerOrdersAsync(int customerId)
        => repository.GetCustomerOrdersAsync(customerId);

    public Task<Dictionary<int, Product>> GetActiveProductsByIdsAsync(List<int> productIds)
        => repository.GetActiveProductsByIdsAsync(productIds);

    public Task<List<StorefrontProductPromotionDTO>> GetActiveProductPromotionsAsync(List<int> productIds, DateTime today)
        => repository.GetActiveProductPromotionsAsync(productIds, today);

    public Task<Promotion?> GetPromotionAsync(int promotionId) => repository.GetPromotionAsync(promotionId);

    public Task<Customer> AddCustomerAsync(Customer customer) => repository.AddCustomerAsync(customer);

    public async Task SaveOrderAndReduceInventoryAsync(
        Order order,
        Promotion? appliedPromotion,
        List<(int ProductId, int Quantity)> requestedLines,
        IReadOnlyDictionary<int, string> productNames)
    {
        await repository.SaveOrderAndReduceInventoryAsync(order, appliedPromotion, requestedLines, productNames);
        productCache.Clear();
    }

    public async Task<List<StorefrontProductDTO>> GetAvailableProductsAsync()
    {
        var (products, _) = await productCache.GetOrCreateAsync(async () =>
        {
            var loadedProducts = await repository.GetAvailableProductsAsync();
            var promotions = await repository.GetActiveProductPromotionsAsync(
                loadedProducts.Select(product => product.Id).ToList(), DateTimeHelper.VietnamToday);
            foreach (var product in loadedProducts)
            {
                var best = promotions.Where(promotion => promotion.ProductId == product.Id)
                    .Select(promotion => new
                    {
                        Promotion = promotion,
                        Discount = CalculateProductDiscount(product.OriginalPrice, promotion.DiscountType, promotion.Value, promotion.MaxDiscount)
                    })
                    .OrderByDescending(item => item.Discount)
                    .FirstOrDefault();
                if (best == null || best.Discount <= 0) continue;
                product.Price = Math.Max(0, product.OriginalPrice - best.Discount);
                product.PromotionName = best.Promotion.Name;
                product.DiscountAmount = best.Discount;
                product.DiscountPercent = product.OriginalPrice == 0 ? 0 : Math.Round(best.Discount / product.OriginalPrice * 100, 0);
                product.PromotionEndsAt = best.Promotion.EndDate;
            }
            return loadedProducts;
        }, CacheTtl);
        return products.ToList();
    }

    private static decimal CalculateProductDiscount(decimal price, string discountType, decimal value, decimal? maxDiscount)
    {
        var discount = discountType == "percent" ? price * value / 100m : value;
        if (maxDiscount.HasValue) discount = Math.Min(discount, maxDiscount.Value);
        return Math.Min(price, discount);
    }

    public async Task<List<StorefrontCategoryResponse>> GetActiveCategoriesAsync()
    {
        var (categories, _) = await categoryCache.GetOrCreateAsync(async () =>
        {
            var loaded = await repository.GetActiveCategoriesAsync();
            return loaded.Select(category => new StorefrontCategoryResponse { Id = category.Id, Name = category.Name }).ToList();
        }, CacheTtl);
        return categories.ToList();
    }
}
