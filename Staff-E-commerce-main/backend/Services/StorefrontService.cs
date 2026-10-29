using backend.DTO;
using backend.Helpers;
using backend.Repository;

namespace backend.Services;

public sealed class StorefrontService(
    StorefrontRepository repository,
    BusMemoryCache<StorefrontCategoryDTO> categoryCache)
{
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(15);

    public Task<(bool Exists, string? Status)> GetCustomerOrderStatusAsync(int orderId, int customerId)
        => repository.GetCustomerOrderStatusAsync(orderId, customerId);

    public async Task<List<StorefrontCustomerOrderDTO>> GetCustomerOrdersAsync(int customerId)
    {
        var orders = await repository.GetCustomerOrdersAsync(customerId);
        return orders.Select(order => new StorefrontCustomerOrderDTO
        {
            Id = order.Id,
            OrderNumber = order.OrderNumber,
            OrderType = order.OrderNumber.StartsWith("WEB-", StringComparison.Ordinal) ? "mobile" : order.OrderType,
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
                ProductName = line.Product?.ProductName ?? "Sản phẩm",
                ImageUrl = line.Product?.ImageUrl,
                Quantity = line.Quantity,
                UnitPrice = line.UnitPrice,
                TotalPrice = line.TotalPrice
            }).ToList()
        }).ToList();
    }

    public async Task<List<StorefrontProductDTO>> GetAvailableProductsAsync()
    {
        var entities = await repository.GetAvailableProductsAsync();
        var products = entities.Select(product => new StorefrontProductDTO
        {
            Id = product.Id,
            ProductName = product.ProductName,
            Description = product.Description,
            CategoryId = product.CategoryId,
            CategoryName = product.Category?.Name,
            Price = SalePricing.Price(product.Price),
            OriginalPrice = SalePricing.Price(product.Price),
            UnitName = product.Unit?.Name,
            StockQuantity = product.StockQuantity,
            ImageUrl = product.ImageUrl
        }).ToList();
        var promotions = await repository.GetActiveProductPromotionsAsync(
            products.Select(product => product.Id).ToList(), DateTimeHelper.VietnamToday);
        foreach (var product in products)
        {
            var best = promotions.Where(promotion => promotion.ProductId == product.Id)
                .Select(promotion => new
                {
                    Promotion = promotion,
                    Discount = promotion.Promotion == null ? 0 : SalePricing.Discount(promotion.Promotion, product.OriginalPrice)
                })
                .OrderByDescending(item => item.Discount)
                .FirstOrDefault();
            if (best == null || best.Discount <= 0) continue;
            product.Price = Math.Max(0, product.OriginalPrice - best.Discount);
            product.PromotionName = best.Promotion.Promotion?.Name;
            product.DiscountAmount = best.Discount;
            product.DiscountPercent = product.OriginalPrice == 0 ? 0 : Math.Round(best.Discount / product.OriginalPrice * 100, 0);
            product.PromotionEndsAt = best.Promotion.Promotion?.EndDate;
        }
        return products;
    }

    public async Task<List<StorefrontCategoryDTO>> GetActiveCategoriesAsync()
    {
        var (categories, _) = await categoryCache.GetOrCreateAsync(async () =>
        {
            var loaded = await repository.GetActiveCategoriesAsync();
            return loaded.Select(category => new StorefrontCategoryDTO { Id = category.Id, Name = category.Name }).ToList();
        }, CacheTtl);
        return categories.ToList();
    }
}
