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
        private readonly IHubContext<OrderHub>? _orderHub;

        public StorefrontController(
            JwtService jwt,
            PromotionService promotions,
            PaymentService paymentService,
            IConfiguration config,
            InvoiceService invoiceService,
            StorefrontService storefrontService,
            IHubContext<OrderHub>? orderHub = null)
        {
            _jwt = jwt;
            _promotions = promotions;
            _paymentService = paymentService;
            _config = config;
            _invoiceService = invoiceService;
            _storefrontService = storefrontService;
            _orderHub = orderHub;
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
            else if (await _storefrontService.CustomerHasAccountAsync(customer.Id))
                return Conflict(new { message = "Số điện thoại này đã được đăng ký." });

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
            await _storefrontService.SaveRegistrationAsync(customer, user);

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

            if (user?.Customer == null || !string.Equals(user.RoleEntity?.Name, "customer", StringComparison.OrdinalIgnoreCase) ||
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

        [HttpPost("orders")]
        [AllowAnonymous]
        public async Task<IActionResult> CreateOrder([FromBody] StorefrontOrderRequest request)
        {
            var requestedLines = request.Items
                .GroupBy(line => line.ProductId)
                .Select(group => new { ProductId = group.Key, Quantity = group.Sum(line => line.Quantity) })
                .ToList();

            if (request.EventPromotionId.HasValue && !string.IsNullOrWhiteSpace(request.PromotionCode))
                return BadRequest(new { message = "Chỉ chọn một ưu đãi sự kiện hoặc nhập một mã voucher." });
            if (requestedLines.Any(line => line.Quantity > 1000))
                return BadRequest(new { message = "Số lượng mỗi sản phẩm không được vượt quá 1.000." });

            try
            {
                var productIds = requestedLines.Select(line => line.ProductId).ToList();
                var products = await _storefrontService.GetActiveProductsByIdsAsync(productIds);

                if (products.Count != productIds.Count)
                    return BadRequest(new { message = "Một hoặc nhiều sản phẩm không còn bán. Hãy tải lại giỏ hàng." });

                var productPromotions = await _storefrontService.GetActiveProductPromotionsAsync(
                    productIds, DateTimeHelper.VietnamToday);

                // Order ownership/points belong to the signed-in customer, not the recipient's phone.
                var authenticated = User.Identity?.IsAuthenticated == true;
                var customer = authenticated ? await GetAuthenticatedCustomerAsync()
                    : await _storefrontService.GetCustomerByPhoneAsync(request.Phone.Trim(), request.Phone.Trim());
                if (authenticated && customer == null)
                    return Unauthorized(new { message = "Không xác định được tài khoản khách hàng đặt đơn." });
                if (!authenticated && request.PointsUsed > 0)
                    return Unauthorized(new { message = "Đăng nhập để sử dụng điểm của tài khoản." });
                if (customer != null && !customer.IsActive)
                    return Conflict(new { message = "Không thể sử dụng số điện thoại này để đặt hàng." });

                if (customer == null)
                {
                    customer = new Customer
                    {
                        FullName = request.FullName.Trim(),
                        Phone = request.Phone.Trim(),
                        Address = request.Address.Trim(),
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };
                    await _storefrontService.AddCustomerAsync(customer);
                }

                var now = DateTime.UtcNow;
                var items = requestedLines.Select(line =>
                {
                    var product = products[line.ProductId];
                    var productDiscount = productPromotions
                        .Where(promotion => promotion.ProductId == product.Id)
                        .Select(promotion => CalculateProductDiscount(product.Price, promotion.DiscountType, promotion.Value, promotion.MaxDiscount))
                        .DefaultIfEmpty(0m)
                        .Max();
                    var unitPrice = Math.Max(0, product.Price - productDiscount);
                    return new OrderItem
                    {
                        ProductId = product.Id,
                        Quantity = line.Quantity,
                        UnitPrice = unitPrice,
                        TotalPrice = unitPrice * line.Quantity,
                        CreatedAt = now
                    };
                }).ToList();
                var subtotal = items.Sum(item => item.TotalPrice);
                var discount = 0m;
                Promotion? appliedPromotion = null;
                if (request.EventPromotionId.HasValue || !string.IsNullOrWhiteSpace(request.PromotionCode))
                {
                    var validation = request.EventPromotionId.HasValue
                        ? await _promotions.ValidateEventPromotionAsync(request.EventPromotionId.Value, subtotal)
                        : await _promotions.ValidatePromotionAsync(request.PromotionCode!, subtotal);
                    if (!validation.IsValid || validation.Promotion == null)
                        return BadRequest(new { message = validation.Message });
                    discount = Math.Min(subtotal, validation.DiscountAmount);
                    appliedPromotion = await _storefrontService.GetPromotionAsync(validation.Promotion.Id);
                }

                // Áp dụng điểm thưởng khách hàng (nếu có yêu cầu dùng điểm)
                int pointsUsed = 0;
                if (request.PointsUsed > 0 && customer != null && customer.RewardPoints > 0)
                {
                    int maxPointsUsable = Math.Min(customer.RewardPoints, (int)((subtotal - discount) / 1000m));
                    pointsUsed = Math.Min(request.PointsUsed, maxPointsUsable);
                    if (pointsUsed > 0)
                    {
                        decimal pointsDiscount = pointsUsed * 1000m; // 1 điểm = 1.000 VNĐ
                        discount += pointsDiscount;
                        customer.RewardPoints -= pointsUsed;
                        customer.UpdatedAt = now;
                    }
                }

                // Phương thức thanh toán chuẩn hóa theo check constraint DB
                string requestedMethod = (request.PaymentMethod ?? "cod").ToLowerInvariant();
                string dbPaymentMethod = requestedMethod switch
                {
                    "momo" => "e_wallet",
                    "card" or "bank" => "card",
                    _ => "cash"
                };

                var order = new Order
                {
                    OrderNumber = $"WEB-{Guid.NewGuid():N}",
                    OrderType = "mobile",
                    CustomerId = customer.Id,
                    UserId = null,
                    Status = "pending",
                    Subtotal = subtotal,
                    Discount = discount,
                    TotalAmount = Math.Max(0, subtotal - discount),
                    PaymentMethod = dbPaymentMethod,
                    PaymentStatus = "pending",
                    PromotionId = appliedPromotion?.Id,
                    RecipientName = request.FullName.Trim(),
                    RecipientPhone = request.Phone.Trim(),
                    ShippingAddress = request.Address.Trim(),
                    Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(),
                    CreatedAt = now,
                    UpdatedAt = now,
                    OrderItems = items
                };

                await _storefrontService.SaveOrderAndReduceInventoryAsync(
                    order,
                    appliedPromotion,
                    requestedLines.Select(line => (line.ProductId, line.Quantity)).ToList(),
                    products.ToDictionary(pair => pair.Key, pair => pair.Value.ProductName));

                // Tạo liên kết thanh toán MoMo nếu khách chọn MoMo
                string? momoPayUrl = null;
                if (requestedMethod == "momo")
                {
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
                            momoPayUrl = momoResult.PayUrl;
                    }
                    catch (Exception ex)
                    {
                        Console.Error.WriteLine($"[MoMo] Failed to create payment URL: {ex.Message}");
                    }
                }

                // Mã VietQR nếu khách chọn chuyển khoản ngân hàng
                string? vietQrUrl = null;
                if (requestedMethod == "bank")
                {
                    vietQrUrl = $"https://img.vietqr.io/image/MB-0987654321-compact2.png?amount={Math.Round(order.TotalAmount):0}&addInfo=EMART_{order.OrderNumber}&accountName=EMART%20STORE";
                }

                // Bắn thông báo Realtime SignalR tới Web POS
                if (_orderHub != null)
                {
                    _ = _orderHub.Clients.All.SendAsync("NewOrderReceived", new
                    {
                        orderId = order.Id,
                        orderNumber = order.OrderNumber,
                        customerName = request.FullName.Trim(),
                        phone = request.Phone.Trim(),
                        totalAmount = order.TotalAmount,
                        itemCount = items.Count,
                        paymentMethod = requestedMethod,
                        createdAt = order.CreatedAt
                    });
                }

                return Ok(new
                {
                    order.Id,
                    order.OrderNumber,
                    order.Status,
                    order.Subtotal,
                    order.Discount,
                    order.TotalAmount,
                    paymentMethod = requestedMethod,
                    order.PaymentStatus,
                    order.CreatedAt,
                    momoPayUrl,
                    order.RecipientName,
                    order.RecipientPhone,
                    order.ShippingAddress,
                    order.Note,
                    vietQrUrl,
                    pointsUsed
                });
            }
            catch (DbUpdateException)
            {
                return Conflict(new { message = "Không thể lưu đơn hàng. Hãy thử lại sau." });
            }
            catch (InvalidOperationException ex) when (ex.Message.StartsWith("Sản phẩm", StringComparison.Ordinal))
            {
                return Conflict(new { message = ex.Message });
            }
            catch
            {
                throw;
            }
        }

        [HttpGet("orders/{id}/payment-status")]
        [AllowAnonymous]
        public async Task<IActionResult> GetOrderPaymentStatus(int id)
        {
            var order = await _storefrontService.GetOrderForPaymentStatusAsync(id);
            if (order == null) return NotFound(new { message = "Không tìm thấy đơn hàng." });

            string? vietQrUrl = null;
            if (order.PaymentStatus == "pending")
            {
                vietQrUrl = $"https://img.vietqr.io/image/MB-0987654321-compact2.png?amount={Math.Round(order.TotalAmount):0}&addInfo=EMART_{order.OrderNumber}&accountName=EMART%20STORE";
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

        [HttpPost("orders/{id}/pay-momo")]
        [AllowAnonymous]
        public async Task<IActionResult> RecreateMomoPayment(int id)
        {
            var order = await _storefrontService.GetOrderForPaymentStatusAsync(id);
            if (order == null) return NotFound(new { message = "Không tìm thấy đơn hàng." });
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
        public int PointsUsed { get; set; } = 0;

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
