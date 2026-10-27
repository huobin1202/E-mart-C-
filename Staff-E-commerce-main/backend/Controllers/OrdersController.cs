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
        private readonly RealtimeNotificationService _realtime;
        private readonly PosCheckoutService _checkout;
        private readonly PaymentService _payments;
        private readonly IConfiguration _config;

        public OrdersController(OrderService orderService, PosCheckoutService checkout, PaymentService payments, IConfiguration config, RealtimeNotificationService realtime)
        {
            _orderService = orderService;
            _realtime = realtime;
            _checkout = checkout;
            _payments = payments;
            _config = config;
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
        [HttpPost("checkout")]
        public async Task<IActionResult> CreateOrder([FromBody] PosCheckoutRequest order)
        {
            if (order == null)
                return BadRequest("Order payload is null");

            try
            {
                var savedOrder = await _checkout.CheckoutAsync(order);

                if (savedOrder == null)
                    return StatusCode(500, "Failed to save order");

                await _realtime.BroadcastToWeb("NewOrderPlaced", new
                {
                    orderId = savedOrder.Id,
                    orderNumber = savedOrder.OrderNumber,
                    orderType = "pos",
                    customerName = savedOrder.CustomerName,
                    totalAmount = savedOrder.TotalAmount,
                    itemCount = savedOrder.Items.Sum(item => item.Quantity),
                    paymentMethod = savedOrder.PaymentMethod,
                    createdAt = savedOrder.CreatedAt
                });
                await _realtime.BroadcastStock("StockUpdated", new
                {
                    productIds = savedOrder.Items.Select(item => item.ProductId).Distinct().ToArray(),
                    orderId = savedOrder.Id,
                    source = "pos-checkout",
                    changedAt = DateTime.UtcNow
                });

                return Ok(savedOrder);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (InvalidOperationException ex) { return Conflict(new { message = ex.Message }); }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Create order failed: {ex}");
                return StatusCode(500, new { message = "Không thể tạo đơn hàng. Vui lòng thử lại." });
            }
        }

        [HttpGet("{orderId:int}/checkout")]
        public async Task<IActionResult> GetCheckout(int orderId)
        {
            try { return Ok(await _checkout.GetAsync(orderId)); }
            catch (ArgumentException ex) { return NotFound(new { message = ex.Message }); }
        }

        [HttpGet("checkout-request/{requestId:guid}")]
        public async Task<IActionResult> GetCheckoutByRequest(Guid requestId)
        {
            var order = await _checkout.GetByRequestAsync(requestId);
            return order == null ? NotFound() : Ok(order);
        }

        [HttpPost("{orderId:int}/confirm-payment")]
        public async Task<IActionResult> ConfirmPayment(int orderId, PosPaymentConfirmation request)
        {
            try { return Ok(await _checkout.ConfirmAsync(orderId, request.Amount, request.Reference)); }
            catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
            catch (InvalidOperationException ex) { return Conflict(new { message = ex.Message }); }
        }

        [HttpPost("{orderId:int}/confirm-cash")]
        public async Task<IActionResult> ConfirmCash(int orderId, PosCashConfirmation request)
        {
            try { return Ok(await _checkout.ConfirmCashAsync(orderId, request.CashReceived)); }
            catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
            catch (InvalidOperationException ex) { return Conflict(new { message = ex.Message }); }
        }

        [HttpGet("online/{orderId:int}")]
        public async Task<IActionResult> GetOnlineOrder(int orderId)
        {
            var result = await _orderService.GetOnlineOrdersAsync(1, 1, null, null, orderId);
            return result.Items.Count == 0 ? NotFound() : Ok(result.Items[0]);
        }

        [HttpPost("{orderId:int}/payment-link")]
        public async Task<IActionResult> CreatePosPaymentLink(int orderId)
        {
            try
            {
                var order = await _checkout.GetAsync(orderId);
                var baseUrl = (_config["App:BaseUrl"] ?? "http://localhost:5099").TrimEnd('/');
                var result = await _payments.CreatePaymentAsync(new MomoPaymentRequestDTO
                { OrderId = orderId, Amount = order.TotalAmount, ReturnUrl = $"{baseUrl}/api/payment/momo/return", NotifyUrl = $"{baseUrl}/api/payment/momo/ipn" });
                return result.Success ? Ok(new { result.PayUrl }) : BadRequest(new { message = "Chưa tạo được liên kết MoMo. Đơn vẫn đang chờ; hãy thử lại trên đơn này." });
            }
            catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
            catch (InvalidOperationException ex) { return Conflict(new { message = ex.Message }); }
        }




        [HttpGet("search")]
        public async Task<IActionResult> Search(
            int pageNumber = 1,
            int pageSize = 10,
            string? status = null,
            DateTime? startDate = null,
            DateTime? endDate = null,
            string? search = null,
            string? orderType = null
        )
        {
            if (!string.IsNullOrEmpty(orderType) && orderType != "mobile" && orderType != "pos")
                return BadRequest(new { message = "Kênh bán không hợp lệ." });
            pageNumber = Math.Max(pageNumber, 1);
            pageSize = Math.Clamp(pageSize, 1, 100);
            var result = await _orderService.GetPagedOrdersAsync(
                pageNumber, pageSize, status, startDate, endDate, search, orderType
            );

            return Ok(result);
        }

        [HttpGet("{orderId:int}")]
        public async Task<IActionResult> GetOrderById(int orderId)
        {
            try { return Ok(await _orderService.MapToDTOAsync(orderId)); }
            catch (Exception) { return NotFound(); }
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
            catch (InvalidOperationException ex) { return Conflict(new { message = ex.Message }); }
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

                return Ok(new { success = true, message = "Đã hoàn thành giao hàng." });
            }
            catch (InvalidOperationException ex) { return Conflict(new { message = ex.Message }); }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpPost("{orderId}/refund")]
        public async Task<IActionResult> MarkOrderRefunded(int orderId)
        {
            var result = await _orderService.MarkOrderRefundedAsync(orderId);
            return result ? Ok(new { success = true, message = "Đơn hàng và hóa đơn đã được đánh dấu hoàn tiền." })
                : Conflict(new { message = "Chỉ đơn đã thanh toán mới có thể đánh dấu hoàn tiền." });
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
