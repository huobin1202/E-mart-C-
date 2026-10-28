using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using backend.Data;
using backend.DTO;
using backend.Helpers;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Repository
{
    public class ProductRepository
    {
        private readonly AppDbContext _context;

        public ProductRepository(AppDbContext context)
        {
            _context = context;
        }

        public async Task<List<Product>> GetAllForCacheAsync()
        {
            return await _context.Products
                .AsNoTracking()
                .Include(p => p.Category)
                .Include(p => p.Supplier)
                .Include(p => p.Unit)
                .Include(p => p.OrderItems)
                .OrderBy(p => p.Id)
                .ToListAsync();
        }



        // Lấy theo id (include liên quan)
        public async Task<Product?> GetByIdAsync(int id)
        {
            return await _context.Products
                .Include(p => p.Category)
                .Include(p => p.Supplier)
                .Include(p => p.Unit)
                .Include(p => p.OrderItems) // nếu cần thống kê
                .FirstOrDefaultAsync(p => p.Id == id);
        }

        public async Task<Product?> GetByIdForUpdateAsync(int id)
        {
            return await _context.Products
                .AsNoTracking() // tránh tracking conflict
                .Select(p => new Product
                {
                    Id = p.Id,
                    CreatedAt = p.CreatedAt,
                    StockQuantity = p.StockQuantity
                })
                .FirstOrDefaultAsync(p => p.Id == id);
        }

        // Lấy theo SKU (dùng cho import)
        public async Task<Product?> GetBySkuAsync(string? sku)
        {
            if (string.IsNullOrWhiteSpace(sku))
                return null;

            return await _context.Products
                .FirstOrDefaultAsync(p => p.Sku == sku);
        }



        public async Task<Product> CreateAsync(Product product)
        {
            // đảm bảo timestamp nếu cần
            product.CreatedAt = DateTime.UtcNow;
            product.UpdatedAt = DateTime.UtcNow;

            _context.Products.Add(product);
            await _context.SaveChangesAsync();
            return product;
        }

        public async Task<Product> UpdateAsync(Product product)
        {
            product.UpdatedAt = DateTime.UtcNow;
            _context.Products.Update(product);
            await _context.SaveChangesAsync();
            return product;
        }

        public async Task<bool> DeleteAsync(int id)
        {
            var product = await _context.Products.FindAsync(id);
            if (product == null) return false;


            product.IsActive = !product.IsActive;
            product.UpdatedAt = DateTime.UtcNow;

            _context.Products.Update(product);
            await _context.SaveChangesAsync();
            return true;
        }


        public async Task<bool> ExistsBySkuAsync(string sku, int? excludeId = null)
        {
            var q = _context.Products.AsQueryable().Where(p => p.Sku == sku);
            if (excludeId.HasValue) q = q.Where(p => p.Id != excludeId.Value);
            return await q.AnyAsync();
        }

        /// <summary>
        /// Returns each product's best active, product-specific discount. This is
        /// deliberately calculated rather than stored on Product: promotions own
        /// discount rules and can start, end, or reach their usage limit at any time.
        /// </summary>
        public async Task<Dictionary<int, (decimal Amount, string Name)>> GetActiveProductDiscountsAsync(
            IEnumerable<ProductDTO> products)
        {
            var productPrices = products
                .Where(product => product.Id > 0 && product.Price > 0)
                .ToDictionary(product => product.Id, product => product.Price);

            if (productPrices.Count == 0)
                return new Dictionary<int, (decimal Amount, string Name)>();

            var today = DateTimeHelper.ToUtc(DateTimeHelper.VietnamToday);
            var tomorrow = today.AddDays(1);
            var promotions = await (
                from link in _context.ProductPromotions.AsNoTracking()
                join promotion in _context.Promotions.AsNoTracking() on link.PromotionId equals promotion.Id
                where productPrices.Keys.Contains(link.ProductId)
                      && !promotion.IsDeleted
                      && promotion.Status == "active"
                      && promotion.Type == "product"
                      && (!promotion.StartDate.HasValue || promotion.StartDate.Value < tomorrow)
                      && (!promotion.EndDate.HasValue || promotion.EndDate.Value >= today)
                      && (!promotion.UsageLimit.HasValue || promotion.UsedCount < promotion.UsageLimit)
                select new { link.ProductId, promotion.Name, promotion.DiscountType, promotion.Value, promotion.MaxDiscount }
            ).ToListAsync();

            return promotions
                .Select(promotion => new
                {
                    promotion.ProductId,
                    promotion.Name,
                    Amount = CalculateDiscount(
                        productPrices[promotion.ProductId],
                        promotion.DiscountType,
                        promotion.Value,
                        promotion.MaxDiscount)
                })
                .Where(promotion => promotion.Amount > 0)
                .GroupBy(promotion => promotion.ProductId)
                .ToDictionary(
                    group => group.Key,
                    group =>
                    {
                        var best = group.OrderByDescending(promotion => promotion.Amount).First();
                        return (best.Amount, best.Name);
                    });
        }

        private static decimal CalculateDiscount(decimal price, string discountType, decimal value, decimal? maxDiscount)
        {
            var discount = discountType == "percent" ? decimal.Floor(price * value / 100m) : value;
            if (maxDiscount.HasValue) discount = Math.Min(discount, maxDiscount.Value);
            return Math.Clamp(discount, 0, price);
        }

        public async Task<List<Product>> GetByIdsAsync(IEnumerable<int> ids)
        {
            if (!ids.Any()) return new List<Product>();

            return await _context.Products
                .Include(p => p.Category)
                .Include(p => p.Supplier)
                .Include(p => p.Unit)
                .Where(p => ids.Contains(p.Id))
                .AsNoTracking()
                .ToListAsync();
        }

        // Lấy tất cả products để reindex (batch processing)
        public async Task<List<Product>> GetAllForIndexingAsync(int skip = 0, int take = 500)
        {
            return await _context.Products
                .Include(p => p.Category)
                .Include(p => p.Supplier)
                .AsNoTracking()
                .OrderBy(p => p.Id)
                .Skip(skip)
                .Take(take)
                .ToListAsync();
        }

        public async Task<int> GetTotalCountAsync()
        {
            return await _context.Products.CountAsync();
        }

        public async Task<Product?> GetByBarcodeAsync(string barcode)
        {
            if (string.IsNullOrWhiteSpace(barcode))
                return null;

            var clean = barcode.Trim();
            return await _context.Products
                .Include(p => p.Category)
                .Include(p => p.Supplier)
                .Include(p => p.Unit)
                .FirstOrDefaultAsync(p => p.Barcode == clean || p.Sku == clean);
        }
    }
}
