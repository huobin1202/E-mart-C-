using backend.Models;
using backend.Repository;
using backend.DTO;
using backend.Helpers;

namespace backend.Services
{
    public class PromotionService
    {
        private readonly PromotionRepository _promotionRepository;

        public PromotionService(PromotionRepository promotionRepository)
        {
            _promotionRepository = promotionRepository;
        }

        // Get all promotions
        public async Task<List<PromotionDTO>> GetAllPromotionsAsync()
        {
            var promotions = await _promotionRepository.GetAllAsync();
            return promotions.Select(MapToDTO).ToList();
        }

        // Get paginated promotions with search and filter
        public async Task<PaginationResult<PromotionDTO>> GetPaginatedPromotionsAsync(
            int page, 
            int pageSize, 
            string? search = null, 
            string? status = null, 
            string? type = null)
        {
            var result = await _promotionRepository.GetPaginatedAsync(page, pageSize, search, status, type);
            return new PaginationResult<PromotionDTO>
            {
                Items = result.Items.Select(MapToDTO).ToList(),
                TotalItems = result.TotalItems,
                CurrentPage = result.CurrentPage,
                PageSize = result.PageSize,
                TotalPages = result.TotalPages,
                HasPrevious = result.HasPrevious,
                HasNext = result.HasNext
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
        public async Task<PromotionDTO> CreatePromotionAsync(Promotion promotion)
        {
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

            if (promotion.Type is not ("percent" or "fixed"))
                throw new ArgumentException("Discount type must be percent or fixed", nameof(promotion.Type));

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
            return MapToDTO(created);
        }

        // Update promotion
        public async Task<PromotionDTO> UpdatePromotionAsync(Promotion promotion)
        {
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
            promotion.UpdatedAt = DateTimeHelper.UtcNow;
            promotion.Name = string.IsNullOrWhiteSpace(promotion.Name) ? existing.Name : promotion.Name;
            promotion.StartDate ??= existing.StartDate;
            promotion.EndDate ??= existing.EndDate;
            promotion.Status = promotion.Status is "active" or "expired" or "disabled"
                ? promotion.Status
                : promotion.Active ? "active" : "disabled";
            var updated = await _promotionRepository.UpdateAsync(promotion);
            return MapToDTO(updated);
        }

        // Delete promotion
        public async Task<bool> DeletePromotionAsync(int id)
        {
            if (id <= 0) throw new ArgumentException("ID must be greater than 0", nameof(id));
            return await _promotionRepository.DeleteAsync(id);
        }

        // Toggle active status
        public async Task<bool> ToggleActiveAsync(int id)
        {
            var promotion = await _promotionRepository.GetByIdAsync(id);
            if (promotion == null) return false;

            promotion.Status = promotion.Status == "disabled" ? "active" : "disabled";
            await _promotionRepository.UpdateAsync(promotion);
            return true;
        }

        // Validate promotion
        public async Task<ValidatePromotionResult> ValidatePromotionAsync(string code, decimal orderAmount)
        {
            var promotion = await _promotionRepository.GetByCodeAsync(code);

            if (promotion == null)
            {
                return new ValidatePromotionResult
                {
                    IsValid = false,
                    Message = "Mã khuyến mãi không tồn tại",
                    DiscountAmount = 0
                };
            }

            if (promotion.Type != "voucher")
            {
                return new ValidatePromotionResult
                {
                    IsValid = false,
                    Message = "Khuyến mãi này áp dụng trực tiếp cho sản phẩm, không áp dụng bằng mã đơn hàng",
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
            var promotion = await _promotionRepository.GetByIdAsync(promotionId);
            if (promotion == null) return false;

            await _promotionRepository.IncrementUsedCountAsync(promotionId);

            // Add redemption record
            await _promotionRepository.AddRedemptionAsync(new PromotionRedemption
            {
                PromotionId = promotionId,
                OrderId = orderId,
                CustomerId = customerId
            });

            return true;
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



        /// <summary>
        /// Áp dụng khuyến mãi cho đơn hàng đã tạo
        /// </summary>
        public async Task ApplyPromotionAsync(Order order)
        {
            if (!order.PromotionId.HasValue) return; // không có khuyến mãi thì thôi

            try
            {
                await _promotionRepository.ApplyPromotionAsync(order);
            }
            catch (Exception ex)
            {
                // có thể log lỗi nếu muốn
                throw new Exception($"Áp dụng khuyến mãi thất bại: {ex.Message}");
            }
        }
    }
}
