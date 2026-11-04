using backend.Helpers;
using Microsoft.AspNetCore.Mvc;
using backend.Services;
using backend.DTO;
using OfficeOpenXml;
using System.Text;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ImportController : ControllerBase
    {
        [HttpGet("export/products")]
        public async Task<IActionResult> ExportProducts([FromServices] ProductService service)
        {
            var rows = (await service.GetSearchProductsAsync()).Select(p => new ProductImportDTO {
                Sku = p.Sku, ProductName = p.ProductName, CategoryId = p.CategoryId, SupplierId = p.SupplierId,
                Price = p.Price, Cost = p.Cost, UnitId = p.UnitId, Description = p.Description, ImageUrl = p.ImageUrl, IsActive = p.IsActive
            });
            return ExportWorkbook(rows, "san-pham");
        }

        [HttpGet("export/customers")]
        public async Task<IActionResult> ExportCustomers([FromServices] CustomerService service)
        {
            var rows = (await service.GetCachedAsync()).Select(c => new CustomerImportDTO {
                FullName = c.FullName, Phone = c.Phone, Email = c.Email, Address = c.Address, Note = c.Note
            });
            return ExportWorkbook(rows, "khach-hang");
        }

        private IActionResult ExportWorkbook<T>(IEnumerable<T> rows, string name)
        {
            using var package = new ExcelPackage();
            var sheet = package.Workbook.Worksheets.Add(name);
            var fields = typeof(T).GetProperties();
            for (var col = 0; col < fields.Length; col++) sheet.Cells[1, col + 1].Value = fields[col].Name;
            var row = 2;
            foreach (var item in rows)
            {
                for (var col = 0; col < fields.Length; col++) sheet.Cells[row, col + 1].Value = fields[col].GetValue(item);
                row++;
            }
            sheet.Cells[1, 1, 1, fields.Length].Style.Font.Bold = true;
            sheet.View.FreezePanes(2, 1);
            sheet.Cells.AutoFitColumns(12, 50);
            return File(package.GetAsByteArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", name + ".xlsx");
        }

        private readonly ImportService _importService;

        public ImportController(ImportService importService)
        {
            _importService = importService;
            ExcelPackage.LicenseContext = LicenseContext.NonCommercial;
        }

        // POST api/import/products
        [HttpPost("products")]
        public async Task<ActionResult<ImportResultDTO>> ImportProducts([FromForm] IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest("File không được để trống");

            try
            {
                var result = await _importService.ImportProductsAsync(file);
                return Ok(result);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return this.ServerError(ex);
            }
        }

        // POST api/import/customers
        [HttpPost("customers")]
        public async Task<ActionResult<ImportResultDTO>> ImportCustomers([FromForm] IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest("File không được để trống");

            try
            {
                var result = await _importService.ImportCustomersAsync(file);
                return Ok(result);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return this.ServerError(ex);
            }
        }

        // GET api/import/template/products?format=csv|excel
        [HttpGet("template/products")]
        public IActionResult DownloadProductTemplate([FromQuery] string format = "excel")
        {
            try
            {
                if (format.ToLowerInvariant() == "csv")
                {
                    return GenerateProductCsvTemplate();
                }
                else
                {
                    return GenerateProductExcelTemplate();
                }
            }
            catch (Exception ex)
            {
                return this.ServerError(ex);
            }
        }

        // GET api/import/template/customers?format=csv|excel
        [HttpGet("template/customers")]
        public IActionResult DownloadCustomerTemplate([FromQuery] string format = "excel")
        {
            try
            {
                if (format.ToLowerInvariant() == "csv")
                {
                    return GenerateCustomerCsvTemplate();
                }
                else
                {
                    return GenerateCustomerExcelTemplate();
                }
            }
            catch (Exception ex)
            {
                return this.ServerError(ex);
            }
        }

        // ========== TEMPLATE GENERATORS ==========

        private IActionResult GenerateProductExcelTemplate()
        {
            using var package = new ExcelPackage();
            var worksheet = package.Workbook.Worksheets.Add("Products");

            // Headers
            worksheet.Cells[1, 1].Value = "Sku";
            worksheet.Cells[1, 2].Value = "ProductName";
            worksheet.Cells[1, 3].Value = "CategoryId";
            worksheet.Cells[1, 4].Value = "SupplierId";
            worksheet.Cells[1, 5].Value = "Price";
            worksheet.Cells[1, 6].Value = "Cost";
            worksheet.Cells[1, 7].Value = "Unit";
            worksheet.Cells[1, 8].Value = "Description";
            worksheet.Cells[1, 9].Value = "ImageUrl";
            worksheet.Cells[1, 10].Value = "IsActive";

            // Sample data
            worksheet.Cells[2, 1].Value = "SKU001";
            worksheet.Cells[2, 2].Value = "Sản phẩm mẫu";
            worksheet.Cells[2, 3].Value = 1;
            worksheet.Cells[2, 4].Value = 1;
            worksheet.Cells[2, 5].Value = 100000;
            worksheet.Cells[2, 6].Value = 80000;
            worksheet.Cells[2, 7].Value = "Cái";
            worksheet.Cells[2, 8].Value = "Mô tả sản phẩm";
            worksheet.Cells[2, 9].Value = "";
            worksheet.Cells[2, 10].Value = true;

            // Format header
            using (var range = worksheet.Cells[1, 1, 1, 10])
            {
                range.Style.Font.Bold = true;
                range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.LightGray);
            }

            worksheet.Cells.AutoFitColumns();

            var stream = new MemoryStream();
            package.SaveAs(stream);
            stream.Position = 0;

            return File(stream, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "product_template.xlsx");
        }

        private IActionResult GenerateProductCsvTemplate()
        {
            var csv = new StringBuilder();
            csv.AppendLine("Sku,ProductName,CategoryId,SupplierId,Price,Cost,Unit,Description,ImageUrl,IsActive");
            csv.AppendLine("SKU001,Sản phẩm mẫu,1,1,100000,80000,Cái,Mô tả sản phẩm,,true");

            var bytes = Encoding.UTF8.GetBytes(csv.ToString());
            var stream = new MemoryStream(bytes);

            return File(stream, "text/csv", "product_template.csv");
        }

        private IActionResult GenerateCustomerExcelTemplate()
        {
            using var package = new ExcelPackage();
            var worksheet = package.Workbook.Worksheets.Add("Customers");

            // Headers
            worksheet.Cells[1, 1].Value = "FullName";
            worksheet.Cells[1, 2].Value = "Phone";
            worksheet.Cells[1, 3].Value = "Email";
            worksheet.Cells[1, 4].Value = "Address";
            worksheet.Cells[1, 5].Value = "Note";

            // Sample data
            worksheet.Cells[2, 1].Value = "Nguyễn Văn A";
            worksheet.Cells[2, 2].Value = "0123456789";
            worksheet.Cells[2, 3].Value = "nguyenvana@example.com";
            worksheet.Cells[2, 4].Value = "123 Đường ABC, Quận XYZ";
            worksheet.Cells[2, 5].Value = "Khách hàng VIP";

            // Format header
            using (var range = worksheet.Cells[1, 1, 1, 5])
            {
                range.Style.Font.Bold = true;
                range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.LightGray);
            }

            worksheet.Cells.AutoFitColumns();

            var stream = new MemoryStream();
            package.SaveAs(stream);
            stream.Position = 0;

            return File(stream, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "customer_template.xlsx");
        }

        private IActionResult GenerateCustomerCsvTemplate()
        {
            var csv = new StringBuilder();
            csv.AppendLine("FullName,Phone,Email,Address,Note");
            csv.AppendLine("Nguyễn Văn A,0123456789,nguyenvana@example.com,123 Đường ABC Quận XYZ,Khách hàng VIP");

            var bytes = Encoding.UTF8.GetBytes(csv.ToString());
            var stream = new MemoryStream(bytes);

            return File(stream, "text/csv", "customer_template.csv");
        }
    }
}

