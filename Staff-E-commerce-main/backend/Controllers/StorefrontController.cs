using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;
using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/storefront")]
    public class StorefrontController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly JwtService _jwt;

        public StorefrontController(AppDbContext db, JwtService jwt)
        {
            _db = db;
            _jwt = jwt;
        }

        [HttpPost("login")]
        [AllowAnonymous]
        public async Task<IActionResult> Login([FromBody] StorefrontPhoneLoginRequest request)
        {
            var phone = NormalizePhone(request.Phone);
            if (!Regex.IsMatch(phone, "^0[35789]\\d{8}$"))
                return BadRequest(new { message = "Số điện thoại Việt Nam chưa đúng định dạng." });

            var internationalPhone = $"+84{phone[1..]}";
            var customer = await _db.Customers.FirstOrDefaultAsync(item =>
                item.Phone == phone || item.Phone == internationalPhone);

            if (customer == null)
            {
                customer = new Customer
                {
                    FullName = string.Empty,
                    Phone = phone,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                _db.Customers.Add(customer);
                try
                {
                    await _db.SaveChangesAsync();
                }
                catch (DbUpdateException)
                {
                    _db.Entry(customer).State = EntityState.Detached;
                    customer = await _db.Customers.FirstOrDefaultAsync(item =>
                        item.Phone == phone || item.Phone == internationalPhone);
                    if (customer == null) throw;
                }
            }

            if (!customer.IsActive)
                return Unauthorized(new { message = "Tài khoản khách hàng đã bị khóa." });

            var (token, expiresIn) = _jwt.GenerateCustomerToken(customer);
            return Ok(new
            {
                token,
                tokenType = "Bearer",
                expiresIn,
                customer = ToCustomerProfile(customer)
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

        [HttpPut("account")]
        [Authorize(Roles = "customer")]
        public async Task<IActionResult> UpdateAccount([FromBody] StorefrontAccountUpdateRequest request)
        {
            var fullName = request.FullName.Trim();
            if (fullName.Length < 2)
                return BadRequest(new { message = "Họ tên cần có ít nhất 2 ký tự." });

            var customer = await GetAuthenticatedCustomerAsync();
            if (customer == null)
                return Unauthorized(new { message = "Phiên đăng nhập không hợp lệ." });

            customer.FullName = fullName;
            customer.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            return Ok(ToCustomerProfile(customer));
        }

        [HttpGet("orders")]
        [Authorize(Roles = "customer")]
        public async Task<IActionResult> GetCustomerOrders()
        {
            var customer = await GetAuthenticatedCustomerAsync();
            if (customer == null)
                return Unauthorized(new { message = "Phiên đăng nhập không hợp lệ." });

            var orders = await _db.Orders
                .AsNoTracking()
                .Where(order => order.CustomerId == customer.Id)
                .OrderByDescending(order => order.CreatedAt)
                .ThenByDescending(order => order.Id)
                .Select(order => new
                {
                    order.Id,
                    order.OrderNumber,
                    orderType = order.OrderNumber.StartsWith("WEB-") ? "mobile" : order.OrderType,
                    order.Status,
                    order.PaymentStatus,
                    order.PaymentMethod,
                    order.Subtotal,
                    order.Discount,
                    order.TotalAmount,
                    order.Note,
                    order.CreatedAt,
                    items = order.OrderItems.Select(line => new
                    {
                        productId = line.ProductId,
                        productName = line.Product != null ? line.Product.ProductName : "Sản phẩm",
                        imageUrl = line.Product != null ? line.Product.ImageUrl : null,
                        quantity = line.Quantity,
                        unitPrice = line.UnitPrice,
                        totalPrice = line.TotalPrice
                    }).ToList()
                })
                .ToListAsync();

            return Ok(orders);
        }

        private async Task<Customer?> GetAuthenticatedCustomerAsync()
        {
            var idClaim = User.FindFirst("customer_id")?.Value;
            return int.TryParse(idClaim, out var customerId)
                ? await _db.Customers.FirstOrDefaultAsync(customer => customer.Id == customerId && customer.IsActive)
                : null;
        }

        private static StorefrontCustomerProfile ToCustomerProfile(Customer customer) => new()
        {
            Id = customer.Id,
            FullName = customer.FullName,
            Phone = customer.Phone ?? string.Empty
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
        public async Task<ActionResult<List<StorefrontProductResponse>>> GetProducts()
        {
            var products = await _db.Products
                .AsNoTracking()
                .Where(product => product.IsActive && product.Inventory != null && product.Inventory.Quantity > 0)
                .OrderBy(product => product.ProductName)
                .Select(product => new StorefrontProductResponse
                {
                    Id = product.Id,
                    ProductName = product.ProductName,
                    CategoryId = product.CategoryId,
                    CategoryName = product.Category != null ? product.Category.Name : null,
                    Price = product.Price,
                    ImageUrl = product.ImageUrl
                })
                .ToListAsync();

            return Ok(products);
        }

        [HttpGet("categories")]
        [AllowAnonymous]
        public async Task<ActionResult<List<StorefrontCategoryResponse>>> GetCategories()
        {
            var categories = await _db.Categories
                .AsNoTracking()
                .Where(category => category.IsActive)
                .OrderBy(category => category.Name)
                .Select(category => new StorefrontCategoryResponse
                {
                    Id = category.Id,
                    Name = category.Name
                })
                .ToListAsync();

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

            if (requestedLines.Any(line => line.Quantity > 1000))
                return BadRequest(new { message = "Số lượng mỗi sản phẩm không được vượt quá 1.000." });

            await using var transaction = await _db.Database.BeginTransactionAsync();
            try
            {
                var productIds = requestedLines.Select(line => line.ProductId).ToList();
                var products = await _db.Products
                    .Where(product => productIds.Contains(product.Id) && product.IsActive)
                    .ToDictionaryAsync(product => product.Id);

                if (products.Count != productIds.Count)
                    return BadRequest(new { message = "Một hoặc nhiều sản phẩm không còn bán. Hãy tải lại giỏ hàng." });

                var customer = await _db.Customers.FirstOrDefaultAsync(item => item.Phone == request.Phone.Trim());
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
                    _db.Customers.Add(customer);
                    await _db.SaveChangesAsync();
                }

                var now = DateTime.UtcNow;
                var items = requestedLines.Select(line =>
                {
                    var product = products[line.ProductId];
                    return new OrderItem
                    {
                        ProductId = product.Id,
                        Quantity = line.Quantity,
                        UnitPrice = product.Price,
                        TotalPrice = product.Price * line.Quantity,
                        CreatedAt = now
                    };
                }).ToList();
                var subtotal = items.Sum(item => item.TotalPrice);

                var order = new Order
                {
                    OrderNumber = $"WEB-{Guid.NewGuid():N}",
                    OrderType = "mobile",
                    CustomerId = customer.Id,
                    UserId = null,
                    Status = "pending",
                    Subtotal = subtotal,
                    Discount = 0,
                    TotalAmount = subtotal,
                    Note = $"Người nhận: {request.FullName.Trim()}\nSố điện thoại: {request.Phone.Trim()}\nĐịa chỉ giao hàng: {request.Address.Trim()}{(string.IsNullOrWhiteSpace(request.Note) ? "" : $"\nGhi chú: {request.Note.Trim()}")}",
                    CreatedAt = now,
                    UpdatedAt = now,
                    OrderItems = items
                };

                _db.Orders.Add(order);
                await _db.SaveChangesAsync();

                foreach (var line in requestedLines)
                {
                    var updated = await _db.Inventory
                        .Where(stock => stock.ProductId == line.ProductId && stock.Quantity >= line.Quantity)
                        .ExecuteUpdateAsync(update => update
                            .SetProperty(stock => stock.Quantity, stock => stock.Quantity - line.Quantity)
                            .SetProperty(stock => stock.UpdatedAt, now));

                    if (updated == 0)
                    {
                        var productName = products[line.ProductId].ProductName;
                        await transaction.RollbackAsync();
                        return Conflict(new { message = $"Sản phẩm {productName} vừa hết hàng hoặc không đủ số lượng." });
                    }
                }

                await transaction.CommitAsync();
                return Ok(new
                {
                    order.Id,
                    order.OrderNumber,
                    order.Status,
                    order.Subtotal,
                    order.TotalAmount,
                    order.CreatedAt
                });
            }
            catch (DbUpdateException)
            {
                await transaction.RollbackAsync();
                return Conflict(new { message = "Không thể lưu đơn hàng. Hãy thử lại sau." });
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        }
    }

    public class StorefrontProductResponse
    {
        public int Id { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public int? CategoryId { get; set; }
        public string? CategoryName { get; set; }
        public decimal Price { get; set; }
        public string? ImageUrl { get; set; }
    }

    public class StorefrontCategoryResponse
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
    }

    public class StorefrontPhoneLoginRequest
    {
        [Required, StringLength(20)]
        public string Phone { get; set; } = string.Empty;
    }

    public class StorefrontAccountUpdateRequest
    {
        [Required, StringLength(150)]
        public string FullName { get; set; } = string.Empty;
    }

    public class StorefrontCustomerProfile
    {
        public int Id { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string Phone { get; set; } = string.Empty;
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
}
