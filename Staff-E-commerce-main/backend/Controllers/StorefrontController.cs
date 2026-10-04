using System.ComponentModel.DataAnnotations;
using backend.Data;
using backend.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/storefront")]
    [AllowAnonymous]
    public class StorefrontController : ControllerBase
    {
        private readonly AppDbContext _db;

        public StorefrontController(AppDbContext db) => _db = db;

        [HttpGet("products")]
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
