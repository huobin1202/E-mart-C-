using System.Globalization;
using System.Text;
using backend.DTO;
using backend.Models;
using backend.Repository;
using CsvHelper;
using CsvHelper.Configuration;
using OfficeOpenXml;
using Microsoft.AspNetCore.Http;

namespace backend.Services
{
    public class ImportService
    {
        private readonly ProductRepository _productRepo;
        private readonly CustomerRepository _customerRepo;
        private readonly InventoryRepository _inventoryRepo;
        private readonly ImportRepository _importRepository;

        public ImportService(
            ProductRepository productRepo,
            CustomerRepository customerRepo,
            InventoryRepository inventoryRepo,
            ImportRepository importRepository)
        {
            _productRepo = productRepo;
            _customerRepo = customerRepo;
            _inventoryRepo = inventoryRepo;
            _importRepository = importRepository;

            // EPPlus license context (non-commercial use)
            ExcelPackage.LicenseContext = LicenseContext.NonCommercial;
        }

        // ========== PRODUCT IMPORT ==========

        public async Task<ImportResultDTO> ImportProductsAsync(IFormFile file)
        {
            var result = new ImportResultDTO();

            // Validate file
            ValidateFile(file, new[] { ".csv", ".xlsx", ".xls" }, 10 * 1024 * 1024); // 10MB max

            // Parse file
            List<ProductImportDTO> rows;
            try
            {
                var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (extension == ".csv")
                {
                    rows = ParseCsvFile<ProductImportDTO>(file.OpenReadStream());
                }
                else
                {
                    rows = ParseExcelFile<ProductImportDTO>(file.OpenReadStream());
                }
            }
            catch (Exception ex)
            {
                result.Errors.Add(new ImportErrorDTO
                {
                    RowNumber = 0,
                    Field = "File",
                    Message = $"Lỗi đọc file: {ex.Message}"
                });
                return result;
            }

            result.TotalRows = rows.Count;

            if (rows.Count == 0)
            {
                result.Errors.Add(new ImportErrorDTO
                {
                    RowNumber = 0,
                    Field = "File",
                    Message = "File không chứa dữ liệu"
                });
                return result;
            }

            // Process rows in transaction
            await using var transaction = await _importRepository.BeginTransactionAsync();
            try
            {
                for (int i = 0; i < rows.Count; i++)
                {
                    var row = rows[i];
                    var rowNumber = i + 2; // +2 vì có header và index bắt đầu từ 0

                    // Validate row
                    var validationErrors = ValidateProductRow(row, rowNumber);
                    if (validationErrors.Any())
                    {
                        result.Errors.AddRange(validationErrors);
                        result.Skipped++;
                        continue;
                    }

                    // Upsert
                    Product? existing = null;
                    if (!string.IsNullOrWhiteSpace(row.Sku))
                    {
                        existing = await _productRepo.GetBySkuAsync(row.Sku);
                    }

                    if (existing != null)
                    {
                        // Update existing product
                        UpdateProductFromImport(existing, row);
                        await _productRepo.UpdateAsync(existing);
                        result.Updated++;
                    }
                    else
                    {
                        // Create new product
                        var product = MapToProduct(row);
                        var created = await _productRepo.CreateAsync(product);

                        // Create inventory record
                        var inventory = new Inventory
                        {
                            ProductId = created.Id,
                            Quantity = 0,
                            UpdatedAt = DateTime.UtcNow
                        };
                        await _inventoryRepo.CreateAsync(inventory);

                        result.Created++;
                    }
                }

                await transaction.CommitAsync();
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                result.Errors.Add(new ImportErrorDTO
                {
                    RowNumber = 0,
                    Field = "System",
                    Message = $"Lỗi hệ thống: {ex.Message}"
                });
            }

            return result;
        }

        // ========== CUSTOMER IMPORT ==========

        public async Task<ImportResultDTO> ImportCustomersAsync(IFormFile file)
        {
            var result = new ImportResultDTO();

            // Validate file
            ValidateFile(file, new[] { ".csv", ".xlsx", ".xls" }, 10 * 1024 * 1024);

            // Parse file
            List<CustomerImportDTO> rows;
            try
            {
                var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (extension == ".csv")
                {
                    rows = ParseCsvFile<CustomerImportDTO>(file.OpenReadStream());
                }
                else
                {
                    rows = ParseExcelFile<CustomerImportDTO>(file.OpenReadStream());
                }
            }
            catch (Exception ex)
            {
                result.Errors.Add(new ImportErrorDTO
                {
                    RowNumber = 0,
                    Field = "File",
                    Message = $"Lỗi đọc file: {ex.Message}"
                });
                return result;
            }

            result.TotalRows = rows.Count;

            if (rows.Count == 0)
            {
                result.Errors.Add(new ImportErrorDTO
                {
                    RowNumber = 0,
                    Field = "File",
                    Message = "File không chứa dữ liệu"
                });
                return result;
            }

            // Process rows in transaction
            await using var transaction = await _importRepository.BeginTransactionAsync();
            try
            {
                for (int i = 0; i < rows.Count; i++)
                {
                    var row = rows[i];
                    var rowNumber = i + 2;

                    // Validate row
                    var validationErrors = ValidateCustomerRow(row, rowNumber);
                    if (validationErrors.Any())
                    {
                        result.Errors.AddRange(validationErrors);
                        result.Skipped++;
                        continue;
                    }

                    // Upsert: Tìm theo Phone hoặc Email (ưu tiên Phone)
                    Customer? existing = null;
                    if (!string.IsNullOrWhiteSpace(row.Phone))
                    {
                        existing = await _customerRepo.GetByPhoneAsync(row.Phone);
                    }
                    // Nếu không tìm thấy theo Phone, thử tìm theo Email
                    if (existing == null && !string.IsNullOrWhiteSpace(row.Email))
                    {
                        existing = await _customerRepo.GetByEmailAsync(row.Email);
                    }

                    if (existing != null)
                    {
                        // Update existing customer
                        UpdateCustomerFromImport(existing, row);
                        await _customerRepo.UpdateAsync(existing);
                        result.Updated++;
                    }
                    else
                    {
                        // Create new customer
                        var customer = MapToCustomer(row);
                        await _customerRepo.AddAsync(customer);
                        result.Created++;
                    }
                }

                await transaction.CommitAsync();
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                result.Errors.Add(new ImportErrorDTO
                {
                    RowNumber = 0,
                    Field = "System",
                    Message = $"Lỗi hệ thống: {ex.Message}"
                });
            }

            return result;
        }

        // ========== FILE PARSING ==========

        private List<T> ParseCsvFile<T>(Stream stream)
        {
            using var reader = new StreamReader(stream, Encoding.UTF8);
            var config = new CsvConfiguration(CultureInfo.InvariantCulture)
            {
                HeaderValidated = null,
                MissingFieldFound = null,
                TrimOptions = TrimOptions.Trim
            };
            using var csv = new CsvReader(reader, config);
            return csv.GetRecords<T>().ToList();
        }

        private List<T> ParseExcelFile<T>(Stream stream)
        {
            using var package = new ExcelPackage(stream);
            var worksheet = package.Workbook.Worksheets[0];
            var rows = new List<T>();

            if (worksheet.Dimension == null)
                return rows;

            var rowCount = worksheet.Dimension.Rows;
            var colCount = worksheet.Dimension.Columns;

            if (rowCount < 2) // Cần ít nhất header + 1 dòng data
                return rows;

            // Get headers
            var headers = new List<string>();
            for (int col = 1; col <= colCount; col++)
            {
                var header = worksheet.Cells[1, col].Value?.ToString()?.Trim();
                if (!string.IsNullOrEmpty(header))
                    headers.Add(header);
            }

            // Map headers to properties
            var properties = typeof(T).GetProperties();
            var propertyMap = new Dictionary<int, System.Reflection.PropertyInfo>();
            for (int col = 1; col <= headers.Count; col++)
            {
                var header = headers[col - 1];
                var property = properties.FirstOrDefault(p =>
                    p.Name.Equals(header, StringComparison.OrdinalIgnoreCase) ||
                    p.Name.Equals(header.Replace(" ", ""), StringComparison.OrdinalIgnoreCase));
                if (property != null)
                    propertyMap[col] = property;
            }

            // Read data rows
            for (int row = 2; row <= rowCount; row++)
            {
                var obj = Activator.CreateInstance<T>();
                bool hasData = false;

                foreach (var kvp in propertyMap)
                {
                    var col = kvp.Key;
                    var property = kvp.Value;
                    var cellValue = worksheet.Cells[row, col].Value;

                    if (cellValue != null)
                    {
                        hasData = true;
                        try
                        {
                            var value = ConvertValue(cellValue, property.PropertyType);
                            property.SetValue(obj, value);
                        }
                        catch
                        {
                            // Ignore conversion errors, will be caught in validation
                        }
                    }
                }

                if (hasData)
                    rows.Add(obj);
            }

            return rows;
        }

        private object? ConvertValue(object value, Type targetType)
        {
            if (value == null || value == DBNull.Value)
                return null;

            var underlyingType = Nullable.GetUnderlyingType(targetType) ?? targetType;

            if (underlyingType == typeof(string))
                return value.ToString();

            if (underlyingType == typeof(decimal) || underlyingType == typeof(decimal?))
            {
                if (decimal.TryParse(value.ToString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var dec))
                    return dec;
            }

            if (underlyingType == typeof(int) || underlyingType == typeof(int?))
            {
                if (int.TryParse(value.ToString(), out var i))
                    return i;
            }

            if (underlyingType == typeof(bool) || underlyingType == typeof(bool?))
            {
                if (bool.TryParse(value.ToString(), out var b))
                    return b;
                // Handle "1"/"0", "yes"/"no"
                var str = value.ToString()?.ToLowerInvariant();
                if (str == "1" || str == "yes" || str == "true" || str == "có")
                    return true;
                if (str == "0" || str == "no" || str == "false" || str == "không")
                    return false;
            }

            return Convert.ChangeType(value, underlyingType);
        }

        // ========== VALIDATION ==========

        private List<ImportErrorDTO> ValidateProductRow(ProductImportDTO row, int rowNumber)
        {
            var errors = new List<ImportErrorDTO>();

            if (string.IsNullOrWhiteSpace(row.ProductName))
            {
                errors.Add(new ImportErrorDTO
                {
                    RowNumber = rowNumber,
                    Field = nameof(row.ProductName),
                    Message = "Tên sản phẩm là bắt buộc"
                });
            }

            if (row.Price <= 0)
            {
                errors.Add(new ImportErrorDTO
                {
                    RowNumber = rowNumber,
                    Field = nameof(row.Price),
                    Message = "Giá sản phẩm phải lớn hơn 0"
                });
            }

            // Validate CategoryId exists (optional)
            if (row.CategoryId.HasValue && row.CategoryId.Value <= 0)
            {
                errors.Add(new ImportErrorDTO
                {
                    RowNumber = rowNumber,
                    Field = nameof(row.CategoryId),
                    Message = "CategoryId không hợp lệ"
                });
            }

            // Validate SupplierId exists (optional)
            if (row.SupplierId.HasValue && row.SupplierId.Value <= 0)
            {
                errors.Add(new ImportErrorDTO
                {
                    RowNumber = rowNumber,
                    Field = nameof(row.SupplierId),
                    Message = "SupplierId không hợp lệ"
                });
            }

            return errors;
        }

        private List<ImportErrorDTO> ValidateCustomerRow(CustomerImportDTO row, int rowNumber)
        {
            var errors = new List<ImportErrorDTO>();

            if (string.IsNullOrWhiteSpace(row.FullName))
            {
                errors.Add(new ImportErrorDTO
                {
                    RowNumber = rowNumber,
                    Field = nameof(row.FullName),
                    Message = "Tên khách hàng là bắt buộc"
                });
            }

            if (string.IsNullOrWhiteSpace(row.Phone) && string.IsNullOrWhiteSpace(row.Email))
            {
                errors.Add(new ImportErrorDTO
                {
                    RowNumber = rowNumber,
                    Field = "Phone/Email",
                    Message = "Phải có ít nhất một trong số: Số điện thoại hoặc Email"
                });
            }

            // Validate email format
            if (!string.IsNullOrWhiteSpace(row.Email) && !IsValidEmail(row.Email))
            {
                errors.Add(new ImportErrorDTO
                {
                    RowNumber = rowNumber,
                    Field = nameof(row.Email),
                    Message = "Email không hợp lệ"
                });
            }

            return errors;
        }

        private bool IsValidEmail(string email)
        {
            try
            {
                var addr = new System.Net.Mail.MailAddress(email);
                return addr.Address == email;
            }
            catch
            {
                return false;
            }
        }

        // ========== MAPPING ==========

        private Product MapToProduct(ProductImportDTO dto)
        {
            return new Product
            {
                Sku = dto.Sku,
                ProductName = dto.ProductName,
                CategoryId = dto.CategoryId,
                SupplierId = dto.SupplierId,
                Price = dto.Price,
                Cost = dto.Cost,
                UnitId = dto.UnitId,
                Description = dto.Description,
                ImageUrl = dto.ImageUrl,
                IsActive = dto.IsActive,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
        }

        private void UpdateProductFromImport(Product product, ProductImportDTO dto)
        {
            product.ProductName = dto.ProductName;
            product.CategoryId = dto.CategoryId;
            product.SupplierId = dto.SupplierId;
            product.Price = dto.Price;
            product.Cost = dto.Cost;
            product.UnitId = dto.UnitId;
            product.Description = dto.Description;
            product.ImageUrl = dto.ImageUrl;
            product.IsActive = dto.IsActive;
            product.UpdatedAt = DateTime.UtcNow;
        }

        private Customer MapToCustomer(CustomerImportDTO dto)
        {
            return new Customer
            {
                FullName = dto.FullName,
                Phone = dto.Phone,
                Email = dto.Email,
                Address = dto.Address,
                Note = dto.Note,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
        }

        private void UpdateCustomerFromImport(Customer customer, CustomerImportDTO dto)
        {
            customer.FullName = dto.FullName;
            customer.Phone = dto.Phone;
            customer.Email = dto.Email;
            customer.Address = dto.Address;
            customer.Note = dto.Note;
            customer.UpdatedAt = DateTime.UtcNow;
        }

        // ========== FILE VALIDATION ==========

        private void ValidateFile(IFormFile file, string[] allowedExtensions, long maxSizeBytes)
        {
            if (file == null || file.Length == 0)
                throw new ArgumentException("File không được để trống");

            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!allowedExtensions.Contains(extension))
                throw new ArgumentException($"Định dạng file không được hỗ trợ. Chỉ chấp nhận: {string.Join(", ", allowedExtensions)}");

            if (file.Length > maxSizeBytes)
                throw new ArgumentException($"Kích thước file vượt quá giới hạn {maxSizeBytes / 1024 / 1024}MB");
        }
    }
}

