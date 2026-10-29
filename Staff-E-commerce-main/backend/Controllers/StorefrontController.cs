using backend.DTO;
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
    StorefrontCheckoutService checkout) : ControllerBase
{
    [HttpGet("promotions")]
    [AllowAnonymous]
    public async Task<IActionResult> GetStorefrontPromotions()
    {
        var items = await promotions.GetActivePromotionsAsync();
        return Ok(items.Where(item => item.Type == "event"));
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
        return Ok(result);
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
        try { return Ok(await accounts.LoginAsync(request)); }
        catch (BusinessRuleException exception) { return BusinessError(exception); }
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
