using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using backend.Models;
using backend.Services;
using backend.DTO;
using backend.Repository;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class PromotionsController : ControllerBase
    {
        private readonly PromotionService _promotionService;
        private readonly OrderRepository _orderRepository;

        public PromotionsController(PromotionService promotionService, OrderRepository orderRepository)
        {
            _promotionService = promotionService;
            _orderRepository = orderRepository;
        }

        // GET api/promotions
        [HttpGet]
        public async Task<ActionResult<List<PromotionDTO>>> GetPromotions()
        {
            try
            {
                var promotions = await _promotionService.GetAllPromotionsAsync();
                return Ok(promotions);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }

        // GET api/promotions/paginated
        [HttpGet("paginated")]
        public async Task<ActionResult<PaginationResult<PromotionDTO>>> GetPaginatedPromotions(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 12,
            [FromQuery] string? search = null,
            [FromQuery] string? status = null,
            [FromQuery] string? type = null
        )
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 12;

            try
            {
                var result = await _promotionService.GetPaginatedPromotionsAsync(page, pageSize, search, status, type);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }

        // GET api/promotions/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<PromotionDTO>> GetPromotion(int id)
        {
            try
            {
                var promotion = await _promotionService.GetPromotionByIdAsync(id);
                if (promotion == null)
                    return NotFound($"Promotion with ID {id} not found");

                return Ok(promotion);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }

        // GET api/promotions/code/{code}
        [HttpGet("code/{code}")]
        public async Task<ActionResult<PromotionDTO>> GetPromotionByCode(string code)
        {
            try
            {
                var promotion = await _promotionService.GetPromotionByCodeAsync(code);
                if (promotion == null)
                    return NotFound($"Promotion with code '{code}' not found");

                return Ok(promotion);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }

        // POST api/promotions
        [HttpPost]
        public async Task<ActionResult<PromotionDTO>> CreatePromotion([FromBody] PromotionDTO promotionDto)
        {
            if (promotionDto == null)
                return BadRequest("Promotion data is required");

            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            try
            {
                var promotion = new Promotion
                {
                    Code = promotionDto.Code.ToUpper(),
                    Name = promotionDto.Name,
                    Type = promotionDto.Type,
                    DiscountType = promotionDto.DiscountType,
                    Value = promotionDto.Value,
                    MinOrderAmount = promotionDto.MinOrderAmount,
                    MaxDiscount = promotionDto.MaxDiscount,
                    StartDate = promotionDto.StartDate,
                    EndDate = promotionDto.EndDate,
                    UsageLimit = promotionDto.UsageLimit,
                    Active = promotionDto.Active,
                    Status = promotionDto.Status ?? (promotionDto.Active ? "active" : "disabled"),
                    Description = promotionDto.Description
                };
                promotion.VoucherDetails = promotion.Type == "voucher" && !string.IsNullOrWhiteSpace(promotionDto.VoucherCode)
                    ? new VoucherPromotion { VoucherCode = promotionDto.VoucherCode.Trim().ToUpperInvariant() } : null;
                promotion.EventDetails = promotion.Type == "event"
                    ? new EventPromotion { MinOrderAmount = promotionDto.MinOrderAmount } : null;
                promotion.ProductDetails = promotion.Type == "product"
                    ? promotionDto.ProductIds.Distinct().Select(productId => new ProductPromotion { ProductId = productId }).ToList() : null;

                var created = await _promotionService.CreatePromotionAsync(promotion);
                return CreatedAtAction(nameof(GetPromotion), new { id = created.Id }, created);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }

        // PUT api/promotions/{id}
        [HttpPut("{id}")]
        public async Task<ActionResult<PromotionDTO>> UpdatePromotion(int id, [FromBody] PromotionDTO promotionDto)
        {
            if (promotionDto == null)
                return BadRequest("Promotion data is required");

            if (id != promotionDto.Id)
                return BadRequest("ID mismatch");

            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            try
            {
                var promotion = new Promotion
                {
                    Id = promotionDto.Id,
                    Code = promotionDto.Code.ToUpper(),
                    Name = promotionDto.Name,
                    Type = promotionDto.Type,
                    DiscountType = promotionDto.DiscountType,
                    Value = promotionDto.Value,
                    MinOrderAmount = promotionDto.MinOrderAmount,
                    MaxDiscount = promotionDto.MaxDiscount,
                    StartDate = promotionDto.StartDate,
                    EndDate = promotionDto.EndDate,
                    UsageLimit = promotionDto.UsageLimit,
                    UsedCount = promotionDto.UsedCount,
                    Active = promotionDto.Active,
                    Status = promotionDto.Status ?? (promotionDto.Active ? "active" : "disabled"),
                    Description = promotionDto.Description
                };
                promotion.VoucherDetails = promotion.Type == "voucher" && !string.IsNullOrWhiteSpace(promotionDto.VoucherCode)
                    ? new VoucherPromotion { VoucherCode = promotionDto.VoucherCode.Trim().ToUpperInvariant() } : null;
                promotion.EventDetails = promotion.Type == "event"
                    ? new EventPromotion { MinOrderAmount = promotionDto.MinOrderAmount } : null;
                promotion.ProductDetails = promotion.Type == "product"
                    ? promotionDto.ProductIds.Distinct().Select(productId => new ProductPromotion { ProductId = productId }).ToList() : null;

                var updated = await _promotionService.UpdatePromotionAsync(promotion);
                return Ok(updated);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }

        // DELETE api/promotions/{id}
        [HttpDelete("{id}")]
        public async Task<ActionResult> DeletePromotion(int id)
        {
            try
            {
                var result = await _promotionService.DeletePromotionAsync(id);
                if (!result)
                    return NotFound($"Promotion with ID {id} not found");

                return NoContent();
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }

        // PATCH api/promotions/{id}/toggle
        [HttpPatch("{id}/toggle")]
        public async Task<ActionResult> ToggleActive(int id)
        {
            try
            {
                var result = await _promotionService.ToggleActiveAsync(id);
                if (!result)
                    return NotFound($"Promotion with ID {id} not found");

                return NoContent();
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }

        // POST api/promotions/validate
        [HttpPost("validate")]
        public async Task<ActionResult<ValidatePromotionResult>> ValidatePromotion([FromBody] ValidatePromotionRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Code))
                return BadRequest("Code and OrderAmount are required");

            try
            {
                var result = await _promotionService.ValidatePromotionAsync(request.Code, request.OrderAmount);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }

        // GET api/promotions/overview-stats
        [HttpGet("overview-stats")]
        public async Task<ActionResult<object>> GetOverviewStats()
        {
            try
            {
                var stats = await _promotionService.GetOverviewStatsAsync();
                return Ok(stats);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }

        // GET api/promotions/active
        [HttpGet("active")]
        public async Task<ActionResult<List<PromotionDTO>>> GetActivePromotions()
        {
            try
            {
                var promotions = await _promotionService.GetActivePromotionsAsync();
                return Ok(promotions);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }

        // GET api/promotions/{id}/redemptions
        [HttpGet("{id}/redemptions")]
        public async Task<ActionResult<List<PromotionRedemptionDTO>>> GetRedemptions(int id)
        {
            try
            {
                var redemptions = await _promotionService.GetRedemptionHistoryAsync(id);
                return Ok(redemptions);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }

        // GET api/promotions/{id}/stats
        [HttpGet("{id}/stats")]
        public async Task<ActionResult<PromotionStatsDTO>> GetPromotionStats(int id)
        {
            try
            {
                var stats = await _promotionService.GetPromotionStatsAsync(id);
                return Ok(stats);
            }
            catch (ArgumentException ex)
            {
                return NotFound(ex.Message);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }



        // POST api/promotions/{orderId}/apply (for POS)
        [HttpPost("{orderId}/apply")]
        public async Task<ActionResult> ApplyPromotionToOrder(int orderId)
        {
            try
            {
                var order = await _orderRepository.GetByIdAsync(orderId);
                if (order == null)
                    return NotFound(new { message = "Order không tồn tại" });

                await _promotionService.ApplyPromotionAsync(order);
                return Ok(new { message = "Áp dụng khuyến mãi thành công" });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }
        /// <summary>
        /// Áp dụng khuyến mãi cho đơn hàng dựa trên promotionId, orderId, và customerId (dùng cho POS hoặc test)
        /// </summary>
        [HttpPost("apply")]
        public async Task<IActionResult> ApplyPromotion([FromBody] ApplyPromotionRequest request)
        {
            try
            {
                await _promotionService.ApplyPromotionByIdsAsync(request.PromotionId, request.OrderId, request.CustomerId);
                return Ok(new { message = "Áp dụng khuyến mãi thành công" });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }



    }
    public class ApplyPromotionRequest
    {
        public int PromotionId { get; set; }
        public int OrderId { get; set; }
        public int? CustomerId { get; set; }
    }

    // Request model for validation
    public class ValidatePromotionRequest
    {
        public string Code { get; set; } = string.Empty;
        public decimal OrderAmount { get; set; }
    }
}
