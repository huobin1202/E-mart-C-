using Microsoft.AspNetCore.Mvc;
using backend.Services;
using backend.DTO;
using OfficeOpenXml;
using System.Text;
using System.Globalization;
using System.Linq;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ReportsController : ControllerBase
    {
        [HttpGet("invoice-statistics")]
        public async Task<IActionResult> InvoiceStatistics([FromServices] InvoiceStatisticsService service,
            [FromQuery] DateTime from, [FromQuery] DateTime to, [FromQuery] string period = "quarter", [FromQuery] string format = "json", [FromQuery] Guid? snapshotId = null, [FromQuery] string? productSearch = null, [FromQuery] int? categoryId = null, [FromQuery] string productSort = "name")
        {
            if (from == default || to == default) return BadRequest(new { message = "Vui lòng chọn ngày bắt đầu và kết thúc." });
            if (format is not ("json" or "xlsx")) return BadRequest(new { message = "Định dạng không hợp lệ." });
            try
            {
                var report = await service.GetAsync(from, to, period, snapshotId, productSearch, categoryId, productSort);
                if (format == "json") return Ok(report);
                using var package = new ExcelPackage();
                foreach (var table in report.Tables)
                {
                    var sheet = package.Workbook.Worksheets.Add($"Pivot {package.Workbook.Worksheets.Count + 1}");
                    sheet.Cells[1, 1].Value = table.Title;
                    sheet.Cells[2, 1].Value = $"{report.From:dd/MM/yyyy} - {report.To:dd/MM/yyyy}";
                    sheet.Cells[3, 1].Value = report.Policy;
                    sheet.Cells[3, 1, 3, table.Columns.Length + 2].Merge = true;
                    sheet.Cells[3, 1].Style.WrapText = true;
                    sheet.Row(3).Height = 60;
                    sheet.Cells[4, 1].Value = table.FilterDescription;
                    sheet.Cells[4, 1, 4, table.Columns.Length + 2].Merge = true;
                    sheet.Cells[4, 1].Style.WrapText = true;
                    sheet.Row(4).Height = 35;
                    sheet.Cells[5, 1].Value = "Chỉ tiêu / Đối tượng";
                    for (var c = 0; c < table.Columns.Length; c++) sheet.Cells[5, c + 2].Value = table.Columns[c];
                    sheet.Cells[5, table.Columns.Length + 2].Value = "TC";
                    var rows = table.Rows.ToList();
                    if (table.Totals.Length > 0) rows.Add(new PivotRow("Tổng cộng", table.Totals, table.GrandTotal));
                    for (var r = 0; r < rows.Count; r++)
                    {
                        sheet.Cells[r + 6, 1].Value = rows[r].Label;
                        for (var c = 0; c < rows[r].Values.Length; c++) sheet.Cells[r + 6, c + 2].Value = rows[r].Values[c];
                        sheet.Cells[r + 6, table.Columns.Length + 2].Value = rows[r].Total;
                    }
                    sheet.Cells[5, 1, 5, table.Columns.Length + 2].Style.Font.Bold = true;
                    sheet.Cells[6, 2, Math.Max(6, rows.Count + 5), table.Columns.Length + 2].Style.Numberformat.Format = "#,##0.00";
                    sheet.Column(1).Width = 35;
                    for (var c = 2; c <= table.Columns.Length + 2; c++) sheet.Column(c).Width = 20;
                    sheet.View.FreezePanes(6, 2);
                }
                return File(package.GetAsByteArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "thong-ke-hoa-don.xlsx");
            }
            catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
            catch (InvalidOperationException ex) { return Conflict(new { message = ex.Message }); }
        }

        private readonly ReportsService _reportsService;

        public ReportsController(ReportsService reportsService)
        {
            _reportsService = reportsService;
            ExcelPackage.LicenseContext = LicenseContext.NonCommercial;
        }

        // GET api/reports/sales?from=2025-11-12&to=2025-11-24&format=csv
        [HttpGet("sales")]
        public async Task<IActionResult> GetSalesReport(
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to,
            [FromQuery] string format = "csv")
        {
            try
            {
                var salesData = await _reportsService.GetSalesReportAsync(from, to);

                if (format.ToLowerInvariant() == "xlsx" || format.ToLowerInvariant() == "excel")
                {
                    return GenerateSalesExcel(salesData, from, to);
                }
                else
                {
                    return GenerateSalesCsv(salesData);
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Lỗi tạo báo cáo: {ex.Message}" });
            }
        }

        // GET api/reports/inventory?format=csv
        [HttpGet("inventory")]
        public async Task<IActionResult> GetInventoryReport([FromQuery] string format = "csv")
        {
            try
            {
                var inventoryData = await _reportsService.GetInventoryReportAsync();

                if (format.ToLowerInvariant() == "xlsx" || format.ToLowerInvariant() == "excel")
                {
                    return GenerateInventoryExcel(inventoryData);
                }
                else
                {
                    return GenerateInventoryCsv(inventoryData);
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Lỗi tạo báo cáo: {ex.Message}" });
            }
        }

        // GET api/reports/summary?from=2025-11-12&to=2025-11-24
        [HttpGet("summary")]
        public async Task<ActionResult<SalesSummaryDTO>> GetSalesSummary(
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to)
        {
            try
            {
                var summary = await _reportsService.GetSalesSummaryAsync(from, to);
                return Ok(summary);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Lỗi: {ex.Message}" });
            }
        }

        // GET api/reports/revenue-by-day?from=2025-11-12&to=2025-11-24
        [HttpGet("revenue-by-day")]
        public async Task<ActionResult<List<RevenueByDayDTO>>> GetRevenueByDay(
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to)
        {
            try
            {
                var data = await _reportsService.GetRevenueByDayAsync(from, to);
                return Ok(data);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Lỗi: {ex.Message}" });
            }
        }

        // GET api/reports/high-value-inventory?limit=10
        [HttpGet("high-value-inventory")]
        public async Task<ActionResult<List<HighValueInventoryDTO>>> GetHighValueInventory(
            [FromQuery] int limit = 10)
        {
            try
            {
                var data = await _reportsService.GetHighValueInventoryAsync(limit);
                return Ok(data);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Lỗi: {ex.Message}" });
            }
        }

        // GET api/reports/period-comparison?from=2025-11-12&to=2025-11-24
        [HttpGet("period-comparison")]
        public async Task<ActionResult<PeriodComparisonDTO>> GetPeriodComparison(
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to)
        {
            try
            {
                var data = await _reportsService.GetPeriodComparisonAsync(from, to);
                return Ok(data);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Lỗi: {ex.Message}" });
            }
        }

        // GET api/reports/top-products?from=2025-11-12&to=2025-11-24&limit=10
        [HttpGet("top-products")]
        public async Task<ActionResult<List<TopProductReportDTO>>> GetTopProducts(
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to,
            [FromQuery] int limit = 10)
        {
            try
            {
                var data = await _reportsService.GetTopProductsAsync(from, to, limit);
                return Ok(data);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Lỗi: {ex.Message}" });
            }
        }

        // GET api/reports/top-customers?from=2025-11-12&to=2025-11-24&limit=10
        [HttpGet("top-customers")]
        public async Task<ActionResult<List<TopCustomerReportDTO>>> GetTopCustomers(
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to,
            [FromQuery] int limit = 10)
        {
            try
            {
                var data = await _reportsService.GetTopCustomersAsync(from, to, limit);
                return Ok(data);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Lỗi: {ex.Message}" });
            }
        }

        // GET api/reports/sales-by-staff?from=2025-11-12&to=2025-11-24
        [HttpGet("sales-by-staff")]
        public async Task<ActionResult<List<SalesByStaffDTO>>> GetSalesByStaff(
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to)
        {
            try
            {
                var data = await _reportsService.GetSalesByStaffAsync(from, to);
                return Ok(data);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Lỗi: {ex.Message}" });
            }
        }

        // ========== CSV GENERATORS ==========

        private IActionResult GenerateSalesCsv(List<SalesReportDTO> data)
        {
            var csv = new StringBuilder();
            
            // Headers
            csv.AppendLine("Ngày,Đơn hàng,Khách hàng,Sản phẩm,SKU,Số lượng,Đơn giá,Thành tiền,Chiết khấu,Tổng đơn,Trạng thái");

            // Data rows
            foreach (var item in data)
            {
                csv.AppendLine($"{item.Date:yyyy-MM-dd HH:mm:ss}," +
                    $"\"{item.OrderNumber}\"," +
                    $"\"{item.CustomerName ?? ""}\"," +
                    $"\"{item.ProductName}\"," +
                    $"\"{item.Sku ?? ""}\"," +
                    $"{item.Quantity}," +
                    $"{item.UnitPrice.ToString("F2", CultureInfo.InvariantCulture)}," +
                    $"{item.TotalPrice.ToString("F2", CultureInfo.InvariantCulture)}," +
                    $"{item.Discount.ToString("F2", CultureInfo.InvariantCulture)}," +
                    $"{item.OrderTotal.ToString("F2", CultureInfo.InvariantCulture)}," +
                    $"\"{item.Status}\"");
            }

            var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv.ToString())).ToArray();
            var stream = new MemoryStream(bytes);

            var fileName = $"bao_cao_ban_hang_{DateTime.Now:yyyyMMdd_HHmmss}.csv";
            return File(stream, "text/csv; charset=utf-8", fileName);
        }

        private IActionResult GenerateInventoryCsv(List<InventoryReportDTO> data)
        {
            var csv = new StringBuilder();
            
            // Headers
            csv.AppendLine("Sản phẩm,SKU,Danh mục,Số lượng,Giá vốn,Giá bán,Tổng giá trị,Cập nhật");

            // Data rows
            foreach (var item in data)
            {
                csv.AppendLine($"\"{item.ProductName}\"," +
                    $"\"{item.Sku ?? ""}\"," +
                    $"\"{item.CategoryName ?? ""}\"," +
                    $"{item.Quantity}," +
                    $"{item.UnitCost.ToString("F2", CultureInfo.InvariantCulture)}," +
                    $"{item.UnitPrice.ToString("F2", CultureInfo.InvariantCulture)}," +
                    $"{item.TotalValue.ToString("F2", CultureInfo.InvariantCulture)}," +
                    $"{(item.LastUpdated.HasValue ? item.LastUpdated.Value.ToString("yyyy-MM-dd HH:mm:ss") : "")}");
            }

            var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv.ToString())).ToArray();
            var stream = new MemoryStream(bytes);

            var fileName = $"bao_cao_ton_kho_{DateTime.Now:yyyyMMdd_HHmmss}.csv";
            return File(stream, "text/csv; charset=utf-8", fileName);
        }

        // ========== EXCEL GENERATORS ==========

        private IActionResult GenerateSalesExcel(List<SalesReportDTO> data, DateTime? from, DateTime? to)
        {
            using var package = new ExcelPackage();
            var worksheet = package.Workbook.Worksheets.Add("Báo cáo bán hàng");

            // Title
            worksheet.Cells[1, 1].Value = "BÁO CÁO BÁN HÀNG";
            worksheet.Cells[1, 1, 1, 11].Merge = true;
            worksheet.Cells[1, 1].Style.Font.Bold = true;
            worksheet.Cells[1, 1].Style.Font.Size = 14;
            worksheet.Cells[1, 1].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;

            // Date range
            if (from.HasValue || to.HasValue)
            {
                var dateRange = $"Từ ngày: {(from.HasValue ? from.Value.ToString("dd/MM/yyyy") : "")} - Đến ngày: {(to.HasValue ? to.Value.ToString("dd/MM/yyyy") : "")}";
                worksheet.Cells[2, 1].Value = dateRange;
                worksheet.Cells[2, 1, 2, 11].Merge = true;
                worksheet.Cells[2, 1].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;
            }

            // Headers
            var headerRow = from.HasValue || to.HasValue ? 4 : 3;
            worksheet.Cells[headerRow, 1].Value = "Ngày";
            worksheet.Cells[headerRow, 2].Value = "Đơn hàng";
            worksheet.Cells[headerRow, 3].Value = "Khách hàng";
            worksheet.Cells[headerRow, 4].Value = "Sản phẩm";
            worksheet.Cells[headerRow, 5].Value = "SKU";
            worksheet.Cells[headerRow, 6].Value = "Số lượng";
            worksheet.Cells[headerRow, 7].Value = "Đơn giá";
            worksheet.Cells[headerRow, 8].Value = "Thành tiền";
            worksheet.Cells[headerRow, 9].Value = "Chiết khấu";
            worksheet.Cells[headerRow, 10].Value = "Tổng đơn";
            worksheet.Cells[headerRow, 11].Value = "Trạng thái";

            // Format headers
            using (var range = worksheet.Cells[headerRow, 1, headerRow, 11])
            {
                range.Style.Font.Bold = true;
                range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.LightGray);
                range.Style.Border.BorderAround(OfficeOpenXml.Style.ExcelBorderStyle.Thin);
            }

            // Data rows
            var startRow = headerRow + 1;
            for (int i = 0; i < data.Count; i++)
            {
                var row = startRow + i;
                var item = data[i];
                worksheet.Cells[row, 1].Value = item.Date;
                worksheet.Cells[row, 1].Style.Numberformat.Format = "dd/MM/yyyy HH:mm";
                worksheet.Cells[row, 2].Value = item.OrderNumber;
                worksheet.Cells[row, 3].Value = item.CustomerName ?? "";
                worksheet.Cells[row, 4].Value = item.ProductName;
                worksheet.Cells[row, 5].Value = item.Sku ?? "";
                worksheet.Cells[row, 6].Value = item.Quantity;
                worksheet.Cells[row, 7].Value = item.UnitPrice;
                worksheet.Cells[row, 7].Style.Numberformat.Format = "#,##0";
                worksheet.Cells[row, 8].Value = item.TotalPrice;
                worksheet.Cells[row, 8].Style.Numberformat.Format = "#,##0";
                worksheet.Cells[row, 9].Value = item.Discount;
                worksheet.Cells[row, 9].Style.Numberformat.Format = "#,##0";
                worksheet.Cells[row, 10].Value = item.OrderTotal;
                worksheet.Cells[row, 10].Style.Numberformat.Format = "#,##0";
                worksheet.Cells[row, 11].Value = item.Status;
            }

            worksheet.Cells.AutoFitColumns();

            var stream = new MemoryStream();
            package.SaveAs(stream);
            stream.Position = 0;

            var fileName = $"bao_cao_ban_hang_{DateTime.Now:yyyyMMdd_HHmmss}.xlsx";
            return File(stream, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
        }

        private IActionResult GenerateInventoryExcel(List<InventoryReportDTO> data)
        {
            using var package = new ExcelPackage();
            var worksheet = package.Workbook.Worksheets.Add("Báo cáo tồn kho");

            // Title
            worksheet.Cells[1, 1].Value = "BÁO CÁO TỒN KHO";
            worksheet.Cells[1, 1, 1, 8].Merge = true;
            worksheet.Cells[1, 1].Style.Font.Bold = true;
            worksheet.Cells[1, 1].Style.Font.Size = 14;
            worksheet.Cells[1, 1].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;

            // Headers
            worksheet.Cells[3, 1].Value = "Sản phẩm";
            worksheet.Cells[3, 2].Value = "SKU";
            worksheet.Cells[3, 3].Value = "Danh mục";
            worksheet.Cells[3, 4].Value = "Số lượng";
            worksheet.Cells[3, 5].Value = "Giá vốn";
            worksheet.Cells[3, 6].Value = "Giá bán";
            worksheet.Cells[3, 7].Value = "Tổng giá trị";
            worksheet.Cells[3, 8].Value = "Cập nhật";

            // Format headers
            using (var range = worksheet.Cells[3, 1, 3, 8])
            {
                range.Style.Font.Bold = true;
                range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.LightGray);
                range.Style.Border.BorderAround(OfficeOpenXml.Style.ExcelBorderStyle.Thin);
            }

            // Data rows
            for (int i = 0; i < data.Count; i++)
            {
                var row = 4 + i;
                var item = data[i];
                worksheet.Cells[row, 1].Value = item.ProductName;
                worksheet.Cells[row, 2].Value = item.Sku ?? "";
                worksheet.Cells[row, 3].Value = item.CategoryName ?? "";
                worksheet.Cells[row, 4].Value = item.Quantity;
                worksheet.Cells[row, 5].Value = item.UnitCost;
                worksheet.Cells[row, 5].Style.Numberformat.Format = "#,##0";
                worksheet.Cells[row, 6].Value = item.UnitPrice;
                worksheet.Cells[row, 6].Style.Numberformat.Format = "#,##0";
                worksheet.Cells[row, 7].Value = item.TotalValue;
                worksheet.Cells[row, 7].Style.Numberformat.Format = "#,##0";
                worksheet.Cells[row, 8].Value = item.LastUpdated;
                if (item.LastUpdated.HasValue)
                {
                    worksheet.Cells[row, 8].Style.Numberformat.Format = "dd/MM/yyyy HH:mm";
                }
            }

            worksheet.Cells.AutoFitColumns();

            var stream = new MemoryStream();
            package.SaveAs(stream);
            stream.Position = 0;

            var fileName = $"bao_cao_ton_kho_{DateTime.Now:yyyyMMdd_HHmmss}.xlsx";
            return File(stream, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
        }
    }
}

