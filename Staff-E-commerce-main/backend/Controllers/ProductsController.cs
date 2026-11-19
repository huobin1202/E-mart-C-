using Microsoft.AspNetCore.Mvc;
using backend.Models;
using backend.Services;
using backend.DTO;
using backend.Security;
using backend.Helpers;

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
            [FromQuery] int? status = null,
            [FromQuery] string? stockStatus = null)
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 12;

            // var userId = User.FindFirst("uid")?.Value;
            // Console.WriteLine($"🔍 User ID from claims: {userId}");

            // if (string.IsNullOrEmpty(userId))
            //     return BadRequest("User ID not found in token");

            var result = await _productService.GetPaginatedProductsAsync(
                page, pageSize, search, categoryId, supplierId, minPrice, maxPrice, sortBy, status, stockStatus);
            return Ok(result);
        }

        [HttpPost("advanced-search")]
        [ReadOnlyRequest]
        public async Task<ActionResult<PaginationResult<ProductDTO>>> AdvancedSearch(
            [FromBody] ProductAdvancedSearchRequestDTO request)
        {
            try
            {
                return Ok(await _productService.AdvancedSearchProductsAsync(request));
            }
            catch (ValidationException exception)
            {
                return BadRequest(new { errors = exception.Errors });
            }
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
                return this.ServerError(ex);
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
                return this.ServerError(ex);
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
                    StockQuantity = productDto.StockQuantity,
                    UnitId = productDto.UnitId,
                    Description = productDto.Description,
                    ImageUrl = productDto.ImageUrl,
                    IsActive = productDto.IsActive,
                    CreatedAt = productDto.CreatedAt ?? DateTime.UtcNow,
                    UpdatedAt = productDto.UpdatedAt ?? DateTime.UtcNow
                };

                var createdDto = await _productService.CreateProductAsync(product, userId: CurrentUserId());
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
        public async Task<ActionResult<ProductDTO>> UpdateProduct(int id, [FromBody] ProductUpdateDTO productDto)
        {
            try
            {
                // StockQuantity in the body is ignored: stock changes only through inventory adjustments.
                var product = new Product
                {
                    Id = id,
                    ProductName = productDto.ProductName,
                    Sku = productDto.Sku,
                    Barcode = productDto.Barcode,
                    CategoryId = productDto.CategoryId,
                    SupplierId = productDto.SupplierId,
                    Price = productDto.Price,
                    Cost = productDto.Cost,
                    UnitId = productDto.UnitId,
                    Description = productDto.Description,
                    ImageUrl = productDto.ImageUrl,
                    IsActive = productDto.IsActive,
                    UpdatedAt = DateTime.UtcNow
                };

                var updatedProduct = await _productService.UpdateProductAsync(product);
                return updatedProduct;
            }
            catch (ValidationException vex)
            {
                return BadRequest(new { errors = vex.Errors });
            }
            catch (ArgumentException ex)
            {
                return NotFound(new { message = ex.Message });
            }
        }

        /// <summary>Ngừng bán sản phẩm. Gọi lặp lại vẫn giữ trạng thái ngừng bán.</summary>
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteProduct(int id)
        {
            try
            {
                var result = await _productService.DeleteProductAsync(id);
                return result ? Ok(new { message = "Đã ngừng bán sản phẩm." }) : NotFound(new { message = "Không tìm thấy sản phẩm" });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>Đặt trạng thái bán rõ ràng: isActive=true để bán lại, false để ngừng bán.</summary>
        [HttpPatch("{id:int}/status")]
        public async Task<IActionResult> SetProductStatus(int id, [FromQuery] bool isActive)
        {
            try
            {
                var result = await _productService.SetProductActiveAsync(id, isActive);
                return result
                    ? Ok(new { message = isActive ? "Đã mở bán lại sản phẩm." : "Đã ngừng bán sản phẩm.", isActive })
                    : NotFound(new { message = "Không tìm thấy sản phẩm" });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Uploads a new image and returns its URL. The current product image is left untouched until the product
        /// is saved with the new URL, so a failed or cancelled save never leaves the product with a broken image.
        /// </summary>
        [HttpPost("upload-image")]
        public async Task<IActionResult> UploadImage([FromForm] IFormFile image, [FromQuery] int? productId)
        {
            var error = await ProductImageStorage.ValidateAsync(image);
            if (error != null) return BadRequest(new { message = error });
            var imageUrl = await ProductImageStorage.SaveAsync(image, productId);
            return Ok(new { imageUrl });
        }

        private int? CurrentUserId() => int.TryParse(User.FindFirst("uid")?.Value, out var id) ? id : null;


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
                return this.ServerError(ex);
            }
        }

        // TÌM KIẾM
        // GET api/products/search?keyword=...
        [HttpGet("search")]
        public async Task<ActionResult<IEnumerable<ProductDTO>>> SearchProducts([FromQuery] string keyword, [FromQuery] int maxResults = 50)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(keyword))
                    return BadRequest("Search keyword is required");

                var products = await _productService.SearchProductsAsync(keyword, maxResults);
                return Ok(products);
            }
            catch (Exception ex)
            {
                return this.ServerError(ex);
            }
        }


    }
}
