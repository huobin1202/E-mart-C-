using backend.Data;
using backend.Models;
using backend.Helpers;
using Microsoft.EntityFrameworkCore;

namespace backend.Repository
{
    public class PromotionRepository
    {
        private readonly AppDbContext _context;

        public PromotionRepository(AppDbContext context)
        {
            _context = context;
        }

        // Get all promotions
        public async Task<List<Promotion>> GetAllAsync()
        {
            var promotions = await PromotionsWithDetails()
                .AsNoTracking()
                .Where(p => !p.IsDeleted)
                .Include(p => p.EventDetails).Include(p => p.VoucherDetails).Include(p => p.ProductDetails)
                .OrderByDescending(p => p.CreatedAt)
                .ToListAsync();

            return PopulateDiscountFields(promotions);
        }

        // Get paginated promotions with search and filter
        public async Task<PaginationResult<Promotion>> GetPaginatedAsync(
            int page, 
            int pageSize, 
            string? search = null, 
            string? status = null, 
            string? type = null)
        {
            if (page < 1) page = 1;
            if (pageSize <= 0) pageSize = 20;

            IQueryable<Promotion> query = _context.Promotions
                .AsNoTracking()
                .Where(p => !p.IsDeleted)
                .Include(p => p.EventDetails).Include(p => p.VoucherDetails).Include(p => p.ProductDetails);

            // Search by code
            if (!string.IsNullOrWhiteSpace(search))
            {
                query = query.Where(p => p.Name.ToLower().Contains(search.ToLower()) ||
                    (p.VoucherDetails != null && p.VoucherDetails.VoucherCode.ToLower().Contains(search.ToLower())));
            }

            // Filter by type
            if (!string.IsNullOrWhiteSpace(type) && type != "all")
            {
                query = type is "event" or "voucher" or "product"
                    ? query.Where(p => p.Type == type)
                    : query.Where(p => p.DiscountType == type);
            }

            // Filter by status - sử dụng DateTimeHelper để thống nhất timezone
            var vnToday = DateTimeHelper.VietnamToday;
            if (!string.IsNullOrWhiteSpace(status) && status != "all")
            {
                query = status switch
                {
                    "active" => query.Where(p => p.Status == "active" &&
                        (!p.StartDate.HasValue || p.StartDate.Value.Date <= vnToday) &&
                        (!p.EndDate.HasValue || p.EndDate.Value.Date >= vnToday) &&
                        (!p.UsageLimit.HasValue || p.UsedCount < p.UsageLimit)),
                    "inactive" => query.Where(p => p.Status != "active"),
                    "expired" => query.Where(p => p.EndDate.HasValue && p.EndDate.Value.Date < vnToday),
                    "scheduled" => query.Where(p => p.Status == "active" &&
                        p.StartDate.HasValue && p.StartDate.Value.Date > vnToday &&
                        (!p.EndDate.HasValue || p.EndDate.Value.Date >= vnToday) &&
                        (!p.UsageLimit.HasValue || p.UsedCount < p.UsageLimit)),
                    _ => query
                };
            }

            var totalItems = await query.CountAsync();
            var totalPages = (int)Math.Ceiling((double)totalItems / pageSize);

            var items = await query
                .OrderByDescending(p => p.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            PopulateDiscountFields(items);

            return new PaginationResult<Promotion>
            {
                Items = items,
                TotalItems = totalItems,
                CurrentPage = page,
                PageSize = pageSize,
                TotalPages = totalPages,
                HasPrevious = page > 1,
                HasNext = page < totalPages
            };
        }

        // Get promotion by ID
        public async Task<Promotion?> GetByIdAsync(int id)
        {
            var promotion = await PromotionsWithDetails()
                .AsNoTracking()
                .Include(p => p.EventDetails).Include(p => p.VoucherDetails).Include(p => p.ProductDetails)
                .FirstOrDefaultAsync(p => p.Id == id && !p.IsDeleted);

            return promotion == null ? null : PopulateDiscountFields(new List<Promotion> { promotion }).Single();
        }

        // Get promotion by code
        public async Task<Promotion?> GetByCodeAsync(string code)
        {
            var promotion = await PromotionsWithDetails()
                .AsNoTracking()
                .Include(p => p.EventDetails).Include(p => p.VoucherDetails).Include(p => p.ProductDetails)
                .FirstOrDefaultAsync(p => p.VoucherDetails != null &&
                    p.VoucherDetails.VoucherCode.ToUpper() == code.Trim().ToUpper() && !p.IsDeleted);
            return promotion == null ? null : PopulateDiscountFields(new List<Promotion> { promotion }).Single();
        }

        // Create promotion
        public async Task<Promotion> CreateAsync(Promotion promotion)
        {
            promotion.CreatedAt = DateTimeHelper.UtcNow;
            promotion.UpdatedAt = DateTimeHelper.UtcNow;

            await using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                _context.Promotions.Add(promotion);
                await _context.SaveChangesAsync();
                AddPromotionDetail(promotion);
                await _context.SaveChangesAsync();
                await transaction.CommitAsync();
                return promotion;
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        }

        // Update promotion
        public async Task<Promotion> UpdateAsync(Promotion promotion)
        {
            var existing = await _context.Promotions
                .Include(p => p.EventDetails).Include(p => p.VoucherDetails).Include(p => p.ProductDetails)
                .FirstOrDefaultAsync(p => p.Id == promotion.Id);
            if (existing == null) throw new InvalidOperationException("Promotion not found");

            if (existing.ProductDetails != null) _context.ProductPromotions.RemoveRange(existing.ProductDetails);
            if (existing.EventDetails != null) _context.EventPromotions.Remove(existing.EventDetails);
            if (existing.VoucherDetails != null) _context.VoucherPromotions.Remove(existing.VoucherDetails);
            _context.Entry(existing).CurrentValues.SetValues(promotion);
            existing.EventDetails = promotion.EventDetails;
            existing.VoucherDetails = promotion.VoucherDetails;
            existing.ProductDetails = promotion.ProductDetails;
            promotion.UpdatedAt = DateTimeHelper.UtcNow;
            existing.UpdatedAt = promotion.UpdatedAt;
            await _context.SaveChangesAsync();
            return existing;
        }

        // Soft delete promotion
        public async Task<bool> DeleteAsync(int id)
        {
            var promotion = await _context.Promotions.FirstOrDefaultAsync(p => p.Id == id);
            if (promotion == null) return false;

            promotion.IsDeleted = true;
            promotion.DeletedAt = DateTimeHelper.UtcNow;
            _context.Promotions.Update(promotion);
            await _context.SaveChangesAsync();
            return true;
        }

        // Get active promotions
        public async Task<List<Promotion>> GetActivePromotionsAsync()
        {
            var vnToday = DateTimeHelper.VietnamToday;
            var promotions = await PromotionsWithDetails()
                .AsNoTracking()
                .Include(p => p.EventDetails).Include(p => p.VoucherDetails).Include(p => p.ProductDetails)
                .Where(p => !p.IsDeleted &&
                           p.Status == "active" && p.Type != "product" &&
                           (!p.StartDate.HasValue || p.StartDate.Value.Date <= vnToday) &&
                           (!p.EndDate.HasValue || p.EndDate.Value.Date >= vnToday) &&
                           (!p.UsageLimit.HasValue || p.UsedCount < p.UsageLimit))
                .ToListAsync();

            return PopulateDiscountFields(promotions);
        }

        private IQueryable<Promotion> PromotionsWithDetails()
        {
            return _context.Promotions
                .Include(p => p.EventDetails)
                .Include(p => p.VoucherDetails)
                .Include(p => p.ProductDetails);
        }

        private static List<Promotion> PopulateDiscountFields(List<Promotion> promotions)
        {
            foreach (var promotion in promotions)
            {
                promotion.Active = promotion.Status == "active";
                promotion.ProductIds = promotion.ProductDetails?.Select(detail => detail.ProductId).ToList() ?? new List<int>();
                promotion.VoucherCode = promotion.VoucherDetails?.VoucherCode;
                promotion.MinOrderAmount = promotion.EventDetails?.MinOrderAmount ?? 0;
            }

            return promotions;
        }

        private void AddPromotionDetail(Promotion promotion)
        {
            switch (promotion.Type)
            {
                case "event":
                    promotion.EventDetails = new EventPromotion
                    {
                        PromotionId = promotion.Id,
                        MinOrderAmount = promotion.MinOrderAmount
                    };
                    _context.EventPromotions.Add(promotion.EventDetails);
                    break;

                case "voucher":
                    promotion.VoucherDetails = new VoucherPromotion
                    {
                        PromotionId = promotion.Id,
                        VoucherCode = string.IsNullOrWhiteSpace(promotion.VoucherCode) ? promotion.Code : promotion.VoucherCode
                    };
                    _context.VoucherPromotions.Add(promotion.VoucherDetails);
                    break;

                case "product":
                    var productIds = promotion.ProductIds.Distinct().ToList();
                    if (productIds.Count == 0)
                        throw new ArgumentException("At least one product is required for a product promotion");

                    promotion.ProductDetails = productIds.Select(productId => new ProductPromotion
                    {
                        PromotionId = promotion.Id,
                        ProductId = productId
                    }).ToList();
                    _context.ProductPromotions.AddRange(promotion.ProductDetails);
                    break;

                default:
                    throw new ArgumentException("Promotion kind must be event, voucher, or product");
            }
        }

        // Get redemptions for a promotion
        public async Task<List<PromotionRedemption>> GetRedemptionsAsync(int promotionId)
        {
            return await _context.PromotionRedemptions
                .AsNoTracking()
                .Where(pr => pr.PromotionId == promotionId)
                .Include(pr => pr.Customer)
                .Include(pr => pr.Order)
                .OrderByDescending(pr => pr.RedeemedAt)
                .ToListAsync();
        }

        // Increment used count
        public async Task<bool> IncrementUsedCountAsync(int promotionId)
        {
            var promotion = await _context.Promotions.FindAsync(promotionId);
            if (promotion == null) return false;

            promotion.UsedCount++;
            promotion.UpdatedAt = DateTimeHelper.UtcNow;

            await _context.SaveChangesAsync();
            return true;
        }

        // Add redemption record
        public async Task<PromotionRedemption> AddRedemptionAsync(PromotionRedemption redemption)
        {
            redemption.RedeemedAt = DateTimeHelper.UtcNow;
            _context.PromotionRedemptions.Add(redemption);
            await _context.SaveChangesAsync();
            return redemption;
        }

        /// <summary>
        /// Áp dụng khuyến mãi cho một đơn hàng đã tạo (alternative method for POS)
        /// </summary>
        public async Task ApplyPromotionAsync(Order order)
        {
            if (!order.PromotionId.HasValue) return;

            using var transaction = await _context.Database.BeginTransactionAsync();

            try
            {
                var promo = await GetByIdAsync(order.PromotionId.Value);
                if (promo == null)
                    throw new Exception("Khuyến mãi không tồn tại");

                if (promo.UsageLimit.HasValue && promo.UsedCount >= promo.UsageLimit.Value)
                    throw new Exception("Khuyến mãi đã hết lượt sử dụng");

                promo.UsedCount += 1;
                _context.Promotions.Update(promo);

                var redemption = new PromotionRedemption
                {
                    PromotionId = promo.Id,
                    CustomerId = order.CustomerId,
                    OrderId = order.Id,
                    RedeemedAt = DateTimeHelper.UtcNow
                };
                await _context.PromotionRedemptions.AddAsync(redemption);

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
}
