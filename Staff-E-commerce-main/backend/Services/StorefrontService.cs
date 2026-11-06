using backend.DTO;
using backend.Helpers;
using backend.Repository;

namespace backend.Services;

public sealed class StorefrontService(
    StorefrontRepository repository,
    BusMemoryCache<StorefrontCategoryDTO> categoryCache,
    BusMemoryCache<StorefrontProductDTO> productCache)
{
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan CatalogTtl = TimeSpan.FromSeconds(30);

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

    /// <summary>
    /// The whole storefront catalogue is built once and kept in RAM. List, page, flash sale, detail and the app's
    /// search all reuse this one list instead of querying SQL per request. Any write request (new product, order,
    /// stock adjustment, payment...) clears it through ReadCacheInvalidationFilter, so stock and new products show
    /// up on the next read; the short TTL covers promotions that start or end by the clock.
    /// </summary>
    private async Task<IReadOnlyList<StorefrontProductDTO>> GetCatalogAsync()
    {
        var (items, _) = await productCache.GetOrCreateAsync(async () =>
        {
            var products = await MapProductsAsync(await repository.GetSellableProductsAsync());
            var sold = await repository.GetSoldQuantitiesAsync(DateTimeHelper.UtcNow.AddDays(-30));
            foreach (var product in products) product.SoldCount = sold.GetValueOrDefault(product.Id);
            foreach (var product in products.Where(p => p.SoldCount > 0).OrderByDescending(p => p.SoldCount).Take(10))
                product.IsBestSeller = true;
            // In-stock items first; out-of-stock items stay visible with a "Hết hàng" label.
            return products.OrderBy(product => product.StockQuantity > 0 ? 0 : 1).ToList();
        }, CatalogTtl);
        return items;
    }

    public async Task<List<StorefrontProductDTO>> GetAvailableProductsAsync() => (await GetCatalogAsync()).ToList();

    public async Task<StorefrontProductPageDTO> GetAvailableProductsPageAsync(int page, int pageSize, bool discountedOnly)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        IEnumerable<StorefrontProductDTO> catalog = await GetCatalogAsync();
        if (discountedOnly) catalog = catalog.Where(product => product.DiscountAmount > 0 && product.StockQuantity > 0);
        var filtered = catalog as IReadOnlyCollection<StorefrontProductDTO> ?? catalog.ToList();
        return new StorefrontProductPageDTO
        {
            Items = filtered.Skip((page - 1) * pageSize).Take(pageSize).ToList(),
            Page = page,
            PageSize = pageSize,
            TotalItems = filtered.Count
        };
    }

    public async Task<StorefrontProductDTO?> GetAvailableProductAsync(int productId) =>
        (await GetCatalogAsync()).FirstOrDefault(product => product.Id == productId);

    private async Task<List<StorefrontProductDTO>> MapProductsAsync(List<backend.Models.Product> entities)
    {
        var products = entities.Select(product => new StorefrontProductDTO
        {
            Id = product.Id,
            ProductName = product.ProductName,
            Description = product.Description,
            CategoryId = product.CategoryId,
            CategoryName = product.Category?.Name,
            Region = product.Supplier?.Region ?? ProductService.GetSupplierRegion(product.Supplier?.Address),
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
