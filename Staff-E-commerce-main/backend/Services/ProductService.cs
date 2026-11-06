using System;
using System.Collections.Generic;
using System.Linq;
using System.Globalization;
using System.Text;
using System.Threading.Tasks;
using backend.Models;
using backend.Repository;
using backend.DTO;
using backend.Helpers;

namespace backend.Services
{
    public class ProductService
    {
        private readonly ProductRepository _productRepository;
        private readonly CategoryRepository _categoryRepository;
        private readonly SupplierRepository _supplierRepository;
        private readonly BusMemoryCache<ProductDTO> _cache;
        private readonly BusMemoryCache<SupplierDTO> _supplierCache;
        private static readonly TimeSpan SearchCacheTtl = TimeSpan.FromMinutes(12);
        private static readonly (string Region, string[] Locations)[] RegionLocations =
        [
            ("Bắc",
            [
                "ha noi", "hai phong", "quang ninh", "bac ninh", "bac giang", "lang son",
                "cao bang", "ha giang", "lao cai", "yen bai", "tuyen quang", "thai nguyen",
                "phu tho", "vinh phuc", "hoa binh", "son la", "dien bien", "lai chau",
                "ha nam", "nam dinh", "ninh binh", "thai binh", "hai duong", "hung yen"
            ]),
            ("Trung",
            [
                "thanh hoa", "nghe an", "ha tinh", "quang binh", "quang tri", "thua thien hue",
                "hue", "da nang", "quang nam", "quang ngai", "binh dinh", "phu yen",
                "khanh hoa", "ninh thuan", "binh thuan", "kon tum", "gia lai", "dak lak",
                "dak nong", "lam dong"
            ]),
            ("Nam",
            [
                "ho chi minh", "tp hcm", "tphcm", "sai gon", "binh duong", "dong nai",
                "ba ria vung tau", "tay ninh", "binh phuoc", "long an", "tien giang",
                "ben tre", "tra vinh", "vinh long", "dong thap", "an giang", "kien giang",
                "hau giang", "soc trang", "bac lieu", "ca mau", "can tho"
            ])
        ];

        public ProductService(
            ProductRepository productRepository,
            CategoryRepository categoryRepository,
            SupplierRepository supplierRepository,
            BusMemoryCache<ProductDTO> cache,
            BusMemoryCache<SupplierDTO> supplierCache)
        {
            _productRepository = productRepository;
            _categoryRepository = categoryRepository;
            _supplierRepository = supplierRepository;
            _cache = cache;
            _supplierCache = supplierCache;
        }

        private async Task<IReadOnlyList<ProductDTO>> GetLiveProductsAsync()
        {
            // Inventory can change from mobile orders, POS, and purchase receipts.
            // Read the current SQL values so all product endpoints show the same stock.
            var products = (await _productRepository.GetAllForCacheAsync()).Select(MapToProductDto).ToList();
            await AddDiscountPricesAsync(products);
            return products;
        }

        public async Task<IReadOnlyList<ProductDTO>> GetSearchProductsAsync()
        {
            var (products, _) = await _cache.GetOrCreateAsync(
                async () => (await GetLiveProductsAsync()).ToList(),
                SearchCacheTtl);
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
            var products = (await (string.IsNullOrWhiteSpace(search)
                ? GetLiveProductsAsync()
                : GetSearchProductsAsync())).AsEnumerable();
            if (supplierId.HasValue) products = products.Where(product => product.SupplierId == supplierId.Value);
            if (categoryId.HasValue) products = products.Where(product => product.CategoryId == categoryId.Value);
            if (minPrice.HasValue) products = products.Where(product => product.Price >= minPrice.Value);
            if (maxPrice.HasValue) products = products.Where(product => product.Price <= maxPrice.Value);
            if (status.HasValue) products = products.Where(product => product.IsActive == (status.Value == 1));
            if (!string.IsNullOrWhiteSpace(stockStatus))
            {
                products = stockStatus.ToLowerInvariant() switch
                {
                    "available" => products.Where(product => product.StockQuantity > 0),
                    "out_of_stock" => products.Where(product => product.StockQuantity == 0),
                    "low_stock" => products.Where(product => product.StockQuantity > 0 && product.StockQuantity < 10),
                    "in_stock" => products.Where(product => product.StockQuantity >= 10),
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
                "quantity_asc" => products.OrderBy(product => product.StockQuantity),
                "quantity_desc" => products.OrderByDescending(product => product.StockQuantity),
                "updated_at_desc" => products.OrderByDescending(product => product.UpdatedAt),
                "updated_at_asc" => products.OrderBy(product => product.UpdatedAt),
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

        public async Task<ProductDTO> CreateProductAsync(Product product, IFormFile? imageFile = null, int? userId = null)
        {
            var validator = await ValidateProductAsync(product, imageFile, mode: "create");
            if (validator.HasErrors) throw validator;

            // set timestamps (repository may override)
            product.CreatedAt = DateTime.UtcNow;
            product.UpdatedAt = DateTime.UtcNow;

            var created = await _productRepository.CreateAsync(product, userId);
            var result = MapToProductDto(created);
            _cache.Clear();
            _supplierCache.Clear();
            return result;
        }

        /// <summary>
        /// Updates product information. Stock is never changed here: it moves only through sales, purchase orders
        /// and inventory adjustments, which keep a history. A stale edit form therefore cannot undo recent sales.
        /// </summary>
        public async Task<ProductDTO> UpdateProductAsync(Product product, IFormFile? imageFile = null)
        {
            var existing = await _productRepository.GetByIdForUpdateAsync(product.Id);
            if (existing == null)
                throw new ArgumentException("Product not found", nameof(product.Id));

            // keep createdAt from existing if not provided
            product.CreatedAt = existing.CreatedAt;
            product.StockQuantity = existing.StockQuantity;
            product.UpdatedAt = DateTime.UtcNow;

            var validator = await ValidateProductAsync(product, imageFile, mode: "edit");
            if (validator.HasErrors) throw validator;

            var previousImage = existing.ImageUrl;
            var updated = await _productRepository.UpdateAsync(product);
            // Remove the replaced upload only after the new URL is saved.
            if (!string.Equals(previousImage, updated.ImageUrl, StringComparison.OrdinalIgnoreCase))
                ProductImageStorage.DeleteIfUploaded(previousImage);
            var result = MapToProductDto(updated);
            _cache.Clear();
            _supplierCache.Clear();
            return result;
        }

        public async Task<bool> SetProductActiveAsync(int id, bool isActive)
        {
            if (id <= 0) throw new ArgumentException("Product ID must be greater than 0", nameof(id));
            var result = await _productRepository.SetActiveAsync(id, isActive);
            if (result)
            {
                _cache.Clear();
                _supplierCache.Clear();
            }
            return result;
        }

        public async Task<bool> DeleteProductAsync(int id)
        {
            if (id <= 0) throw new ArgumentException("Product ID must be greater than 0", nameof(id));
            var result = await _productRepository.DeleteAsync(id);
            if (result)
            {
                _cache.Clear();
                _supplierCache.Clear();
            }
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

            if (product.StockQuantity < 0)
                ve.AddError(nameof(product.StockQuantity), "Số lượng tồn phải >= 0.");

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
                Region = p.Supplier?.Region ?? GetSupplierRegion(p.Supplier?.Address),
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
                StockQuantity = p.StockQuantity,
                Inventory = new InventoryDTO
                {
                    Id = p.Id,
                    ProductId = p.Id,
                    Quantity = p.StockQuantity,
                    LastCheckedAt = null,
                    UpdatedAt = p.UpdatedAt
                },

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
                .Where(product => product.StockQuantity > 0)
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

        // Filter the cached product snapshot in BUS; only cache misses read the database.
        public async Task<List<ProductDTO>> SearchProductsAsync(string keyword, int maxResults = 50)
        {
            if (string.IsNullOrWhiteSpace(keyword)) return new List<ProductDTO>();
            var value = keyword.Trim();
            return (await GetSearchProductsAsync())
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

        public async Task<PaginationResult<ProductDTO>> AdvancedSearchProductsAsync(ProductAdvancedSearchRequestDTO request)
        {
            ArgumentNullException.ThrowIfNull(request);
            ValidateAdvancedRequest(request);
            var predicates = CompileAdvancedConditions(request.Conditions);
            IEnumerable<ProductDTO> products = await GetSearchProductsAsync();

            if (request.SupplierId.HasValue) products = products.Where(product => product.SupplierId == request.SupplierId.Value);
            if (request.CategoryId.HasValue) products = products.Where(product => product.CategoryId == request.CategoryId.Value);
            if (request.MinPrice.HasValue) products = products.Where(product => product.Price >= request.MinPrice.Value);
            if (request.MaxPrice.HasValue) products = products.Where(product => product.Price <= request.MaxPrice.Value);
            if (request.Status.HasValue) products = products.Where(product => product.IsActive == (request.Status.Value == 1));
            if (!string.IsNullOrWhiteSpace(request.StockStatus))
            {
                products = request.StockStatus.ToLowerInvariant() switch
                {
                    "available" => products.Where(product => product.StockQuantity > 0),
                    "out_of_stock" => products.Where(product => product.StockQuantity == 0),
                    "low_stock" => products.Where(product => product.StockQuantity > 0 && product.StockQuantity < 10),
                    "in_stock" => products.Where(product => product.StockQuantity >= 10),
                    _ => products
                };
            }
            if (!string.IsNullOrWhiteSpace(request.Search))
            {
                var keyword = request.Search.Trim();
                products = products.Where(product =>
                    product.ProductName.Contains(keyword, StringComparison.OrdinalIgnoreCase) ||
                    (product.Sku?.Contains(keyword, StringComparison.OrdinalIgnoreCase) ?? false) ||
                    (product.Barcode?.Contains(keyword, StringComparison.OrdinalIgnoreCase) ?? false) ||
                    (product.Supplier?.Name?.Contains(keyword, StringComparison.OrdinalIgnoreCase) ?? false));
            }

            products = products.Where(product => EvaluateExpression(product, predicates));
            products = ApplyProductSort(products, request.SortBy);

            var pageSize = Math.Clamp(request.PageSize, 1, 100);
            var filtered = products.ToList();
            var totalItems = filtered.Count;
            var totalPages = (int)Math.Ceiling(totalItems / (double)pageSize);
            var page = Math.Min(Math.Max(request.Page, 1), Math.Max(totalPages, 1));

            return new PaginationResult<ProductDTO>
            {
                Items = filtered.Skip((page - 1) * pageSize).Take(pageSize).ToList(),
                TotalItems = totalItems,
                CurrentPage = page,
                PageSize = pageSize,
                TotalPages = totalPages,
                HasPrevious = page > 1,
                HasNext = page < totalPages
            };
        }

        private static void ValidateAdvancedRequest(ProductAdvancedSearchRequestDTO request)
        {
            var validation = new ValidationException();
            if (request.Search?.Length > 200)
                validation.AddError("search", "Từ khóa không được vượt quá 200 ký tự.");
            if (request.MinPrice < 0 || request.MaxPrice < 0)
                validation.AddError("price", "Khoảng giá không được là số âm.");
            if (request.MinPrice.HasValue && request.MaxPrice.HasValue && request.MinPrice > request.MaxPrice)
                validation.AddError("price", "Giá từ không được lớn hơn giá đến.");
            if (request.Status.HasValue && request.Status is not (0 or 1))
                validation.AddError("status", "Trạng thái chỉ chấp nhận 0 hoặc 1.");
            if (!string.IsNullOrWhiteSpace(request.StockStatus) &&
                request.StockStatus.ToLowerInvariant() is not ("available" or "out_of_stock" or "low_stock" or "in_stock"))
                validation.AddError("stockStatus", "Trạng thái tồn kho không hợp lệ.");
            if (validation.HasErrors) throw validation;
        }

        private sealed record CompiledCondition(string Logic, Func<ProductDTO, bool> Predicate);

        private static List<CompiledCondition> CompileAdvancedConditions(IReadOnlyList<ProductSearchConditionDTO>? conditions)
        {
            var validation = new ValidationException();
            if (conditions is null || conditions.Count == 0)
            {
                validation.AddError("conditions", "Phải có ít nhất một điều kiện tìm kiếm nâng cao.");
                throw validation;
            }
            if (conditions.Count > 10)
            {
                validation.AddError("conditions", "Chỉ được sử dụng tối đa 10 điều kiện.");
                throw validation;
            }

            var compiled = new List<CompiledCondition>(conditions.Count);
            for (var index = 0; index < conditions.Count; index++)
            {
                var condition = conditions[index];
                var key = $"conditions[{index}]";
                var field = condition.Field?.Trim().ToLowerInvariant() ?? string.Empty;
                var comparison = condition.Operator?.Trim() == "<>" ? "!=" : condition.Operator?.Trim();
                var logic = index == 0 ? "AND" : condition.Logic?.Trim().ToUpperInvariant();
                var value = condition.Value?.Trim() ?? string.Empty;

                if (logic is not ("AND" or "OR"))
                {
                    validation.AddError(key, "Toán tử logic chỉ chấp nhận AND hoặc OR.");
                    continue;
                }
                if (comparison is not (">" or "<" or ">=" or "<=" or "==" or "!="))
                {
                    validation.AddError(key, "Toán tử so sánh không hợp lệ.");
                    continue;
                }
                if (string.IsNullOrWhiteSpace(value) || value.Length > 200)
                {
                    validation.AddError(key, "Giá trị không được trống và không vượt quá 200 ký tự.");
                    continue;
                }

                Func<ProductDTO, bool>? predicate = field switch
                {
                    "id" => CompileNumber(product => product.Id, comparison!, value, key, validation),
                    "price" => CompileNumber(product => product.Price, comparison!, value, key, validation),
                    "cost" => CompileNullableNumber(product => product.Cost, comparison!, value, key, validation),
                    "stockquantity" => CompileNumber(product => product.StockQuantity, comparison!, value, key, validation),
                    "categoryid" => CompileNullableNumber(product => product.CategoryId, comparison!, value, key, validation),
                    "supplierid" => CompileNullableNumber(product => product.SupplierId, comparison!, value, key, validation),
                    "unitid" => CompileNullableNumber(product => product.UnitId, comparison!, value, key, validation),
                    "createdat" => CompileDate(product => product.CreatedAt, comparison!, value, key, validation),
                    "updatedat" => CompileDate(product => product.UpdatedAt, comparison!, value, key, validation),
                    "isactive" => CompileBoolean(product => product.IsActive, comparison!, value, key, validation),
                    "productname" => CompileString(product => product.ProductName, comparison!, value),
                    "sku" => CompileString(product => product.Sku, comparison!, value),
                    "barcode" => CompileString(product => product.Barcode, comparison!, value),
                    "description" => CompileString(product => product.Description, comparison!, value),
                    "categoryname" => CompileString(product => product.Category?.Name, comparison!, value),
                    "suppliername" => CompileString(product => product.Supplier?.Name, comparison!, value),
                    "region" => CompileRegion(product => product.Region, comparison!, value, key, validation),
                    "unitname" => CompileString(product => product.UnitName, comparison!, value),
                    _ => null
                };

                if (predicate is null && !validation.Errors.ContainsKey(key))
                {
                    validation.AddError(key, "Trường tìm kiếm không được hỗ trợ.");
                    continue;
                }
                if (predicate is null) continue;
                if (condition.Negate)
                {
                    var inner = predicate;
                    predicate = product => !inner(product);
                }
                compiled.Add(new CompiledCondition(logic!, predicate));
            }

            if (validation.HasErrors) throw validation;
            return compiled;
        }

        private static bool EvaluateExpression(ProductDTO product, IReadOnlyList<CompiledCondition> conditions)
        {
            var result = false;
            var andGroup = conditions[0].Predicate(product);
            for (var index = 1; index < conditions.Count; index++)
            {
                if (conditions[index].Logic == "OR")
                {
                    result = result || andGroup;
                    andGroup = conditions[index].Predicate(product);
                }
                else
                {
                    andGroup = andGroup && conditions[index].Predicate(product);
                }
            }
            return result || andGroup;
        }

        private static Func<ProductDTO, bool>? CompileNumber(
            Func<ProductDTO, decimal> selector, string comparison, string value,
            string key, ValidationException validation)
        {
            if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var expected))
            {
                validation.AddError(key, "Giá trị phải là số hợp lệ.");
                return null;
            }
            return product => Compare(selector(product), expected, comparison);
        }

        private static Func<ProductDTO, bool>? CompileNullableNumber<T>(
            Func<ProductDTO, T?> selector, string comparison, string value,
            string key, ValidationException validation) where T : struct, IConvertible
        {
            if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var expected))
            {
                validation.AddError(key, "Giá trị phải là số hợp lệ.");
                return null;
            }
            return product => selector(product) is T actual
                ? Compare(Convert.ToDecimal(actual, CultureInfo.InvariantCulture), expected, comparison)
                : comparison == "!=";
        }

        private static Func<ProductDTO, bool>? CompileDate(
            Func<ProductDTO, DateTime?> selector, string comparison, string value,
            string key, ValidationException validation)
        {
            if (!DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var expected))
            {
                validation.AddError(key, "Ngày phải có định dạng hợp lệ, ví dụ 2026-10-31.");
                return null;
            }
            expected = expected.Date;
            return product => selector(product) is DateTime actual
                ? Compare(actual.Date, expected, comparison)
                : comparison == "!=";
        }

        private static Func<ProductDTO, bool>? CompileBoolean(
            Func<ProductDTO, bool> selector, string comparison, string value,
            string key, ValidationException validation)
        {
            if (comparison is not ("==" or "!="))
            {
                validation.AddError(key, "Trường trạng thái chỉ hỗ trợ == và !=.");
                return null;
            }
            var normalized = value.ToLowerInvariant();
            bool expected;
            if (normalized is "true" or "1" or "active") expected = true;
            else if (normalized is "false" or "0" or "inactive") expected = false;
            else
            {
                validation.AddError(key, "Trạng thái chỉ chấp nhận true/false hoặc 1/0.");
                return null;
            }
            return product => comparison == "==" ? selector(product) == expected : selector(product) != expected;
        }

        private static Func<ProductDTO, bool> CompileString(
            Func<ProductDTO, string?> selector, string comparison, string expected)
        {
            return product => Compare(selector(product) ?? string.Empty, expected, comparison);
        }

        private static Func<ProductDTO, bool>? CompileRegion(
            Func<ProductDTO, string?> selector, string comparison, string value,
            string key, ValidationException validation)
        {
            if (comparison is not ("==" or "!="))
            {
                validation.AddError(key, "Trường miền chỉ hỗ trợ ==, != hoặc <>.");
                return null;
            }

            var expected = NormalizeRegionValue(value);
            if (expected is null)
            {
                validation.AddError(key, "Miền chỉ chấp nhận Bắc, Trung hoặc Nam.");
                return null;
            }

            return product => comparison == "=="
                ? string.Equals(selector(product), expected, StringComparison.Ordinal)
                : !string.Equals(selector(product), expected, StringComparison.Ordinal);
        }

        internal static string? GetSupplierRegion(string? address)
        {
            if (string.IsNullOrWhiteSpace(address)) return null;

            var normalizedAddress = $" {NormalizeLocation(address)} ";
            foreach (var (region, locations) in RegionLocations)
            {
                if (locations.Any(location => normalizedAddress.Contains($" {location} ", StringComparison.Ordinal)))
                    return region;
            }
            return null;
        }

        private static string? NormalizeRegionValue(string value)
        {
            return NormalizeLocation(value) switch
            {
                "bac" or "mien bac" or "north" => "Bắc",
                "trung" or "mien trung" or "central" => "Trung",
                "nam" or "mien nam" or "south" => "Nam",
                _ => null
            };
        }

        private static string NormalizeLocation(string value)
        {
            var decomposed = value.Trim().ToLowerInvariant().Replace('đ', 'd').Normalize(NormalizationForm.FormD);
            var builder = new StringBuilder(decomposed.Length);
            var previousWasSpace = true;
            foreach (var character in decomposed)
            {
                if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark) continue;

                if (char.IsLetterOrDigit(character))
                {
                    builder.Append(character);
                    previousWasSpace = false;
                }
                else if (!previousWasSpace)
                {
                    builder.Append(' ');
                    previousWasSpace = true;
                }
            }
            return builder.ToString().Trim();
        }

        private static bool Compare(decimal actual, decimal expected, string comparison) => comparison switch
        {
            ">" => actual > expected,
            "<" => actual < expected,
            ">=" => actual >= expected,
            "<=" => actual <= expected,
            "==" => actual == expected,
            "!=" => actual != expected,
            _ => false
        };

        private static bool Compare(DateTime actual, DateTime expected, string comparison) => comparison switch
        {
            ">" => actual > expected,
            "<" => actual < expected,
            ">=" => actual >= expected,
            "<=" => actual <= expected,
            "==" => actual == expected,
            "!=" => actual != expected,
            _ => false
        };

        private static bool Compare(string actual, string expected, string comparison)
        {
            var order = string.Compare(actual.Trim(), expected.Trim(), StringComparison.OrdinalIgnoreCase);
            return comparison switch
            {
                ">" => order > 0,
                "<" => order < 0,
                ">=" => order >= 0,
                "<=" => order <= 0,
                "==" => order == 0,
                "!=" => order != 0,
                _ => false
            };
        }

        private static IEnumerable<ProductDTO> ApplyProductSort(IEnumerable<ProductDTO> products, string? sortBy)
        {
            return (sortBy ?? "id").ToLowerInvariant() switch
            {
                "price_asc" or "budget" => products.OrderBy(product => product.Price),
                "price_desc" => products.OrderByDescending(product => product.Price),
                "name_asc" => products.OrderBy(product => product.ProductName),
                "name_desc" => products.OrderByDescending(product => product.ProductName),
                "featured" or "bestsellers" => products.OrderByDescending(product => product.SalesCount),
                "newest" => products.OrderByDescending(product => product.CreatedAt),
                "oldest" => products.OrderBy(product => product.CreatedAt),
                "quantity_asc" => products.OrderBy(product => product.StockQuantity),
                "quantity_desc" => products.OrderByDescending(product => product.StockQuantity),
                "updated_at_desc" => products.OrderByDescending(product => product.UpdatedAt),
                "updated_at_asc" => products.OrderBy(product => product.UpdatedAt),
                "id_desc" => products.OrderByDescending(product => product.Id),
                _ => products.OrderBy(product => product.Id)
            };
        }
    }
}
