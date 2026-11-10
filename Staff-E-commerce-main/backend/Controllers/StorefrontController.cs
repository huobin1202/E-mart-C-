using backend.DTO;
using backend.Security;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers;

[ApiController]
[Route("api/storefront")]
public sealed class StorefrontController(
    PromotionService promotions,
    InvoiceService invoices,
    StorefrontService storefront,
    StorefrontAccountService accounts,
    StorefrontCheckoutService checkout,
    VoucherWalletService vouchers,
    OrderService orders,
    LoginThrottle throttle) : ControllerBase
{
    [HttpGet("promotions")]
    [AllowAnonymous]
    public async Task<IActionResult> GetStorefrontPromotions()
    {
        var items = await promotions.GetActivePromotionsAsync();
        return Ok(items.Where(item => item.Type == "event" || item.Type == "voucher" && item.Visibility == "public"));
    }

    [HttpGet("vouchers/discover")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> DiscoverVouchers()
    {
        if (!TryGetCustomerId(out var customerId)) return InvalidSession();
        return Ok(await vouchers.DiscoverAsync(customerId));
    }

    [HttpGet("vouchers")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> GetVoucherWallet()
    {
        if (!TryGetCustomerId(out var customerId)) return InvalidSession();
        return Ok(await vouchers.WalletAsync(customerId));
    }

    /// <summary>
    /// Shows one voucher by its exact code (this is the only way an Only-code voucher becomes visible).
    /// Ten unknown codes in ten minutes lock the lookup briefly so codes cannot be guessed.
    /// </summary>
    [HttpGet("vouchers/lookup")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> LookupVoucher([FromQuery] string? code)
    {
        if (!TryGetCustomerId(out var customerId)) return InvalidSession();
        if (string.IsNullOrWhiteSpace(code)) return BadRequest(new { message = "Nhập mã voucher." });
        var key = customerId.ToString();
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
        if (throttle.RetryAfter("voucher-code", key, ip) is { } wait)
            return StatusCode(429, new { message = $"Bạn đã nhập sai mã quá nhiều lần. Vui lòng thử lại sau {Math.Max(1, (int)Math.Ceiling(wait.TotalMinutes))} phút." });
        var voucher = await vouchers.LookupByCodeAsync(customerId, code);
        if (voucher == null)
        {
            throttle.RegisterFailure("voucher-code", key, ip, accountLimit: 10);
            return NotFound(new { message = "Mã voucher không tồn tại hoặc đã hết hạn." });
        }
        return Ok(voucher);
    }

    [HttpPost("vouchers/claim")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> ClaimVoucher([FromBody] VoucherClaimRequest request)
    {
        if (!TryGetCustomerId(out var customerId)) return InvalidSession();
        try { return Ok(await vouchers.ClaimAsync(customerId, request.PromotionId, request.Code)); }
        catch (BusinessRuleException exception) { return BusinessError(exception); }
    }

    [HttpGet("promotions/history")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> GetPromotionHistory()
    {
        if (!TryGetCustomerId(out var customerId)) return InvalidSession();
        return Ok((await vouchers.WalletAsync(customerId)).Where(v => v.WalletStatus is "used" or "expired"));
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
            ? await promotions.ValidateEventPromotionAsync(request.EventPromotionId.Value, request.OrderAmount)
            : await promotions.ValidatePromotionAsync(request.Code, request.OrderAmount);
        if (!request.EventPromotionId.HasValue && result.IsValid && result.Promotion != null)
        {
            if (!TryGetCustomerId(out var customerId)) return Unauthorized(new { message = "Đăng nhập để sử dụng voucher trong kho." });
            var issue = await vouchers.UsageIssueAsync(result.Promotion.Id, customerId);
            if (issue != null) { result.IsValid = false; result.Message = issue; result.DiscountAmount = 0; }
        }
        return Ok(result);
    }

    [HttpGet("register/phone-availability")]
    [AllowAnonymous]
    public async Task<IActionResult> CheckRegistrationPhone([FromQuery] string phone)
    {
        try { return Ok(new { available = await accounts.IsRegistrationPhoneAvailableAsync(phone) }); }
        catch (BusinessRuleException exception) { return BusinessError(exception); }
    }

    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> RegisterCustomer([FromBody] StorefrontCustomerRegisterRequest request)
    {
        try { return Ok(await accounts.RegisterAsync(request)); }
        catch (BusinessRuleException exception) { return BusinessError(exception); }
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] StorefrontCustomerLoginRequest request)
    {
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
        try
        {
            var result = await accounts.LoginAsync(request, ip);
            return Ok(result);
        }
        catch (BusinessRuleException exception)
        {
            return BusinessError(exception);
        }
    }

    [HttpGet("account")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> GetAccount()
    {
        if (!TryGetCustomerId(out var customerId)) return InvalidSession();
        try { return Ok(await accounts.GetProfileAsync(customerId)); }
        catch (BusinessRuleException exception) { return BusinessError(exception); }
    }

    [HttpPut("account/address")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> UpdateAccountAddress([FromBody] StorefrontAddressUpdateRequest request)
    {
        if (!TryGetCustomerId(out var customerId)) return InvalidSession();
        try { return Ok(await accounts.UpdateAddressAsync(customerId, request)); }
        catch (BusinessRuleException exception) { return BusinessError(exception); }
    }

    [HttpPut("account")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> UpdateAccount([FromBody] StorefrontAccountUpdateRequest request)
    {
        if (!TryGetCustomerId(out var customerId)) return InvalidSession();
        try { return Ok(await accounts.UpdateAsync(customerId, request)); }
        catch (BusinessRuleException exception) { return BusinessError(exception); }
    }

    [HttpGet("orders")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> GetCustomerOrders()
    {
        if (!TryGetCustomerId(out var customerId)) return InvalidSession();
        try
        {
            await accounts.GetProfileAsync(customerId);
            return Ok(await storefront.GetCustomerOrdersAsync(customerId));
        }
        catch (BusinessRuleException exception) { return BusinessError(exception); }
    }

    [HttpGet("orders/{id:int}/invoice")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> GetCustomerInvoice(int id)
    {
        if (!TryGetCustomerId(out var customerId)) return InvalidSession();
        var order = await storefront.GetCustomerOrderStatusAsync(id, customerId);
        if (!order.Exists) return NotFound(new { message = "Không tìm thấy đơn hàng." });
        if (order.Status != "completed")
            return Conflict(new { message = "Chỉ xem được hóa đơn của đơn hàng đã thành công." });
        var invoice = await invoices.GetInvoiceAsync(id);
        return invoice == null
            ? NotFound(new { message = "Hóa đơn chưa được phát hành. Vui lòng thử lại sau." })
            : Ok(invoice);
    }

    [HttpGet("products")]
    [AllowAnonymous]
    public async Task<ActionResult<List<StorefrontProductDTO>>> GetProducts() =>
        Ok(await storefront.GetAvailableProductsAsync());

    [HttpGet("products/page")]
    [AllowAnonymous]
    public async Task<ActionResult<StorefrontProductPageDTO>> GetProductPage(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 40,
        [FromQuery] bool discountedOnly = false) =>
        Ok(await storefront.GetAvailableProductsPageAsync(page, pageSize, discountedOnly));

    [HttpGet("products/{id:int}")]
    [AllowAnonymous]
    public async Task<ActionResult<StorefrontProductDTO>> GetProduct(int id)
    {
        var product = await storefront.GetAvailableProductAsync(id);
        return product == null ? NotFound(new { message = "Sản phẩm hiện không còn khả dụng." }) : Ok(product);
    }

    [HttpGet("categories")]
    [AllowAnonymous]
    public async Task<ActionResult<List<StorefrontCategoryDTO>>> GetCategories() =>
        Ok(await storefront.GetActiveCategoriesAsync());

    [HttpGet("payment-options")]
    [AllowAnonymous]
    public IActionResult GetPaymentOptions() => Ok(checkout.GetPaymentOptions());

    [HttpPost("orders")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> CreateOrder([FromBody] StorefrontOrderRequest request)
    {
        if (!TryGetCustomerId(out var customerId))
            return Unauthorized(new { message = "Đăng nhập bằng tài khoản khách hàng để đặt đơn." });
        try { return Ok(await checkout.CreateAsync(customerId, request)); }
        catch (BusinessRuleException exception) { return BusinessError(exception); }
    }

    [HttpGet("orders/{id:int}/payment-status")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> GetOrderPaymentStatus(int id)
    {
        if (!TryGetCustomerId(out var customerId)) return InvalidSession();
        try { return Ok(await checkout.GetPaymentStatusAsync(customerId, id)); }
        catch (BusinessRuleException exception) { return BusinessError(exception); }
    }

    [HttpPost("orders/{id:int}/cancel")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> CancelOrder(int id, [FromBody] RejectOrderDTO? request)
    {
        if (!TryGetCustomerId(out var customerId)) return InvalidSession();
        try
        {
            return await orders.CancelByCustomerAsync(id, customerId, request?.Reason)
                ? Ok(new { message = "Đã hủy đơn hàng." })
                : NotFound(new { message = "Không tìm thấy đơn hàng." });
        }
        catch (InvalidOperationException exception) { return Conflict(new { message = exception.Message }); }
    }

    [HttpPost("orders/{id:int}/pay-momo")]
    [Authorize(Roles = "customer")]
    public async Task<IActionResult> RecreateMomoPayment(int id)
    {
        if (!TryGetCustomerId(out var customerId)) return InvalidSession();
        try { return Ok(await checkout.RecreateMomoPaymentAsync(customerId, id)); }
        catch (BusinessRuleException exception) { return BusinessError(exception); }
    }

    private bool TryGetCustomerId(out int customerId) =>
        int.TryParse(User.FindFirst("customer_id")?.Value, out customerId);

    private UnauthorizedObjectResult InvalidSession() =>
        Unauthorized(new { message = "Phiên đăng nhập không hợp lệ." });

    private ObjectResult BusinessError(BusinessRuleException exception) =>
        StatusCode(exception.StatusCode, new
        {
            message = exception.Message,
            checkoutNotCreated = exception.CheckoutNotCreated ? true : (bool?)null
        });
}

public sealed class VoucherClaimRequest
{
    public int? PromotionId { get; set; }
    public string? Code { get; set; }
}
