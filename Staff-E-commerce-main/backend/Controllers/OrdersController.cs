using backend.DTO;
using backend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using backend.Models;
using backend.Hubs;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class OrdersController : ControllerBase
    {
        private readonly OrderService _orderService;
        private readonly IHubContext<OrderHub>? _orderHub;

        public OrdersController(OrderService orderService, IHubContext<OrderHub>? orderHub = null)
        {
            _orderService = orderService;
            _orderHub = orderHub;
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
        [HttpPost("")]
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

        [HttpPost("{orderId}/complete")]
        public async Task<IActionResult> CompletePendingOrder(int orderId)
        {
            try
            {
                var result = await _orderService.CompletePendingOrderAsync(orderId);
                if (!result)
                    return Conflict(new { message = "Đơn hàng không còn ở trạng thái chờ xử lý." });

                return Ok(true);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Complete pending order failed: {ex}");
                return StatusCode(500, new { message = "Không thể hoàn thành đơn hàng." });
            }
        }

        /// <summary>
        /// Lấy danh sách đơn hàng online (order_type = 'mobile') với phân trang
        /// </summary>
        [HttpGet("online")]
        public async Task<IActionResult> GetOnlineOrders(
            int pageNumber = 1,
            int pageSize = 20,
            string? status = null,
            string? search = null)
        {
            var result = await _orderService.GetOnlineOrdersAsync(pageNumber, pageSize, status, search);
            return Ok(result);
        }

        /// <summary>
        /// Xác nhận đơn hàng online: pending -> processing
        /// </summary>
        [HttpPost("{orderId}/confirm")]
        public async Task<IActionResult> ConfirmOnlineOrder(int orderId)
        {
            try
            {
                var result = await _orderService.ConfirmOnlineOrderAsync(orderId);
                if (!result)
                    return Conflict(new { message = "Đơn hàng không thể xác nhận (không tồn tại hoặc không ở trạng thái pending)." });

                if (_orderHub != null)
                {
                    _ = _orderHub.Clients.All.SendAsync("OrderStatusChanged", new { orderId, status = "processing" });
                }

                return Ok(new { success = true, message = "Đã xác nhận đơn hàng." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        /// <summary>
        /// Từ chối đơn hàng online: pending -> cancelled
        /// </summary>
        [HttpPost("{orderId}/reject")]
        public async Task<IActionResult> RejectOnlineOrder(int orderId, [FromBody] RejectOrderDTO? dto)
        {
            try
            {
                var result = await _orderService.RejectOnlineOrderAsync(orderId, dto?.Reason);
                if (!result)
                    return Conflict(new { message = "Đơn hàng không thể từ chối (không tồn tại hoặc không ở trạng thái pending/processing)." });

                if (_orderHub != null)
                {
                    _ = _orderHub.Clients.All.SendAsync("OrderStatusChanged", new { orderId, status = "cancelled" });
                }

                return Ok(new { success = true, message = "Đã từ chối đơn hàng." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        /// <summary>
        /// Hoàn thành giao hàng: processing -> completed
        /// </summary>
        [HttpPost("{orderId}/deliver")]
        public async Task<IActionResult> DeliverOnlineOrder(int orderId)
        {
            try
            {
                var result = await _orderService.DeliverOnlineOrderAsync(orderId);
                if (!result)
                    return Conflict(new { message = "Đơn hàng không thể chuyển sang trạng thái giao hàng." });

                if (_orderHub != null)
                {
                    _ = _orderHub.Clients.All.SendAsync("OrderStatusChanged", new { orderId, status = "completed" });
                }

                return Ok(new { success = true, message = "Đã hoàn thành giao hàng." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpGet("{orderId}/items")]
        public async Task<IActionResult> GetOrderItems(int orderId)
        {
            try
            {
                var items = await _orderService.GetOrderItemsAsync(orderId);
                return Ok(items);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }
    }
}
