using backend.DTO;
using backend.Services;
using Microsoft.AspNetCore.Mvc;
using backend.Models;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class OrdersController : ControllerBase
    {
        private readonly OrderService _orderService;
        public OrdersController(OrderService orderService)
        {
            _orderService = orderService;
        }

        //1. Khởi tạo một đối tượng đơn hàng tạm thời để truyền xuống frontend
        [HttpPost("create-temp")]
        public async Task<ActionResult<OrderDTO>> CreateTemporaryOrder()
        {
            try
            {
                var tempOrder = await _orderService.CreateTemporaryOrderAsync();
                return Ok(tempOrder);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Lỗi tạo order: {ex}");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // POST: api/Order/create
        // [HttpPost("create")]
        // public async Task<IActionResult> CreateOrder([FromBody] Order order)
        // {
        //     if (order == null)
        //         return BadRequest(false);

        //     try
        //     {
        //         var savedOrder = await _orderService.SaveOrderAsync(order);
        //         return Ok(true);
        //     }
        //     catch (Exception)
        //     {
        //         return StatusCode(500, false);
        //     }
        // }

        [HttpPost("create")]
        public async Task<IActionResult> CreateOrder([FromBody] Order order)
        {
            if (order == null)
                return BadRequest("Order payload is null");

            try
            {
                var savedOrder = await _orderService.SaveOrderAsync(order);

                if (savedOrder == null)
                    return StatusCode(500, "Failed to save order");

                return Ok(savedOrder);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Create order failed: {ex}");
                return StatusCode(500, new { message = "Không thể tạo đơn hàng. Vui lòng thử lại." });
            }
        }




        [HttpGet("search")]
        public async Task<IActionResult> Search(
            int pageNumber = 1,
            int pageSize = 10,
            string? status = null,
            DateTime? startDate = null,
            DateTime? endDate = null,
            string? search = null
        )
        {
            var result = await _orderService.GetPagedOrdersAsync(
                pageNumber, pageSize, status, startDate, endDate, search
            );

            return Ok(result);
        }
       
        [HttpPost("{orderId}/cancel")]
        public async Task<IActionResult> CancelOrder(int orderId)
        {
            try
            {
                var result = await _orderService.CancelOrderAsync(orderId);

                // Trả về true/false
                return Ok(result);
            }
            catch
            {
                // Nếu lỗi hệ thống, vẫn trả false
                return Ok(false);
            }
        }



    }
}
