using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using backend.Models;
using backend.Repository;
using backend.DTO;
using backend.Services.AI.SemanticSearch;

namespace backend.Services
{
    public class ProductService
    {
        private readonly ProductRepository _productRepository;
        private readonly CategoryRepository _categoryRepository;
        private readonly SupplierRepository _supplierRepository;
        private readonly IProductIndexingService? _indexingService;
        private readonly ILogger<ProductService>? _logger;

        public ProductService(
            ProductRepository productRepository,
            CategoryRepository categoryRepository,
            SupplierRepository supplierRepository,
            IProductIndexingService? indexingService = null,
            ILogger<ProductService>? logger = null)
        {
            _productRepository = productRepository;
            _categoryRepository = categoryRepository;
            _supplierRepository = supplierRepository;
            _indexingService = indexingService;
            _logger = logger;
        }



        public async Task<PaginationResult<ProductDTO>> GetPaginatedProductsAsync(
                   int page = 1,
                   int pageSize = 12,
                   string? search = null,
                   int? categoryId = null,
                   int? supplierId = null,
                   decimal? minPrice = null,
                   decimal? maxPrice = null,
                   string? sortBy = "",
                   int? status = null)
        {
            var result = await _productRepository.GetFilteredAsync(page, pageSize, supplierId, categoryId, minPrice, maxPrice, sortBy, search, status);

            return new PaginationResult<ProductDTO>
            {
                Items = result.Items.Select(MapToProductDto).ToList(),
                TotalItems = result.TotalItems,
                CurrentPage = result.CurrentPage,
                PageSize = result.PageSize,
                TotalPages = result.TotalPages,
                HasPrevious = result.HasPrevious,
                HasNext = result.HasNext
            };
        }

        public async Task<ProductDTO?> GetProductByIdAsync(int id)
        {
            if (id <= 0)
                throw new ArgumentException("Product ID must be greater than 0", nameof(id));

            var product = await _productRepository.GetByIdAsync(id);
            return product != null ? MapToProductDto(product) : null;
        }

        public async Task<ProductDTO> CreateProductAsync(Product product, IFormFile imageFile = null)
        {
            var validator = await ValidateProductAsync(product, imageFile, mode: "create");
            if (validator.HasErrors) throw validator;

            // set timestamps (repository may override)
            product.CreatedAt = DateTime.UtcNow;
            product.UpdatedAt = DateTime.UtcNow;

            var created = await _productRepository.CreateAsync(product);

            // Index to Qdrant for semantic search (fire-and-forget)
            _ = IndexProductToQdrantAsync(created);

            return MapToProductDto(created);
        }

        public async Task<ProductDTO> UpdateProductAsync(Product product, IFormFile imageFile = null)
        {
            var existing = await _productRepository.GetByIdForUpdateAsync(product.Id);
            if (existing == null)
                throw new ArgumentException("Product not found", nameof(product.Id));

            // keep createdAt from existing if not provided
            product.CreatedAt = existing.CreatedAt;
            product.UpdatedAt = DateTime.UtcNow;

            var validator = await ValidateProductAsync(product, imageFile, mode: "edit");
            if (validator.HasErrors) throw validator;

            var updated = await _productRepository.UpdateAsync(product);

            // Re-index to Qdrant for semantic search (fire-and-forget)
            _ = IndexProductToQdrantAsync(updated);

            return MapToProductDto(updated);
        }

        public async Task<bool> DeleteProductAsync(int id)
        {
            if (id <= 0) throw new ArgumentException("Product ID must be greater than 0", nameof(id));
            var result = await _productRepository.DeleteAsync(id);

            // Update Qdrant index (product deactivated, re-index with is_active=false)
            if (result)
            {
                var product = await _productRepository.GetByIdAsync(id);
                if (product != null)
                    _ = IndexProductToQdrantAsync(product);
            }

            return result;
        }

        private async Task IndexProductToQdrantAsync(Product product)
        {
            if (_indexingService == null) return;

            try
            {
                await _indexingService.IndexProductAsync(product);
            }
            catch (Exception ex)
            {
                _logger?.LogWarning(ex, "Failed to index product {ProductId} to Qdrant", product.Id);
            }
        }


        /// <summary>
        /// Validate product, return ValidationException containing errors (if any).
        /// Mode: "create" or "edit"
        /// </summary>
        private async Task<ValidationException> ValidateProductAsync(Product product, IFormFile? imageFile, string mode)
        {
            var ve = new ValidationException();

            // productName
            if (string.IsNullOrWhiteSpace(product.ProductName))
                ve.AddError(nameof(product.ProductName), "Tên sản phẩm không được để trống.");

            // Price
            if (product.Price <= 0)
                ve.AddError(nameof(product.Price), "Giá phải là số lớn hơn 0.");

            // SKU: optional but if provided must be alphanumeric and unique
            if (!string.IsNullOrWhiteSpace(product.Sku))
            {
                if (!System.Text.RegularExpressions.Regex.IsMatch(product.Sku, @"^[a-zA-Z0-9_-]+$"))
                    ve.AddError(nameof(product.Sku), "SKU chỉ chứa chữ, số, gạch ngang hoặc gạch dưới.");

                // check uniqueness
                var existsSku = await _productRepository.ExistsBySkuAsync(product.Sku, excludeId: mode == "edit" ? (int?)product.Id : null);
                if (existsSku)
                    ve.AddError(nameof(product.Sku), "SKU đã tồn tại trong hệ thống.");
            }

            // Unit
            if (!product.UnitId.HasValue || product.UnitId.Value <= 0)
            {
                ve.AddError(nameof(product.UnitId), "Đơn vị không được để trống.");
            }

            // Inventory checks
            if (product.Inventory != null)
            {
                if (product.Inventory.Quantity < 0)
                    ve.AddError("Inventory.Quantity", "Số lượng tồn phải >= 0.");
            }

            // Category existence (if provided)
            if (product.CategoryId.HasValue)
            {
                // if CategoryRepository available
                if (_categoryRepository != null)
                {
                    var existsCat = await _categoryRepository.GetByIdAsync(product.CategoryId.Value);
                    if (existsCat == null)
                        ve.AddError(nameof(product.CategoryId), "Danh mục không tồn tại.");
                }
                // otherwise, you could skip or add repository method in ProductRepository to check
            }

            // Supplier existence (if provided)
            if (product.SupplierId.HasValue)
            {
                if (_supplierRepository != null)
                {
                    var existsSup = await _supplierRepository.GetByIdAsync(product.SupplierId.Value);
                    if (existsSup == null)
                        ve.AddError(nameof(product.SupplierId), "Nhà cung cấp không tồn tại.");
                }
            }

            // Image validation (optional)
            if (imageFile != null)
            {
                // allowed types
                var allowed = new[] { "image/jpeg", "image/png", "image/webp" };
                if (!allowed.Contains(imageFile.ContentType))
                    ve.AddError("imageFile", "Chỉ chấp nhận ảnh JPG/PNG/WEBP.");

                // size limit 5MB
                const long maxBytes = 5 * 1024 * 1024;
                if (imageFile.Length > maxBytes)
                    ve.AddError("imageFile", "Kích thước ảnh phải <= 5MB.");
            }

            return ve;
        }

        // Mapping: Product -> ProductDTO
        private ProductDTO MapToProductDto(Product p)
        {
            if (p == null) throw new ArgumentNullException(nameof(p));

            var dto = new ProductDTO
            {
                Id = p.Id,
                Sku = p.Sku,
                ProductName = p.ProductName,
                // Barcode = p.Barcode,
                CategoryId = p.CategoryId,
                SupplierId = p.SupplierId,
                Price = p.Price,
                Cost = p.Cost,
                UnitId = p.UnitId,
                UnitName = p.Unit?.Name,
                UnitCode = p.Unit?.Code,
                Description = p.Description,
                ImageUrl = p.ImageUrl,
                IsActive = p.IsActive,
                CreatedAt = p.CreatedAt,
                UpdatedAt = p.UpdatedAt,
                Category = p.Category != null ? new CategoryDTO
                {
                    Id = p.Category.Id,
                    Name = p.Category.Name,
                    Slug = p.Category.Slug,
                    Description = p.Category.Description,
                    IsActive = p.Category.IsActive
                } : null,
                Supplier = p.Supplier != null ? new SupplierDTO
                {
                    Id = p.Supplier.Id,
                    Name = p.Supplier.Name,
                    ContactName = p.Supplier.ContactName,
                    Phone = p.Supplier.Phone,
                    Email = p.Supplier.Email,
                    Address = p.Supplier.Address,
                    IsActive = p.Supplier.IsActive
                } : null,
                Inventory = p.Inventory != null ? new InventoryDTO
                {
                    ProductId = p.Inventory.ProductId,
                    Quantity = p.Inventory.Quantity,
                    LastCheckedAt = p.Inventory.LastCheckedAt,
                    UpdatedAt = p.Inventory.UpdatedAt
                } : null,

                // If you have rating/review tables, compute them here. For now default to 0.
                AverageRating = 0.0,
                ReviewCount = 0
            };


            return dto;
        }


        // lÀM ƠN ĐỪUNG XÓA CỦA => LẤY DANH SÁCH SẢN PHẨM CÒN HÀNG TRONG CỬA HÀNG
        public async Task<PaginationResult<Product>> GetAvailableProductsAsync(int page, int pageSize)
        {
            return await _productRepository.GetAvailableProductsPaginatedAsync(page, pageSize);
        }

        // Search using repository filtered query for efficiency
        public async Task<List<ProductDTO>> SearchProductsAsync(string keyword, int maxResults = 50)
        {
            if (string.IsNullOrWhiteSpace(keyword)) return new List<ProductDTO>();

            /*
       

            string? search = null,
            int? status = null)
            */
            var filtered = await _productRepository.GetFilteredAsync(1, maxResults, null, null, null, null, null, keyword,null);
            return filtered.Items.Select(MapToProductDto).ToList();
        }

    }
}
