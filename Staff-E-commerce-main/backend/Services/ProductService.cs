using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using backend.Models;
using backend.Repository;
using backend.DTO;

namespace backend.Services
{
    public class ProductService
    {
        private readonly ProductRepository _productRepository;
        private readonly CategoryRepository _categoryRepository;
        private readonly SupplierRepository _supplierRepository;
        private readonly BusMemoryCache<ProductDTO> _cache;

        public ProductService(
            ProductRepository productRepository,
            CategoryRepository categoryRepository,
            SupplierRepository supplierRepository,
            BusMemoryCache<ProductDTO> cache)
        {
            _productRepository = productRepository;
            _categoryRepository = categoryRepository;
            _supplierRepository = supplierRepository;
            _cache = cache;
        }

        private async Task<IReadOnlyList<ProductDTO>> GetLiveProductsAsync()
        {
            // Inventory can change from mobile orders, POS, and purchase receipts.
            // Read the current SQL values so all product endpoints show the same stock.
            var products = (await _productRepository.GetAllForCacheAsync()).Select(MapToProductDto).ToList();
            await AddDiscountPricesAsync(products);
            return products;
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
                   int? status = null,
                   string? stockStatus = null)
        {
            var products = (await GetLiveProductsAsync()).AsEnumerable();
            if (supplierId.HasValue) products = products.Where(product => product.SupplierId == supplierId.Value);
            if (categoryId.HasValue) products = products.Where(product => product.CategoryId == categoryId.Value);
            if (minPrice.HasValue) products = products.Where(product => product.Price >= minPrice.Value);
            if (maxPrice.HasValue) products = products.Where(product => product.Price <= maxPrice.Value);
            if (status.HasValue) products = products.Where(product => product.IsActive == (status.Value == 1));
            if (!string.IsNullOrWhiteSpace(stockStatus))
            {
                products = stockStatus.ToLowerInvariant() switch
                {
                    "available" => products.Where(product => product.Inventory != null && product.Inventory.Quantity > 0),
                    "out_of_stock" => products.Where(product => product.Inventory == null || product.Inventory.Quantity == 0),
                    "low_stock" => products.Where(product => product.Inventory != null && product.Inventory.Quantity > 0 && product.Inventory.Quantity < 10),
                    "in_stock" => products.Where(product => product.Inventory != null && product.Inventory.Quantity >= 10),
                    _ => products
                };
            }
            if (!string.IsNullOrWhiteSpace(search))
            {
                var value = search.Trim();
                products = products.Where(product => product.ProductName.Contains(value, StringComparison.OrdinalIgnoreCase) ||
                    (product.Sku?.Contains(value, StringComparison.OrdinalIgnoreCase) ?? false) ||
                    (product.Supplier?.Name?.Contains(value, StringComparison.OrdinalIgnoreCase) ?? false));
            }
            products = (sortBy ?? "id").ToLowerInvariant() switch
            {
                "price_asc" or "budget" => products.OrderBy(product => product.Price),
                "price_desc" => products.OrderByDescending(product => product.Price),
                "name_asc" => products.OrderBy(product => product.ProductName),
                "name_desc" => products.OrderByDescending(product => product.ProductName),
                "featured" or "bestsellers" => products.OrderByDescending(product => product.SalesCount),
                "newest" => products.OrderByDescending(product => product.CreatedAt),
                "oldest" => products.OrderBy(product => product.CreatedAt),
                "quantity_asc" => products.OrderBy(product => product.Inventory?.Quantity ?? 0),
                "quantity_desc" => products.OrderByDescending(product => product.Inventory?.Quantity ?? 0),
                "updated_at_desc" => products.OrderByDescending(product => product.Inventory?.UpdatedAt ?? product.UpdatedAt),
                "updated_at_asc" => products.OrderBy(product => product.Inventory?.UpdatedAt ?? product.UpdatedAt),
                "id_desc" => products.OrderByDescending(product => product.Id),
                _ => products.OrderBy(product => product.Id)
            };
            var filtered = products.ToList();
            var totalItems = filtered.Count;
            var totalPages = (int)Math.Ceiling(totalItems / (double)pageSize);
            page = Math.Min(Math.Max(page, 1), Math.Max(totalPages, 1));
            var items = filtered.Skip((page - 1) * pageSize).Take(pageSize).ToList();

            return new PaginationResult<ProductDTO>
            {
                Items = items,
                TotalItems = totalItems,
                CurrentPage = page,
                PageSize = pageSize,
                TotalPages = totalPages,
                HasPrevious = page > 1,
                HasNext = page < totalPages
            };
        }

        public async Task<ProductDTO?> GetProductByIdAsync(int id)
        {
            if (id <= 0)
                throw new ArgumentException("Product ID must be greater than 0", nameof(id));

            var product = await _productRepository.GetByIdAsync(id);
            if (product == null) return null;

            var dto = MapToProductDto(product);
            await AddDiscountPricesAsync(new List<ProductDTO> { dto });
            return dto;
        }

        public async Task<ProductDTO> CreateProductAsync(Product product, IFormFile? imageFile = null)
        {
            var validator = await ValidateProductAsync(product, imageFile, mode: "create");
            if (validator.HasErrors) throw validator;

            // set timestamps (repository may override)
            product.CreatedAt = DateTime.UtcNow;
            product.UpdatedAt = DateTime.UtcNow;

            var created = await _productRepository.CreateAsync(product);
            var result = MapToProductDto(created);
            _cache.AddOrUpdate(result, item => item.Id);
            return result;
        }

        public async Task<ProductDTO> UpdateProductAsync(Product product, IFormFile? imageFile = null)
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
            var result = MapToProductDto(updated);
            _cache.AddOrUpdate(result, item => item.Id);
            return result;
        }

        public async Task<bool> DeleteProductAsync(int id)
        {
            if (id <= 0) throw new ArgumentException("Product ID must be greater than 0", nameof(id));
            var result = await _productRepository.DeleteAsync(id);
            if (result) _cache.RemoveWhere(item => item.Id == id);
            return result;
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
                Barcode = p.Barcode,
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
                    Id = p.Inventory.Id,
                    ProductId = p.Inventory.ProductId,
                    Quantity = p.Inventory.Quantity,
                    LastCheckedAt = p.Inventory.LastCheckedAt,
                    UpdatedAt = p.Inventory.UpdatedAt
                } : null,

                // If you have rating/review tables, compute them here. For now default to 0.
                AverageRating = 0.0,
                ReviewCount = 0,
                SalesCount = p.OrderItems?.Sum(item => item.Quantity) ?? 0
            };


            return dto;
        }

        private async Task AddDiscountPricesAsync(List<ProductDTO> products)
        {
            var discounts = await _productRepository.GetActiveProductDiscountsAsync(products);
            foreach (var product in products)
            {
                if (!discounts.TryGetValue(product.Id, out var discount)) continue;

                product.DiscountAmount = discount.Amount;
                product.DiscountPrice = Math.Max(0, product.Price - discount.Amount);
                product.PromotionName = discount.Name;
            }
        }


        public async Task<PaginationResult<ProductDTO>> GetAvailableProductsAsync(int page, int pageSize)
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 20;

            var available = (await GetLiveProductsAsync())
                .Where(product => product.Inventory?.Quantity > 0)
                .OrderByDescending(product => product.CreatedAt)
                .ToList();
            var totalItems = available.Count;
            var totalPages = (int)Math.Ceiling(totalItems / (double)pageSize);

            return new PaginationResult<ProductDTO>
            {
                Items = available.Skip((page - 1) * pageSize).Take(pageSize).ToList(),
                TotalItems = totalItems,
                CurrentPage = page,
                PageSize = pageSize,
                TotalPages = totalPages,
                HasPrevious = page > 1,
                HasNext = page < totalPages
            };
        }

        // Search directly against the BUS cache; this path never issues a SELECT LIKE query.
        public async Task<List<ProductDTO>> SearchProductsAsync(string keyword, int maxResults = 50)
        {
            if (string.IsNullOrWhiteSpace(keyword)) return new List<ProductDTO>();
            var value = keyword.Trim();
            return (await GetLiveProductsAsync())
                .Where(p => p.ProductName.Contains(value, StringComparison.OrdinalIgnoreCase)
                    || (p.Sku?.Contains(value, StringComparison.OrdinalIgnoreCase) ?? false)
                    || (p.Barcode?.Contains(value, StringComparison.OrdinalIgnoreCase) ?? false)
                    || (p.Supplier?.Name?.Contains(value, StringComparison.OrdinalIgnoreCase) ?? false))
                .Take(Math.Clamp(maxResults, 1, 200))
                .ToList();
        }

        public async Task<ProductDTO?> GetProductByBarcodeAsync(string barcode)
        {
            return (await GetLiveProductsAsync()).FirstOrDefault(p =>
                string.Equals(p.Barcode, barcode, StringComparison.OrdinalIgnoreCase));
        }
    }
}
