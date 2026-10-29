using backend.DTO;
using backend.Repository;
using OfficeOpenXml;
using OfficeOpenXml.Style;
using System.Drawing;

namespace backend.Services;

/// <summary>BLL: pivots repository projections and applies report rules. Excel serialization also belongs to this service.</summary>
public sealed class RevenueAnalyticsService(RevenueAnalyticsRepository repository)
{
    public async Task<RevenueAnalyticsDTO> GetAsync(int firstYear, int lastYear, DateTime? from, DateTime? to, CancellationToken ct)
    {
        if (firstYear < 2000 || lastYear > 2200 || firstYear > lastYear || lastYear - firstYear > 9)
            throw new ArgumentOutOfRangeException(nameof(firstYear), "Chọn tối đa 10 năm trong khoảng 2000–2200.");
        if (from.HasValue && to.HasValue && from.Value.Date > to.Value.Date)
            throw new ArgumentException("Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.");

        var raw = await repository.LoadAsync(firstYear, lastYear, ct);
        var periodRevenue = await repository.GetPeriodRevenueAsync(from, to, ct);
        var years = Enumerable.Range(firstYear, lastYear - firstYear + 1).ToList();
        var columns = years.SelectMany(y => Enumerable.Range(1, 4).Select(q => $"Q{q}/{y}")).ToList();
        List<string> financeColumns = years.Count == 1 ? new() { "Q1", "Q2", "Q3", "Q4" } : columns;
        decimal SumFor(int year, int quarter, IEnumerable<(DateTime date, decimal amount)> source) =>
            source.Where(x => x.date.Year == year && (quarter == 0 || ((x.date.Month - 1) / 3 + 1) == quarter)).Sum(x => x.amount);

        var revenue = raw.Orders.Select(o => (o.Date, o.Revenue)).ToList();
        var cost = raw.Purchases.Select(p => (p.Date, p.Cost)).ToList();
        var financeIndexes = years.Count == 1 ? Enumerable.Range(1, 4).Select(q => (years[0], q)).ToList() :
            years.SelectMany(y => Enumerable.Range(1, 4).Select(q => (y, q))).ToList();
        var revenueValues = financeIndexes.Select(x => SumFor(x.Item1, x.Item2, revenue)).ToList();
        var costValues = financeIndexes.Select(x => SumFor(x.Item1, x.Item2, cost)).ToList();
        var rows = new List<RevenueMatrixRowDTO>
        {
            Matrix("Tổng doanh thu", revenueValues), Matrix("Tổng chi nhập hàng", costValues),
            Matrix("Lợi nhuận", revenueValues.Zip(costValues, (a,b) => a-b).ToList())
        };
        var yearColumns = years.Select(y => y.ToString()).ToList();
        List<decimal> AnnualRevenue(Func<RevenueOrderRawDTO, bool> predicate) => years.Select(y => raw.Orders.Where(o => o.Date.Year == y && predicate(o)).Sum(o => o.Revenue)).ToList();
        var employeeRows = raw.Employees.Select(e => Matrix(e.Name, AnnualRevenue(o => o.EmployeeId == e.Id), e.Id)).ToList();
        var customerRows = raw.Customers.Select(c => Matrix(c.Name, AnnualRevenue(o => o.CustomerId == c.Id), c.Id)).ToList();
        employeeRows.Add(Matrix("Tổng cộng", years.Select(y => raw.Orders.Where(o => o.Date.Year == y && o.EmployeeId.HasValue).Sum(o => o.Revenue)).ToList()));
        customerRows.Add(Matrix("Tổng cộng", years.Select(y => raw.Orders.Where(o => o.Date.Year == y && o.CustomerId.HasValue).Sum(o => o.Revenue)).ToList()));

        var productRows = raw.Products.Select(p =>
        {
            var values = years.SelectMany(y => Enumerable.Range(1, 4).Select(q => raw.SoldItems
                .Where(i => i.Id == p.Id && i.Date.Year == y && (i.Date.Month - 1) / 3 + 1 == q).Sum(i => i.Revenue))).ToList();
            return Matrix(p.Name, values, p.Id);
        }).ToList();
        productRows.Add(Matrix("Tổng cộng", columns.Select((_, i) => raw.SoldItems.Where(item =>
            item.Date.Year == years[i / 4] && (item.Date.Month - 1) / 3 + 1 == i % 4 + 1).Sum(item => item.Revenue)).ToList()));

        return new RevenueAnalyticsDTO { Years = years, FinanceColumns = financeColumns, YearColumns = yearColumns,
            ProductColumns = columns, FinancialRows = rows, EmployeeRows = employeeRows, CustomerRows = customerRows,
            ProductRows = productRows, PeriodRevenue = periodRevenue };
    }

    public byte[] Export(RevenueAnalyticsDTO report, string section)
    {
        var (sheet, title, columns, rows) = section.ToLowerInvariant() switch
        {
            "financial" => ("Tài chính", "BÁO CÁO TÀI CHÍNH", report.FinanceColumns.Append("Tổng cộng").ToList(), report.FinancialRows),
            "employees" => ("Theo nhân viên", "DOANH THU THEO NHÂN VIÊN", report.YearColumns.Append("Tổng cộng").ToList(), report.EmployeeRows),
            "customers" => ("Theo khách hàng", "DOANH THU THEO KHÁCH HÀNG", report.YearColumns.Append("Tổng cộng").ToList(), report.CustomerRows),
            "products" => ("Sản phẩm", "DOANH THU THEO SẢN PHẨM", report.ProductColumns.Append("Tổng cộng").ToList(), report.ProductRows),
            _ => throw new ArgumentException("Loại báo cáo không hợp lệ.", nameof(section))
        };
        ExcelPackage.LicenseContext = LicenseContext.NonCommercial;
        using var package = new ExcelPackage();
        var ws = package.Workbook.Worksheets.Add(sheet);
        ws.Cells[1, 1].Value = title;
        ws.Cells[1, 1, 1, columns.Count + 1].Merge = true;
        ws.Cells[1, 1].Style.Font.Bold = true;
        ws.Cells[2, 1].Value = "Đối tượng";
        for (var i = 0; i < columns.Count; i++) ws.Cells[2, i + 2].Value = columns[i];
        using (var header = ws.Cells[2, 1, 2, columns.Count + 1]) { header.Style.Font.Bold = true; header.Style.Fill.PatternType = ExcelFillStyle.Solid; header.Style.Fill.BackgroundColor.SetColor(Color.LightSteelBlue); }
        for (var r = 0; r < rows.Count; r++)
        {
            ws.Cells[r + 3, 1].Value = rows[r].Label;
            for (var c = 0; c < rows[r].Values.Count; c++) ws.Cells[r + 3, c + 2].Value = (double)rows[r].Values[c];
            ws.Cells[r + 3, columns.Count + 1].Value = (double)rows[r].Total;
        }
        ws.Cells[3, 2, rows.Count + 2, columns.Count + 1].Style.Numberformat.Format = "#,##0.00";
        ws.Cells[ws.Dimension.Address].AutoFitColumns();
        return package.GetAsByteArray();
    }

    private static RevenueMatrixRowDTO Matrix(string label, List<decimal> values, int? id = null) =>
        new() { Id = id, Label = label, Values = values, Total = values.Sum() };
}
