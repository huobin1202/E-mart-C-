using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;
using backend.DTO;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using backend.Hubs;
using backend.Helpers;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/storefront")]
    public class StorefrontController : ControllerBase
    {
        private readonly JwtService _jwt;
        private readonly PromotionService _promotions;
        private readonly PaymentService _paymentService;
        private readonly IConfiguration _config;
        private readonly InvoiceService _invoiceService;
        private readonly StorefrontService _storefrontService;
        private readonly OrderNotifications? _notifications;
        private readonly StorefrontCheckoutService _checkout;
        private readonly BankTransferService _bank;

        public StorefrontController(
            JwtService jwt,
            PromotionService promotions,
            PaymentService paymentService,
            IConfiguration config,
            InvoiceService invoiceService,
            StorefrontService storefrontService,
            StorefrontCheckoutService checkout, BankTransferService bank, OrderNotifications? notifications = null)
        {
            _jwt = jwt;
            _promotions = promotions;
            _paymentService = paymentService;
            _config = config;
            _invoiceService = invoiceService;
            _storefrontService = storefrontService;
            _notifications = notifications; _checkout = checkout; _bank = bank;
        }

        [HttpGet("promotions")]
        [AllowAnonymous]
        public async Task<IActionResult> GetStorefrontPromotions()
        {
            var promotions = await _promotions.GetActivePromotionsAsync();
            return Ok(promotions.Where(item => item.Type == "event"));
        }

        [HttpPost("promotions/validate")]
        [AllowAnonymous]
        public async Task<IActionResult> ValidateStorefrontPromotion([FromBody] StorefrontPromotionRequest request)
        {
            if (request.EventPromotionId.HasValue && !string.IsNullOrWhiteSpace(request.Code))
                return BadRequest(new { message = "Chỉ chọn một ưu đãi sự kiện hoặc nhập một mã voucher." });
            if (!request.EventPromotionId.HasValue && string.IsNullOrWhiteSpace(request.Code))
                return BadRequest(new { message = "Nhập mã voucher hoặc chọn ưu đãi sự kiện." });
            var result = request.EventPromotionId.HasValue
                ? await _promotions.ValidateEventPromotionAsync(request.EventPromotionId.Value, request.OrderAmount)
                : await _promotions.ValidatePromotionAsync(request.Code, request.OrderAmount);
            return Ok(result);
        }

        [HttpPost("register")]
        [AllowAnonymous]
        public async Task<IActionResult> RegisterCustomer([FromBody] StorefrontCustomerRegisterRequest request)
        {
            await using var registration = await _storefrontService.BeginRegistrationAsync();
            var phone = NormalizePhone(request.Phone);
            if (!Regex.IsMatch(phone, "^0[35789]\\d{8}$"))
                return BadRequest(new { message = "Số điện thoại Việt Nam chưa đúng định dạng." });
            if (string.IsNullOrWhiteSpace(request.Username) || request.Username.Trim().Length < 3)
                return BadRequest(new { message = "Tên đăng nhập phải có ít nhất 3 ký tự." });
            if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 6)
                return BadRequest(new { message = "Mật khẩu phải có ít nhất 6 ký tự." });
            if (string.IsNullOrWhiteSpace(request.FullName) || request.FullName.Trim().Length < 2)
                return BadRequest(new { message = "Họ tên phải có ít nhất 2 ký tự." });

            var internationalPhone = $"+84{phone[1..]}";
            var username = request.Username.Trim();
            if (await _storefrontService.UsernameExistsAsync(username))
                return Conflict(new { message = "Tên đăng nhập đã tồn tại." });

            var customer = await _storefrontService.GetCustomerByPhoneAsync(phone, internationalPhone);

            if (customer == null)
            {
                customer = new Customer
                {
                    FullName = request.FullName.Trim(),
                    Phone = phone,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
            }
            else
                return Conflict(new { message = "Số điện thoại đã có hồ sơ tại cửa hàng. Vui lòng liên hệ cửa hàng để xác minh và cấp tài khoản." });

            customer.FullName = request.FullName.Trim();
            customer.UpdatedAt = DateTime.UtcNow;
            var role = await _storefrontService.GetActiveCustomerRoleAsync();
            if (role == null)
                return StatusCode(500, new { message = "Vai trò khách hàng chưa được cấu hình." });

            var user = new User
            {
                Username = username,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password, 11),
                FullName = customer.FullName,
                Email = customer.Email,
                RoleId = role.Id,
                RoleEntity = role,
                Customer = customer,
                IsActive = true,
                IsLocked = false,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            try { await _storefrontService.SaveRegistrationAsync(customer, user); }
            catch (DbUpdateException) { return Conflict(new { message = "Tên đăng nhập hoặc số điện thoại đã tồn tại." }); }
            await registration.CommitAsync();

            var (token, expiresIn) = _jwt.GenerateToken(user);
            return Ok(new { token, tokenType = "Bearer", expiresIn, customer = ToCustomerProfile(customer) });
        }

        [HttpPost("login")]
        [AllowAnonymous]
        public async Task<IActionResult> Login([FromBody] StorefrontCustomerLoginRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
                return BadRequest(new { message = "Vui lòng nhập tên đăng nhập và mật khẩu." });

            var user = await _storefrontService.GetCustomerLoginAsync(request.Username.Trim());

            if (user?.Customer == null || user.RoleEntity == null || !string.Equals(user.RoleEntity.Name, "customer", StringComparison.OrdinalIgnoreCase) ||
                !user.IsActive || user.IsLocked || !user.RoleEntity.IsActive ||
                !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
                return Unauthorized(new { message = "Tên đăng nhập hoặc mật khẩu không đúng." });

            if (!user.Customer.IsActive)
                return Unauthorized(new { message = "Tài khoản khách hàng đã bị khóa." });

            user.LastLogin = DateTime.UtcNow;
            await _storefrontService.UpdateLastLoginAsync(user.Id, DateTime.UtcNow);
            var (token, expiresIn) = _jwt.GenerateToken(user);
            return Ok(new
            {
                token,
                tokenType = "Bearer",
                expiresIn,
                customer = ToCustomerProfile(user.Customer)
            });
        }

        [HttpGet("account")]
        [Authorize(Roles = "customer")]
        public async Task<IActionResult> GetAccount()
        {
            var customer = await GetAuthenticatedCustomerAsync();
            return customer == null
                ? Unauthorized(new { message = "Phiên đăng nhập không hợp lệ." })
                : Ok(ToCustomerProfile(customer));
        }

        [HttpPut("account/address")]
        [Authorize(Roles = "customer")]
        public async Task<IActionResult> UpdateAccountAddress([FromBody] StorefrontAddressUpdateRequest request)
        {
            var address = request.Address.Trim();
            if (string.IsNullOrWhiteSpace(address))
                return BadRequest(new { message = "Địa chỉ không được để trống." });

            var customer = await GetAuthenticatedCustomerAsync();
            if (customer == null)
                return Unauthorized(new { message = "Phiên đăng nhập không hợp lệ." });

            customer.Address = address;
            customer.UpdatedAt = DateTime.UtcNow;
            await _storefrontService.SaveCustomerAsync(customer);
            return Ok(ToCustomerProfile(customer));
        }

        [HttpPut("account")]
        [Authorize(Roles = "customer")]
        public async Task<IActionResult> UpdateAccount([FromBody] StorefrontAccountUpdateRequest? request)
        {
            if (request == null)
                return BadRequest(new { message = "Thông tin cập nhật không được để trống." });

            var fullName = request.FullName?.Trim();
            if (string.IsNullOrWhiteSpace(fullName) || fullName.Length < 2)
                return BadRequest(new { message = "Họ tên cần có ít nhất 2 ký tự." });

            var customer = await GetAuthenticatedCustomerAsync();
            if (customer == null)
                return Unauthorized(new { message = "Phiên đăng nhập không hợp lệ." });

            customer.FullName = fullName;
            customer.Email = request.Email?.Trim();
            customer.Address = request.Address?.Trim();
            customer.DateOfBirth = request.DateOfBirth;
            if (!string.IsNullOrWhiteSpace(customer.Email) &&
                await _storefrontService.EmailUsedByOtherAsync(customer.Id, customer.Email))
                return Conflict(new { message = "Email này đã được sử dụng cho khách hàng khác." });
            customer.UpdatedAt = DateTime.UtcNow;
            var account = await _storefrontService.GetUserByCustomerIdAsync(customer.Id);
            if (account != null)
            {
                account.FullName = customer.FullName;
                account.Email = customer.Email;
                account.UpdatedAt = DateTime.UtcNow;
            }
            try
            {
                await _storefrontService.SaveAccountAsync(customer, account);
            }
            catch (DbUpdateException)
            {
                return Conflict(new { message = "Không thể lưu thông tin. Email hoặc dữ liệu hồ sơ có thể bị trùng." });
            }
            return Ok(ToCustomerProfile(customer));
        }

        [HttpGet("orders")]
        [Authorize(Roles = "customer")]
        public async Task<IActionResult> GetCustomerOrders()
        {
            var customer = await GetAuthenticatedCustomerAsync();
            if (customer == null)
                return Unauthorized(new { message = "Phiên đăng nhập không hợp lệ." });

            var orders = await _storefrontService.GetCustomerOrdersAsync(customer.Id);

            return Ok(orders);
        }

        [HttpGet("orders/{id:int}/invoice")]
        [Authorize(Roles = "customer")]
        public async Task<IActionResult> GetCustomerInvoice(int id)
        {
            var customer = await GetAuthenticatedCustomerAsync();
            if (customer == null)
                return Unauthorized(new { message = "Phiên đăng nhập không hợp lệ." });

            var order = await _storefrontService.GetCustomerOrderStatusAsync(id, customer.Id);
            if (!order.Exists)
                return NotFound(new { message = "Không tìm thấy đơn hàng." });
            if (order.Status != "completed")
                return Conflict(new { message = "Chỉ xem được hóa đơn của đơn hàng đã thành công." });

            var invoice = await _invoiceService.GetInvoiceAsync(id);
            return invoice == null
                ? NotFound(new { message = "Hóa đơn chưa được phát hành. Vui lòng thử lại sau." })
                : Ok(invoice);
        }

        private async Task<Customer?> GetAuthenticatedCustomerAsync()
        {
            var idClaim = User.FindFirst("customer_id")?.Value;
            return int.TryParse(idClaim, out var customerId)
                ? await _storefrontService.GetActiveCustomerAsync(customerId)
                : null;
        }

        private static StorefrontCustomerProfile ToCustomerProfile(Customer customer) => new()
        {
            Id = customer.Id,
            FullName = customer.FullName,
            Phone = customer.Phone ?? string.Empty,
            Email = customer.Email,
            Address = customer.Address,
            DateOfBirth = customer.DateOfBirth,
            RewardPoints = customer.RewardPoints
        };

        private static string NormalizePhone(string phone)
        {
            var normalized = Regex.Replace(phone.Trim(), "[\\s()-]", string.Empty);
            if (normalized.StartsWith("+84", StringComparison.Ordinal))
                normalized = $"0{normalized[3..]}";
            return normalized;
        }

        [HttpGet("products")]
        [AllowAnonymous]
        public async Task<ActionResult<List<StorefrontProductDTO>>> GetProducts()
        {
            var products = await _storefrontService.GetAvailableProductsAsync();
            return Ok(products);
        }

        private static decimal CalculateProductDiscount(decimal price, string discountType, decimal value, decimal? maxDiscount)
        {
            var discount = discountType == "percent" ? price * value / 100m : value;
            if (maxDiscount.HasValue) discount = Math.Min(discount, maxDiscount.Value);
            return Math.Min(price, discount);
        }

        [HttpGet("categories")]
        [AllowAnonymous]
        public async Task<ActionResult<List<StorefrontCategoryResponse>>> GetCategories()
        {
            var categories = await _storefrontService.GetActiveCategoriesAsync();

            return Ok(categories);
        }

        [HttpGet("payment-options")]
        [AllowAnonymous]
        public IActionResult PaymentOptions() => Ok(new { cod = true, bank = _bank.Enabled, bankDetails = _bank.Details,
            momo = !string.IsNullOrWhiteSpace(_config["Momo:Endpoint"]) && !string.IsNullOrWhiteSpace(_config["Momo:SecretKey"]) });

        [HttpPost("orders")]
        [Authorize(Roles = "customer")]
        public async Task<IActionResult> CreateOrder([FromBody] StorefrontOrderRequest request)
        {
            try
            {
                var (order, replay) = await _checkout.CreateAsync(request);
                string? payUrl = null, paymentError = null;
                if (order.PaymentMethod == "e_wallet" && order.PaymentStatus == "pending" && order.Status == "pending")
                {
                    try
                    {
                        var origin = _config["App:BaseUrl"] ?? "http://localhost:5099";
                        var result = await _paymentService.CreatePaymentAsync(new MomoPaymentRequestDTO { OrderId = order.Id,
                            ReturnUrl = $"{origin}/api/payment/momo/return", NotifyUrl = $"{origin}/api/payment/momo/ipn" });
                        payUrl = result.PayUrl; paymentError = result.Success ? null : result.Message;
                    }
                    catch { paymentError = "Đơn đã lưu nhưng chưa tạo được liên kết MoMo. Hãy kiểm tra trạng thái, thử lại hoặc hủy đơn chưa thanh toán."; }
                }
                if (!replay && _notifications != null)
                    await _notifications.PublishAsync("NewOrderReceived", new { orderId = order.Id, orderNumber = order.OrderNumber,
                        customerName = order.RecipientName, phone = order.RecipientPhone, totalAmount = order.TotalAmount,
                        itemCount = request.Items.Count, paymentMethod = request.PaymentMethod, createdAt = order.CreatedAt });
                return Ok(new { order.Id, order.OrderNumber, order.Status, order.Subtotal, order.Discount, order.TotalAmount,
                    paymentMethod = order.PaymentMethod == "e_wallet" ? "momo" : order.PaymentMethod == "card" ? "bank" : "cod",
                    order.PaymentStatus, order.CreatedAt, order.RecipientName, order.RecipientPhone, order.ShippingAddress,
                    order.Note, pointsUsed = order.PointsUsed, momoPayUrl = payUrl, paymentError, bankDetails = _bank.Details,
                    vietQrUrl = order.PaymentMethod == "card" ? _bank.QrUrl(order.TotalAmount, order.OrderNumber) : null, replay });
            }
            catch (UnauthorizedAccessException ex) { return Unauthorized(new { message = ex.Message }); }
            catch (ArgumentException ex) { return BadRequest(new { message = ex.Message, checkoutNotCreated = true }); }
            catch (InvalidOperationException ex) { return Conflict(new { message = ex.Message, checkoutNotCreated = true }); }
            catch (DbUpdateException) { return Conflict(new { message = "Không thể lưu đơn hàng. Vui lòng thử lại đúng yêu cầu đã gửi.", checkoutNotCreated = true }); }
        }

        [HttpGet("orders/{id}/payment-status")]
        [Authorize(Roles = "customer")]
        public async Task<IActionResult> GetOrderPaymentStatus(int id)
        {
            var order = await _storefrontService.GetOrderForPaymentStatusAsync(id);
            if (order == null || order.CustomerId?.ToString() != User.FindFirst("customer_id")?.Value) return NotFound(new { message = "Không tìm thấy đơn hàng." });

            string? vietQrUrl = null;
            if (order.PaymentStatus == "pending" && order.PaymentMethod == "card")
            {
                vietQrUrl = _bank.QrUrl(order.TotalAmount, order.OrderNumber);
            }

            return Ok(new
            {
                order.Id,
                order.OrderNumber,
                order.Status,
                order.PaymentStatus,
                paymentMethod = order.PaymentMethod == "e_wallet" ? "momo" : (order.PaymentMethod == "card" ? "bank" : "cod"),
                order.TotalAmount,
                vietQrUrl
            });
        }

        [HttpPost("orders/{id:int}/cancel")]
        [Authorize(Roles = "customer")]
        public async Task<IActionResult> CancelCustomerOrder(int id, [FromServices] OrderService orders)
        {
            var customer = await GetAuthenticatedCustomerAsync();
            if (customer == null) return Unauthorized();
            var snapshot = await _storefrontService.GetOrderForPaymentStatusAsync(id);
            if (snapshot == null || snapshot.CustomerId != customer.Id) return NotFound();
            if (snapshot.PaymentStatus == "paid") return Conflict(new { message = "Đơn đã nhận tiền. Vui lòng liên hệ cửa hàng để hủy và đối soát hoàn tiền." });
            var cancelled = await orders.CancelCustomerOrderAsync(id, customer.Id);
            return cancelled ? Ok(new { status = "cancelled" }) : Conflict(new { message = "Đơn không còn có thể hủy." });
        }

        [HttpPost("orders/{id}/pay-momo")]
        [Authorize(Roles = "customer")]
        public async Task<IActionResult> RecreateMomoPayment(int id)
        {
            var order = await _storefrontService.GetOrderForPaymentStatusAsync(id);
            if (order == null || order.CustomerId?.ToString() != User.FindFirst("customer_id")?.Value) return NotFound(new { message = "Không tìm thấy đơn hàng." });
            if (order.PaymentStatus == "paid") return BadRequest(new { message = "Đơn hàng đã được thanh toán." });

            try
            {
                var backendBase = _config["App:BaseUrl"] ?? "http://localhost:5099";
                var momoReq = new MomoPaymentRequestDTO
                {
                    OrderId = order.Id,
                    Amount = order.TotalAmount,
                    ReturnUrl = $"{backendBase}/api/payment/momo/return",
                    NotifyUrl = $"{backendBase}/api/payment/momo/ipn"
                };
                var momoResult = await _paymentService.CreatePaymentAsync(momoReq);
                if (momoResult.Success)
                    return Ok(new { payUrl = momoResult.PayUrl, orderId = order.Id });

                return BadRequest(new { message = momoResult.Message ?? "Không thể tạo liên kết thanh toán MoMo." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }
    }

    public class StorefrontProductResponse
    {
        public int Id { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public string? Description { get; set; }
        public int? CategoryId { get; set; }
        public string? CategoryName { get; set; }
        public decimal Price { get; set; }
        public decimal OriginalPrice { get; set; }
        public string? UnitName { get; set; }
        public int StockQuantity { get; set; }
        public decimal DiscountAmount { get; set; }
        public decimal DiscountPercent { get; set; }
        public string? PromotionName { get; set; }
        public DateTime? PromotionEndsAt { get; set; }
        public string? ImageUrl { get; set; }
    }

    public class StorefrontCategoryResponse
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
    }

    public class StorefrontCustomerLoginRequest
    {
        [Required, StringLength(150)]
        public string Username { get; set; } = string.Empty;

        [Required, StringLength(128, MinimumLength = 6)]
        public string Password { get; set; } = string.Empty;
    }

    public class StorefrontCustomerRegisterRequest : StorefrontCustomerLoginRequest
    {
        [Required, StringLength(150, MinimumLength = 2)]
        public string FullName { get; set; } = string.Empty;

        [Required, StringLength(20)]
        public string Phone { get; set; } = string.Empty;
    }

    public class StorefrontAddressUpdateRequest
    {
        [Required, StringLength(500)]
        public string Address { get; set; } = string.Empty;
    }

    public class StorefrontAccountUpdateRequest
    {
        [Required, StringLength(150)]
        public string FullName { get; set; } = string.Empty;
        public string? Email { get; set; }
        public string? Address { get; set; }
        public DateTime? DateOfBirth { get; set; }
    }

    public class StorefrontCustomerProfile
    {
        public int Id { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string Phone { get; set; } = string.Empty;
        public string? Email { get; set; }
        public string? Address { get; set; }
        public DateTime? DateOfBirth { get; set; }
        public int RewardPoints { get; set; } = 0;
    }

    public class StorefrontOrderRequest
    {
        [Required, StringLength(36)] public string RequestId { get; set; } = "";
        public decimal? ExpectedTotal { get; set; }
        [Required, StringLength(150, MinimumLength = 2)]
        public string FullName { get; set; } = string.Empty;

        [Required, RegularExpression("^(0|\\+84)[35789]\\d{8}$", ErrorMessage = "Số điện thoại không hợp lệ.")]
        public string Phone { get; set; } = string.Empty;

        [Required, StringLength(500, MinimumLength = 5)]
        public string Address { get; set; } = string.Empty;

        [StringLength(500)]
        public string? Note { get; set; }

        public string? PromotionCode { get; set; }

        [Range(1, int.MaxValue)]
        public int? EventPromotionId { get; set; }

        /// <summary>Số điểm thưởng muốn dùng để giảm giá (1 điểm = 1.000 VNĐ)</summary>
        [Range(0, int.MaxValue)] public int PointsUsed { get; set; } = 0;

        /// <summary>Phương thức thanh toán: "cod" (mặc định) | "momo" | "bank"</summary>
        [StringLength(20)]
        public string? PaymentMethod { get; set; } = "cod";

        [Required, MinLength(1), MaxLength(30)]
        public List<StorefrontOrderLine> Items { get; set; } = new();
    }

    public class StorefrontOrderLine
    {
        [Range(1, int.MaxValue)]
        public int ProductId { get; set; }

        [Range(1, 1000)]
        public int Quantity { get; set; }
    }

    public class StorefrontPromotionRequest
    {
        [Range(1, int.MaxValue)]
        public int? EventPromotionId { get; set; }
        public string Code { get; set; } = string.Empty;
        [Range(typeof(decimal), "0", "79228162514264337593543950335")]
        public decimal OrderAmount { get; set; }
    }
}
