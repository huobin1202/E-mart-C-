using backend.Models;
using backend.Repository;
using backend.DTO;
using backend.Helpers;

namespace backend.Services
{
    public class PromotionService
    {
        private readonly PromotionRepository _promotionRepository;
        private readonly BusMemoryCache<PromotionDTO> _cache;
        private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(15);

        public PromotionService(PromotionRepository promotionRepository, BusMemoryCache<PromotionDTO> cache)
        {
            _promotionRepository = promotionRepository;
            _cache = cache;
        }

        // Get all promotions
        public async Task<List<PromotionDTO>> GetAllPromotionsAsync()
        {
            var (promotions, _) = await _cache.GetOrCreateAsync(async () =>
            {
                var loaded = await _promotionRepository.GetAllAsync();
                return loaded.Select(MapToDTO).ToList();
            }, CacheTtl);
            return promotions.ToList();
        }

        // Get paginated promotions with search and filter
        public async Task<PaginationResult<PromotionDTO>> GetPaginatedPromotionsAsync(
            int page, 
            int pageSize, 
            string? search = null, 
            string? status = null, 
            string? type = null)
        {
            var all = await GetAllPromotionsAsync();
            IEnumerable<PromotionDTO> filtered = all;
            if (!string.IsNullOrWhiteSpace(search))
            {
                var keyword = search.Trim();
                filtered = filtered.Where(item => item.Name.Contains(keyword, StringComparison.OrdinalIgnoreCase) ||
                    (item.VoucherCode?.Contains(keyword, StringComparison.OrdinalIgnoreCase) ?? false));
            }
            if (!string.IsNullOrWhiteSpace(type) && type != "all")
                filtered = type is "event" or "voucher" or "product"
                    ? filtered.Where(item => item.Type == type)
                    : filtered.Where(item => item.DiscountType == type);
            if (!string.IsNullOrWhiteSpace(status) && status != "all")
            {
                var today = DateTimeHelper.VietnamToday;
                filtered = status switch
                {
                    "active" => filtered.Where(item => item.Status == "active" &&
                        (!item.StartDate.HasValue || item.StartDate.Value.Date <= today) &&
                        (!item.EndDate.HasValue || item.EndDate.Value.Date >= today) &&
                        (!item.UsageLimit.HasValue || item.UsedCount < item.UsageLimit)),
                    "inactive" => filtered.Where(item => item.Status != "active"),
                    "expired" => filtered.Where(item => item.EndDate.HasValue && item.EndDate.Value.Date < today),
                    "scheduled" => filtered.Where(item => item.Status == "active" && item.StartDate.HasValue && item.StartDate.Value.Date > today),
                    _ => filtered
                };
            }
            var totalItems = filtered.Count();
            var totalPages = Math.Max(1, (int)Math.Ceiling(totalItems / (double)pageSize));
            page = Math.Min(Math.Max(page, 1), totalPages);
            var items = filtered.Skip((page - 1) * pageSize).Take(pageSize).ToList();
            return new PaginationResult<PromotionDTO>
            {
                Items = items, TotalItems = totalItems, CurrentPage = page, PageSize = pageSize,
                TotalPages = totalPages, HasPrevious = page > 1, HasNext = page < totalPages
            };
        }

        // Get promotion by ID
        public async Task<PromotionDTO?> GetPromotionByIdAsync(int id)
        {
            if (id <= 0) throw new ArgumentException("ID must be greater than 0", nameof(id));
            var promotion = await _promotionRepository.GetByIdAsync(id);
            return promotion != null ? MapToDTO(promotion) : null;
        }

        // Get promotion by code
        public async Task<PromotionDTO?> GetPromotionByCodeAsync(string code)
        {
            if (string.IsNullOrWhiteSpace(code)) throw new ArgumentException("Code is required", nameof(code));
            var promotion = await _promotionRepository.GetByCodeAsync(code);
            return promotion != null ? MapToDTO(promotion) : null;
        }

        // Create promotion
        public async Task<PromotionDTO> CreatePromotionAsync(PromotionDTO request)
        {
            var promotion = BuildPromotion(request);
            promotion.Code = $"PROMO-{Guid.NewGuid():N}".ToUpperInvariant();
            // Validation
            if (string.IsNullOrWhiteSpace(promotion.Name))
                throw new ArgumentException("Name is required", nameof(promotion.Name));
            if (promotion.Type == "voucher" && string.IsNullOrWhiteSpace(promotion.VoucherDetails?.VoucherCode))
                throw new ArgumentException("Voucher code is required");
            if (promotion.Type == "product" && (promotion.ProductDetails == null || !promotion.ProductDetails.Any()))
                throw new ArgumentException("Select at least one product");
            if (!promotion.StartDate.HasValue || !promotion.EndDate.HasValue)
                throw new ArgumentException("Start date and end date are required");

            if (string.IsNullOrWhiteSpace(promotion.Name))
                promotion.Name = promotion.Code;

            promotion.StartDate ??= DateTimeHelper.VietnamToday;
            promotion.EndDate ??= promotion.StartDate;
            promotion.Status = promotion.Active ? "active" : "disabled";

            if (promotion.Value <= 0)
                throw new ArgumentException("Value must be greater than 0", nameof(promotion.Value));

            if (!new[] { "product", "event", "voucher" }.Contains(promotion.Type))
                throw new ArgumentException("Type must be product, event, or voucher", nameof(promotion.Type));
            if (!new[] { "percent", "fixed" }.Contains(promotion.DiscountType))
                throw new ArgumentException("DiscountType must be percent or fixed", nameof(promotion.DiscountType));
            if (promotion.DiscountType == "percent" && promotion.Value > 100)
                throw new ArgumentException("Percent value cannot exceed 100", nameof(promotion.Value));

            if (promotion.StartDate.HasValue && promotion.EndDate.HasValue && promotion.StartDate > promotion.EndDate)
                throw new ArgumentException("Start date must be before end date");

            if (promotion.Type == "voucher")
            {
                promotion.VoucherDetails!.VoucherCode = promotion.VoucherDetails.VoucherCode.Trim().ToUpperInvariant();
                var existing = await _promotionRepository.GetByCodeAsync(promotion.VoucherDetails.VoucherCode);
                if (existing != null)
                    throw new ArgumentException($"Voucher code '{promotion.VoucherDetails.VoucherCode}' already exists");
            }

            var created = await _promotionRepository.CreateAsync(promotion);
            _cache.Clear();
            return MapToDTO(created);
        }

        // Update promotion
        public async Task<PromotionDTO> UpdatePromotionAsync(int id, PromotionDTO request)
        {
            var promotion = BuildPromotion(request);
            promotion.Id = id;
            var existing = await _promotionRepository.GetByIdAsync(promotion.Id);
            if (existing == null)
                throw new ArgumentException("Promotion not found", nameof(promotion.Id));

            // Validation
            if (promotion.Value <= 0)
                throw new ArgumentException("Value must be greater than 0", nameof(promotion.Value));

            if (!new[] { "product", "event", "voucher" }.Contains(promotion.Type))
                throw new ArgumentException("Type must be product, event, or voucher", nameof(promotion.Type));
            if (!new[] { "percent", "fixed" }.Contains(promotion.DiscountType))
                throw new ArgumentException("DiscountType must be percent or fixed", nameof(promotion.DiscountType));
            if (string.IsNullOrWhiteSpace(promotion.Name))
                throw new ArgumentException("Name is required", nameof(promotion.Name));
            if (promotion.Type == "voucher" && string.IsNullOrWhiteSpace(promotion.VoucherDetails?.VoucherCode))
                throw new ArgumentException("Voucher code is required");
            if (promotion.Type == "product" && (promotion.ProductDetails == null || !promotion.ProductDetails.Any()))
                throw new ArgumentException("Select at least one product");
            if (!promotion.StartDate.HasValue || !promotion.EndDate.HasValue)
                throw new ArgumentException("Start date and end date are required");
            if (promotion.DiscountType == "percent" && promotion.Value > 100)
                throw new ArgumentException("Percent value cannot exceed 100", nameof(promotion.Value));

            if (promotion.StartDate.HasValue && promotion.EndDate.HasValue && promotion.StartDate > promotion.EndDate)
                throw new ArgumentException("Start date must be before end date");

            // Check if changing code conflicts with another promotion
            promotion.Code = existing.Code; // Internal identifier; customer-facing codes belong to vouchers only.
            if (promotion.Type == "voucher")
            {
                promotion.VoucherDetails!.VoucherCode = promotion.VoucherDetails.VoucherCode.Trim().ToUpperInvariant();
                var duplicate = await _promotionRepository.GetByCodeAsync(promotion.VoucherDetails.VoucherCode);
                if (duplicate != null && duplicate.Id != promotion.Id)
                    throw new ArgumentException($"Voucher code '{promotion.VoucherDetails.VoucherCode}' already exists");
            }

            promotion.CreatedAt = existing.CreatedAt;
            promotion.UsedCount = existing.UsedCount;
            promotion.UpdatedAt = DateTimeHelper.UtcNow;
            promotion.Name = string.IsNullOrWhiteSpace(promotion.Name) ? existing.Name : promotion.Name;
            promotion.StartDate ??= existing.StartDate;
            promotion.EndDate ??= existing.EndDate;
            promotion.Status = promotion.Status is "active" or "expired" or "disabled"
                ? promotion.Status
                : promotion.Active ? "active" : "disabled";
            var updated = await _promotionRepository.UpdateAsync(promotion);
            _cache.Clear();
            return MapToDTO(updated);
        }

        private static Promotion BuildPromotion(PromotionDTO request)
        {
            var promotion = new Promotion
            {
                Name = request.Name,
                Type = request.Type,
                DiscountType = request.DiscountType,
                Value = request.Value,
                MinOrderAmount = request.MinOrderAmount,
                MaxDiscount = request.MaxDiscount,
                StartDate = request.StartDate,
                EndDate = request.EndDate,
                UsageLimit = request.UsageLimit,
                Active = request.Active,
                Status = request.Status ?? (request.Active ? "active" : "disabled"),
                Description = request.Description
            };
            promotion.VoucherDetails = promotion.Type == "voucher" && !string.IsNullOrWhiteSpace(request.VoucherCode)
                ? new VoucherPromotion
                {
                    VoucherCode = request.VoucherCode.Trim().ToUpperInvariant(),
                    DiscountPercent = promotion.DiscountType == "percent" ? promotion.Value : null
                }
                : null;
            promotion.EventDetails = promotion.Type == "event"
                ? new EventPromotion
                {
                    MinOrderAmount = request.MinOrderAmount,
                    DiscountPercent = promotion.DiscountType == "percent" ? promotion.Value : null
                }
                : null;
            promotion.ProductDetails = promotion.Type == "product"
                ? request.ProductIds.Distinct().Select(productId => new ProductPromotion
                {
                    ProductId = productId,
                    DiscountPercent = promotion.DiscountType == "percent" ? promotion.Value : null
                }).ToList()
                : null;
            return promotion;
        }

        // Delete promotion
        public async Task<bool> DeletePromotionAsync(int id)
        {
            if (id <= 0) throw new ArgumentException("ID must be greater than 0", nameof(id));
            var deleted = await _promotionRepository.DeleteAsync(id);
            if (deleted) _cache.Clear();
            return deleted;
        }

        // Toggle active status
        public async Task<bool> ToggleActiveAsync(int id)
        {
            var promotion = await _promotionRepository.GetByIdAsync(id);
            if (promotion == null) return false;

            promotion.Status = promotion.Status == "disabled" ? "active" : "disabled";
            await _promotionRepository.UpdateAsync(promotion);
            _cache.Clear();
            return true;
        }

        public async Task<List<ProductPromotionAvailabilityDTO>> GetProductSelectionLocksAsync(
            DateTime? startDate,
            DateTime? endDate,
            int? excludePromotionId = null)
        {
            var start = (startDate ?? DateTimeHelper.VietnamToday).Date;
            var end = (endDate ?? start).Date;
            if (end < start) throw new ArgumentException("End date must not be before start date.");

            return await _promotionRepository.GetProductSelectionLocksAsync(start, end, excludePromotionId);
        }

        // Validate promotion
        public async Task<ValidatePromotionResult> ValidatePromotionAsync(string code, decimal orderAmount)
        {
            var promotion = await _promotionRepository.GetByCodeAsync(code);
            return ValidateOrderPromotion(promotion, orderAmount, "voucher");
        }

        public async Task<ValidatePromotionResult> ValidateEventPromotionAsync(int id, decimal orderAmount)
        {
            var promotion = await _promotionRepository.GetByIdAsync(id);
            return ValidateOrderPromotion(promotion, orderAmount, "event");
        }

        private ValidatePromotionResult ValidateOrderPromotion(Promotion? promotion, decimal orderAmount, string requiredType)
        {
            if (promotion == null)
            {
                return new ValidatePromotionResult
                {
                    IsValid = false,
                    Message = "Mã khuyến mãi không tồn tại",
                    DiscountAmount = 0
                };
            }

            if (promotion.Type != requiredType)
            {
                return new ValidatePromotionResult
                {
                    IsValid = false,
                    Message = requiredType == "event" ? "Ưu đãi được chọn không phải khuyến mãi sự kiện" : "Vui lòng nhập mã voucher hợp lệ",
                    DiscountAmount = 0
                };
            }

            if (promotion.Status != "active")
            {
                return new ValidatePromotionResult
                {
                    IsValid = false,
                    Message = "Mã khuyến mãi không còn hiệu lực",
                    DiscountAmount = 0
                };
            }

            // Sử dụng DateTimeHelper để so sánh theo ngày VN
            if (DateTimeHelper.IsScheduled(promotion.StartDate))
            {
                return new ValidatePromotionResult
                {
                    IsValid = false,
                    Message = "Mã khuyến mãi chưa đến thời gian sử dụng",
                    DiscountAmount = 0
                };
            }

            if (DateTimeHelper.IsExpired(promotion.EndDate))
            {
                return new ValidatePromotionResult
                {
                    IsValid = false,
                    Message = "Mã khuyến mãi đã hết hạn",
                    DiscountAmount = 0
                };
            }

            if (promotion.UsageLimit.HasValue && promotion.UsedCount >= promotion.UsageLimit)
            {
                return new ValidatePromotionResult
                {
                    IsValid = false,
                    Message = "Mã khuyến mãi đã hết lượt sử dụng",
                    DiscountAmount = 0
                };
            }

            promotion.MinOrderAmount = promotion.EventDetails?.MinOrderAmount ?? 0;
            if (promotion.Type == "event" && orderAmount < promotion.MinOrderAmount)
            {
                return new ValidatePromotionResult
                {
                    IsValid = false,
                    Message = $"Đơn hàng tối thiểu {promotion.MinOrderAmount:N0}đ để sử dụng chương trình này",
                    DiscountAmount = 0
                };
            }

            var discount = CalculateDiscount(promotion, orderAmount);

            return new ValidatePromotionResult
            {
                IsValid = true,
                Message = "Mã khuyến mãi hợp lệ",
                DiscountAmount = discount,
                Promotion = MapToDTO(promotion)
            };
        }

        // Calculate discount
        public async Task<decimal> CalculateDiscountAsync(string code, decimal orderAmount)
        {
            var promotion = await _promotionRepository.GetByCodeAsync(code);
            if (promotion == null) return 0;

            return CalculateDiscount(promotion, orderAmount);
        }

        private decimal CalculateDiscount(Promotion promotion, decimal orderAmount)
        {
            decimal discount = 0;

            if (promotion.DiscountType == "percent")
            {
                discount = orderAmount * (promotion.Value / 100);

                // Áp dụng giới hạn giảm tối đa nếu có
                if (promotion.MaxDiscount.HasValue && discount > promotion.MaxDiscount.Value)
                {
                    discount = promotion.MaxDiscount.Value;
                }
            }
            else // fixed
            {
                discount = Math.Min(promotion.Value, orderAmount);
            }

            return discount;
        }

        // Apply promotion to order
        public async Task<bool> ApplyPromotionByIdsAsync(int promotionId, int orderId, int? customerId)
        {
            return await ApplyPromotionRedemptionAsync(promotionId, orderId, customerId);
        }


        // Get active promotions
        public async Task<List<PromotionDTO>> GetActivePromotionsAsync()
        {
            var promotions = await _promotionRepository.GetActivePromotionsAsync();
            return promotions.Select(MapToDTO).ToList();
        }

        // Get redemption history
        public async Task<List<PromotionRedemptionDTO>> GetRedemptionHistoryAsync(int promotionId)
        {
            var redemptions = await _promotionRepository.GetRedemptionsAsync(promotionId);
            return redemptions.Select(r => new PromotionRedemptionDTO
            {
                Id = r.Id,
                PromotionId = r.PromotionId,
                CustomerId = r.CustomerId,
                CustomerName = r.Customer?.FullName ?? "N/A",
                OrderId = r.OrderId,
                OrderNumber = r.Order?.OrderNumber ?? "N/A",
                OrderAmount = r.Order?.TotalAmount ?? 0,
                RedeemedAt = r.RedeemedAt
            }).ToList();
        }

        // Get overview stats
        public async Task<object> GetOverviewStatsAsync()
        {
            var allPromotions = await _promotionRepository.GetAllAsync();
            var vnToday = DateTimeHelper.VietnamToday;

            var total = allPromotions.Count;
            var active = allPromotions.Count(p => p.Active && 
                (!p.StartDate.HasValue || p.StartDate.Value.Date <= vnToday) &&
                (!p.EndDate.HasValue || p.EndDate.Value.Date >= vnToday) &&
                (!p.UsageLimit.HasValue || p.UsedCount < p.UsageLimit));
            var scheduled = allPromotions.Count(p => p.Active && 
                p.StartDate.HasValue && p.StartDate.Value.Date > vnToday);
            var expired = allPromotions.Count(p => p.EndDate.HasValue && p.EndDate.Value.Date < vnToday);
            var inactive = allPromotions.Count(p => !p.Active);

            return new
            {
                total,
                active,
                scheduled,
                expired,
                inactive
            };
        }

        // Get promotion stats
        public async Task<PromotionStatsDTO> GetPromotionStatsAsync(int promotionId)
        {
            var promotion = await _promotionRepository.GetByIdAsync(promotionId);
            if (promotion == null)
                throw new ArgumentException("Promotion not found");

            var redemptions = await _promotionRepository.GetRedemptionsAsync(promotionId);

            return new PromotionStatsDTO
            {
                Id = promotion.Id,
                Code = promotion.Code,
                TotalRedemptions = redemptions.Count,
                TotalDiscountAmount = redemptions.Sum(r => r.Order?.Discount ?? 0),
                UniqueCustomers = redemptions.Where(r => r.CustomerId.HasValue)
                                             .Select(r => r.CustomerId)
                                             .Distinct()
                                             .Count(),
                AverageOrderValue = redemptions.Any()
                    ? redemptions.Average(r => r.Order?.TotalAmount ?? 0)
                    : 0
            };
        }

        // Map Promotion to PromotionDTO
        private PromotionDTO MapToDTO(Promotion p)
        {
            return new PromotionDTO
            {
                Id = p.Id,
                Code = p.Type == "voucher" ? p.VoucherDetails?.VoucherCode ?? string.Empty : string.Empty,
                Name = p.Name,
                Type = p.Type,
                DiscountType = p.DiscountType,
                Value = p.Value,
                MinOrderAmount = p.EventDetails?.MinOrderAmount ?? 0,
                VoucherCode = p.VoucherDetails?.VoucherCode,
                ProductIds = p.ProductDetails?.Select(d => d.ProductId).ToList() ?? new List<int>(),
                MaxDiscount = p.MaxDiscount,
                StartDate = p.StartDate,
                EndDate = p.EndDate,
                UsageLimit = p.UsageLimit,
                UsedCount = p.UsedCount,
                Active = p.Active,
                Status = p.Status,
                Description = p.Description,
                CreatedAt = p.CreatedAt,
                UpdatedAt = p.UpdatedAt
            };
        }



        public async Task<bool> ApplyPromotionToOrderAsync(int orderId)
        {
            var order = await _promotionRepository.GetOrderByIdAsync(orderId);
            if (order is null) return false;
            if (!order.PromotionId.HasValue)
                throw new InvalidOperationException("Đơn hàng không có chương trình khuyến mãi.");
            await ApplyPromotionRedemptionAsync(order.PromotionId.Value, order.Id, order.CustomerId);
            return true;
        }

        private async Task<bool> ApplyPromotionRedemptionAsync(int promotionId, int orderId, int? requestedCustomerId)
        {
            await using var transaction = await _promotionRepository.BeginSerializableTransactionAsync();
            var order = await _promotionRepository.GetOrderForUpdateAsync(orderId);
            if (order == null) return false;

            if (order.PromotionId != promotionId)
                throw new InvalidOperationException("Khuyến mãi không khớp với khuyến mãi của đơn hàng.");
            if (requestedCustomerId.HasValue && requestedCustomerId != order.CustomerId)
                throw new InvalidOperationException("Khách hàng không khớp với khách hàng của đơn hàng.");
            if (await _promotionRepository.HasRedemptionAsync(promotionId, orderId))
            {
                await transaction.CommitAsync();
                return true;
            }

            var promotion = await _promotionRepository.GetForUpdateAsync(promotionId)
                ?? throw new InvalidOperationException("Khuyến mãi không tồn tại.");
            if (promotion.UsageLimit.HasValue && promotion.UsedCount >= promotion.UsageLimit.Value)
                throw new InvalidOperationException("Khuyến mãi đã hết lượt sử dụng.");

            promotion.UsedCount++;
            promotion.UpdatedAt = DateTimeHelper.UtcNow;
            _promotionRepository.AddRedemption(new PromotionRedemption
            {
                PromotionId = promotionId,
                OrderId = orderId,
                CustomerId = order.CustomerId,
                RedeemedAt = DateTimeHelper.UtcNow
            });
            await _promotionRepository.SaveChangesAsync();
            await transaction.CommitAsync();
            _cache.Clear();
            return true;
        }
    }
}
