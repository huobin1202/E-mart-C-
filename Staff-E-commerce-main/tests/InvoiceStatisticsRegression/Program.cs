using backend.Models;
using backend.Services;
using Microsoft.Extensions.Logging.Abstractions;
using backend.Controllers;
using Microsoft.AspNetCore.Mvc;
using OfficeOpenXml;

var checks = 0;
void Check(bool condition, string message) { if (!condition) throw new Exception(message); checks++; }
var invoices = new List<Invoice>
{
    new() { Id = 1, IssuedAt = new DateTime(2024,12,31,18,0,0), TotalAmount = 100.01m, EmployeeId = 1, CustomerId = 1, CustomerName = "A",
        Items = new List<InvoiceItem> { new() {Id = 1, ProductId = 1, ProductName = "P1", TotalPrice = 1}, new() {Id = 2, ProductId = 2, ProductName = "P2", TotalPrice = 2} } },
    new() { Id = 2, IssuedAt = new DateTime(2025,3,31,17,0,0), TotalAmount = 50, CustomerName = "Khách lẻ" },
    new() { Id = 3, IssuedAt = new DateTime(2026,1,1), TotalAmount = 99 }
};
var snapshot = new ReportSnapshot(invoices, new() { new(new DateTime(2025,1,1), 40) });
var report = InvoiceStatisticsService.Build(snapshot, new(2025,1,1), new(2025,12,31), "quarter");
Check(report.InvoiceCount == 2 && report.Revenue == 150.01m, "Vietnam calendar boundaries and inclusive range");
Check(report.Expense == 40 && report.Profit == 110.01m, "Income minus purchase expense");
Check(report.Tables[0].Rows[0].Values.SequenceEqual(new decimal[] {100.01m,50,0,0}), "Quarter boundaries");
foreach (var table in report.Tables.Skip(1))
{
    Check(table.GrandTotal == report.Revenue, "Pivot reconciles with invoices: " + table.Title);
    Check(table.Rows.All(r => r.Total == r.Values.Sum()), "Row totals: " + table.Title);
    Check(table.Totals.Sum() == table.GrandTotal, "Column totals: " + table.Title);
}
var product = report.Tables[2];
Check(product.Rows.Single(r => r.Label == "P1").Total == 33.34m, "Proportional rounding");
Check(product.Rows.Single(r => r.Label == "P2").Total == 66.67m, "Final line remainder");
Check(product.Rows.Any(r => r.Label == "Không có chi tiết" && r.Total == 50), "Invoices without details remain reconciled");
var multi = InvoiceStatisticsService.Build(snapshot, new(2024,1,1), new(2026,12,31), "year");
Check(multi.Tables[0].Columns.Length == 3 && multi.Revenue == 249.01m, "Comparison across years");
var empty = InvoiceStatisticsService.Build(snapshot, new(2023,1,1), new(2023,12,31), "month");
Check(empty.InvoiceCount == 0 && empty.Tables[0].Columns.Length == 12, "Empty report preserves periods");
var cache = new BusMemoryCache<ReportSnapshot>(NullLogger<BusMemoryCache<ReportSnapshot>>.Instance);
var loads = 0;
Task<List<ReportSnapshot>> Load() { loads++; return Task.FromResult(new List<ReportSnapshot>{snapshot}); }
await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => cache.GetOrCreateAsync(Load, TimeSpan.FromMinutes(10))));
Check(loads == 1, "Concurrent requests reuse cached source");
await cache.GetOrCreateAsync(Load, TimeSpan.FromTicks(-1));
Check(loads == 2, "Expired cache reloads source");
cache.Clear();
await cache.GetOrCreateAsync(Load, TimeSpan.FromMinutes(10));
Check(loads == 3, "CRUD invalidation reloads source");
var service = new InvoiceStatisticsService(null!, cache);
var controller = new ReportsController(null!);
var excelResult = await controller.InvoiceStatistics(service, new(2025,1,1), new(2025,12,31), "quarter", "xlsx", snapshot.Id);
Check(excelResult is FileContentResult, "Workbook export succeeds from cached snapshot without database");
using (var workbook = new ExcelPackage(new MemoryStream(((FileContentResult)excelResult).FileContents)))
{
    Check(workbook.Workbook.Worksheets.Count == 4, "Workbook includes all four pivots");
    var sheet = workbook.Workbook.Worksheets[0];
    Check(sheet.Cells[6, 6].GetValue<decimal>() == report.Revenue, "Workbook financial total matches screen data");
    Check(sheet.Cells[8, 6].GetValue<decimal>() == report.Profit, "Workbook profit matches screen data");
    Check(sheet.Cells[5, 6].Text == "TC" && sheet.Cells[2,1].Text.Contains("2025"), "Workbook totals and filter metadata");
}
Check(await controller.InvoiceStatistics(service, new(2025,2,1), new(2025,1,1)) is BadRequestObjectResult, "Reject reversed dates");
Check(await controller.InvoiceStatistics(service, new(2025,1,1), new(2025,12,31), "bad") is BadRequestObjectResult, "Reject unknown periods");
Check(await controller.InvoiceStatistics(service, new(2025,1,1), new(2025,12,31), "quarter", "xlsx", Guid.NewGuid()) is ConflictObjectResult, "Reject export of replaced snapshot");

var catalogSnapshot = snapshot with { ProductInfo = new()
{
    [1] = new ReportProduct("SKU-A", 10, "Đồ uống", 15000m),
    [2] = new ReportProduct("SKU-B", 20, "Bánh kẹo", 25000m)
} };
InvoiceStatistics Filter(string? text = null, int? category = null, string sort = "name") =>
    InvoiceStatisticsService.Build(catalogSnapshot, new(2025,1,1), new(2025,12,31), "quarter", text, category, sort);
var filtered = Filter(" sku-a ", 10, "price_desc");
Check(filtered.Tables[2].Rows.Count == 1 && filtered.Tables[2].GrandTotal == 33.34m, "Combined SKU/category/sort preserve allocated revenue");
Check(filtered.Revenue == report.Revenue && filtered.Expense == report.Expense && filtered.Tables[1].GrandTotal == report.Revenue && filtered.Tables[3].GrandTotal == report.Revenue, "Product filters do not change KPIs or other pivots");
Check(Filter(category: 10).Tables[2].Rows.Count == 1, "Category excludes invoice without product details");
Check(Filter(category: 999).Tables[2].GrandTotal == 0 && Filter(category: 999).Tables[2].Rows.Count == 0, "Unknown category yields empty pivot");
Check(Filter(sort: "price_asc").Tables[2].Rows.Select(r => r.Label).SequenceEqual(new[] { "P1", "P2", "Không có chi tiết" }), "Price ascending with missing prices last");
Check(Filter(sort: "price_desc").Tables[2].Rows.Select(r => r.Label).SequenceEqual(new[] { "P2", "P1", "Không có chi tiết" }), "Price descending with missing prices last");
Check(Filter(sort: "price_desc").Tables[2].GrandTotal == report.Revenue && Filter(sort: "price_asc").Tables[2].Rows.Count == 3, "Sorting preserves every product and total");
Check(Filter(sort: "price_desc").Tables[2].Rows[0].Price == 25000m, "Response exposes price for verifying order");
Check(Filter("not-found").Tables[2].Totals.All(v => v == 0), "Empty search has zero column totals");
Check(Filter().Tables[2].GrandTotal == report.Revenue, "Clearing product filters restores totals");
var named = catalogSnapshot with { Invoices = new() { new Invoice { IssuedAt = new(2025,1,1), TotalAmount = 80m,
    Items = new List<InvoiceItem> { new() { ProductId = 1, ProductName = "Đồ uống Trà xanh", Sku = "OLD-SKU", TotalPrice = 80m } } } } };
Check(InvoiceStatisticsService.Build(named, new(2025,1,1), new(2025,12,31), "quarter", "do uong tra").Tables[2].GrandTotal == 80m, "Vietnamese search supports diacritics and đ");
Check(InvoiceStatisticsService.Build(named, new(2025,1,1), new(2025,12,31), "quarter", "old-sku").Tables[2].GrandTotal == 80m, "Historical invoice SKU remains searchable");
cache.Replace(new[] { catalogSnapshot });
Check(await controller.InvoiceStatistics(service, new(2025,1,1), new(2025,12,31), productSort: "bad") is BadRequestObjectResult, "Reject unknown sorting mode");
var filteredExcel = (FileContentResult)await controller.InvoiceStatistics(service, new(2025,1,1), new(2025,12,31), "quarter", "xlsx", catalogSnapshot.Id, "sku-a", 10, "price_desc");
using (var workbook = new ExcelPackage(new MemoryStream(filteredExcel.FileContents)))
{
    var sheet = workbook.Workbook.Worksheets[2];
    Check(sheet.Cells[6,1].Text == "P1" && sheet.Cells[7,1].Text == "Tổng cộng" && sheet.Cells[7,6].GetValue<decimal>() == 33.34m, "Workbook exports only filtered rows with reconciled totals");
    Check(sheet.Cells[4,1].Text.Contains("sku-a") && sheet.Cells[4,1].Text.Contains("Giá bán giảm dần"), "Workbook includes filter and sort metadata");
}
var sortedExcel = (FileContentResult)await controller.InvoiceStatistics(service, new(2025,1,1), new(2025,12,31), "quarter", "xlsx", catalogSnapshot.Id, productSort: "price_desc");
using (var workbook = new ExcelPackage(new MemoryStream(sortedExcel.FileContents)))
    Check(workbook.Workbook.Worksheets[2].Cells[6,1].Text == "P2" && workbook.Workbook.Worksheets[2].Cells[7,1].Text == "P1", "Workbook preserves descending price order");
Console.WriteLine($"PASS: {checks} invoice statistics regression checks.");
