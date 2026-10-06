using Microsoft.AspNetCore.Mvc;
using backend.Models;
using backend.Services;
using backend.DTO;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ProductsController : ControllerBase
    {
        private readonly ProductService _productService;

        public ProductsController(ProductService productService)
        {
            _productService = productService;
        }

        // GET api/products/paginated
        // GET api/products/paginated - ENDPOINT CHÍNH

        [HttpGet("paginated")]
        public async Task<ActionResult<PaginationResult<ProductDTO>>> GetPaginatedProducts(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 12,
            [FromQuery] string? search = null,
            [FromQuery] int? categoryId = null,
            [FromQuery] int? supplierId = null,
            [FromQuery] decimal? minPrice = null,
            [FromQuery] decimal? maxPrice = null,
            [FromQuery] string? sortBy = "",
            [FromQuery] int? status = null)
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 12;

            // var userId = User.FindFirst("uid")?.Value;
            // Console.WriteLine($"🔍 User ID from claims: {userId}");

            // if (string.IsNullOrEmpty(userId))
            //     return BadRequest("User ID not found in token");

            var result = await _productService.GetPaginatedProductsAsync(
                page, pageSize, search, categoryId, supplierId, minPrice, maxPrice, sortBy, status);
            return Ok(result);
        }



        // GET api/products/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<ProductDTO>> GetProduct(int id)
        {
            try
            {
                var product = await _productService.GetProductByIdAsync(id);
                if (product == null)
                    return NotFound($"Product with ID {id} not found");

                return Ok(product);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }

        // GET api/products/barcode/{code}
        [HttpGet("barcode/{code}")]
        public async Task<ActionResult<ProductDTO>> GetProductByBarcode(string code)
        {
            try
            {
                var product = await _productService.GetProductByBarcodeAsync(code);
                if (product == null)
                    return NotFound(new { message = $"Không tìm thấy sản phẩm có mã vạch: {code}" });

                return Ok(product);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }

        // POST api/products
        // Accept ProductDTO in body and map to Product entity before creating
        [HttpPost]
        public async Task<ActionResult<ProductDTO>> CreateProduct([FromBody] ProductDTO productDto)
        {
            if (productDto == null)
                return BadRequest("Product payload is required");

            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            try
            {
                // Map DTO -> Entity (only required fields)
                var product = new Product
                {
                    ProductName = productDto.ProductName,
                    Sku = productDto.Sku,
                    // Barcode = productDto.Barcode,
                    CategoryId = productDto.CategoryId,
                    SupplierId = productDto.SupplierId,
                    Price = productDto.Price,
                    Cost = productDto.Cost,
                    UnitId = productDto.UnitId,
                    Description = productDto.Description,
                    ImageUrl = productDto.ImageUrl,
                    IsActive = productDto.IsActive,
                    CreatedAt = productDto.CreatedAt ?? DateTime.UtcNow,
                    UpdatedAt = productDto.UpdatedAt ?? DateTime.UtcNow
                };

                var createdDto = await _productService.CreateProductAsync(product);
                return CreatedAtAction(nameof(GetProduct), new { id = createdDto.Id }, createdDto);
            }
            catch (ValidationException vex)
            {
                return BadRequest(new { errors = vex.Errors }); // trả map field -> messages
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPut("{id}")]
        public async Task<ActionResult<ProductDTO>> UpdateProduct(int id, [FromBody] Product product)
        {
            try
            {
                product.Id = id;
                product.UpdatedAt = DateTime.UtcNow;

                var updatedProduct = await _productService.UpdateProductAsync(product);
                return updatedProduct;
            }
            catch (ArgumentException ex)
            {
                return NotFound(ex.Message);
            }
            catch (Exception ex)
            {
                return StatusCode(500, "Lỗi server khi cập nhật sản phẩm");
            }
        }


        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteProduct(int id)
        {
            try
            {
                var result = await _productService.DeleteProductAsync(id);
                return result ? Ok("Xóa thành công") : NotFound("Không tìm thấy sản phẩm");
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
        }

        [HttpPost("upload-image")]
        public async Task<IActionResult> UploadImage([FromForm] IFormFile image, [FromQuery] int? productId)
        {
            if (image == null || image.Length == 0)
                return BadRequest(new { message = "No file uploaded" });

            var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".gif", ".webp" };
            var extension = Path.GetExtension(image.FileName).ToLowerInvariant();
            if (!allowedExtensions.Contains(extension))
                return BadRequest(new { message = "Invalid file type" });

            if (image.Length > 5 * 1024 * 1024)
                return BadRequest(new { message = "File size exceeds 5MB" });

            try
            {
                var uploadsFolder = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "assets", "images", "products");

                if (!Directory.Exists(uploadsFolder))
                    Directory.CreateDirectory(uploadsFolder);

                // Nếu có productId, xóa TẤT CẢ ảnh cũ của product này (mọi extension)
                if (productId.HasValue)
                {
                    var oldFiles = Directory.GetFiles(uploadsFolder, $"product-{productId.Value}.*");
                    foreach (var oldFile in oldFiles)
                    {
                        try
                        {
                            System.IO.File.Delete(oldFile);
                            Console.WriteLine($"Deleted old image: {oldFile}");
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"Could not delete {oldFile}: {ex.Message}");
                        }
                    }
                }

                // Tạo tên file mới
                var fileName = productId.HasValue
                    ? $"product-{productId.Value}{extension}"
                    : $"temp-{DateTime.UtcNow.Ticks}{extension}";

                var filePath = Path.Combine(uploadsFolder, fileName);

                // Lưu file mới
                using (var stream = new FileStream(filePath, FileMode.Create))
                {
                    await image.CopyToAsync(stream);
                }

                var imageUrl = $"/assets/images/products/{fileName}";
                Console.WriteLine($"Uploaded new image: {imageUrl}");

                return Ok(new { imageUrl });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error uploading file", error = ex.Message });
            }
        }


        // ĐỪNG XÓA LÀM ƠN = lẤY DANH SÁCH SẢN PHẨM CÒN HÀNG TRONG CỬA HÀNG

        [HttpGet("available")]
        public async Task<ActionResult<PaginationResult<ProductDTO>>> GetAvailableProducts(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20
        )
        {
            try
            {
                // Validate page & pageSize
                if (page < 1) page = 1;
                if (pageSize < 1 || pageSize > 100) pageSize = 20;

                // Gọi service lấy sản phẩm còn hàng
                var result = await _productService.GetAvailableProductsAsync(page, pageSize);

                return Ok(result);
            }
            catch (ArgumentException ex)
            {
                // Lỗi liên quan tới input
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                // Lỗi server
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }

        // TÌM KIẾM
        // GET api/products/search?keyword=...
        [HttpGet("search")]
        public async Task<ActionResult<IEnumerable<ProductDTO>>> SearchProducts([FromQuery] string keyword)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(keyword))
                    return BadRequest("Search keyword is required");

                var products = await _productService.SearchProductsAsync(keyword);
                return Ok(products);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }


    }
}
