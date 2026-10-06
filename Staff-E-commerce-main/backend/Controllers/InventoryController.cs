using backend.Services;
using backend.DTO;
using backend.Models;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class InventoryController : ControllerBase
    {
        private readonly InventoryService _inventoryService;

        public InventoryController(InventoryService inventoryService)
        {
            _inventoryService = inventoryService;
        }

        [HttpGet("paginated")]
        public async Task<ActionResult<PaginationResult<InventoryListDTO>>> GetPaginatedInventory(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10,
            [FromQuery] string? search = null,
            [FromQuery] string? sortBy = "",
            [FromQuery] string? stockStatus = null)
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 10;

            try
            {
                var result = await _inventoryService.GetPaginatedInventoryAsync(page, pageSize, search, sortBy, stockStatus);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }

        [HttpPut("adjust")]
        public async Task<ActionResult<InventoryListDTO>> AdjustInventory([FromBody] AdjustInventoryDTO dto)
        {
            if (dto == null)
                return BadRequest(new { message = "Dữ liệu không hợp lệ" });

            if (dto.NewQuantity < 0)
                return BadRequest(new { message = "Số lượng không được âm" });

            try
            {
                var result = await _inventoryService.AdjustInventoryAsync(dto);
                return Ok(result);
            }
            catch (ArgumentException ex)
            {
                return NotFound(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }

        [HttpGet("stats")]
        public async Task<ActionResult<InventoryStatsDTO>> GetInventoryStats()
        {
            try
            {
                var stats = await _inventoryService.GetInventoryStatsAsync();
                return Ok(stats);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }

        [HttpPost("reduce-multiple")]
        public async Task<IActionResult> ReduceMultipleInventory([FromBody] List<ReduceInventoryDto> items)
        {
            try
            {
                await _inventoryService.ReduceInventoryAsync(items);
                return Ok(new { message = "Cập nhật kho thành công" });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpGet("adjustments")]
        public async Task<IActionResult> GetAdjustmentHistory(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20,
            [FromQuery] int? productId = null,
            [FromQuery] string? search = null)
        {
            try
            {
                var result = await _inventoryService.GetAdjustmentHistoryAsync(page, pageSize, productId, search);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }
    }
}
