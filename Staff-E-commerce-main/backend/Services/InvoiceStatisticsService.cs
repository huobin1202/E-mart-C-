using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;
using System.Globalization;
using System.Text;

namespace backend.Services;

public sealed record ReportExpense(DateTime Date, decimal Amount);
public sealed record ReportProduct(string? Sku, int? CategoryId, string? Category, decimal Price);
public sealed record ReportSnapshot(List<Invoice> Invoices, List<ReportExpense> Expenses)
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Dictionary<int, ReportProduct> ProductInfo { get; init; } = new();
}
public sealed record PivotRow(string Label, decimal[] Values, decimal Total, string? Category = null, decimal? Price = null);
public sealed record PivotReport(string Title, string[] Columns, List<PivotRow> Rows, decimal[] Totals, decimal GrandTotal)
{
    public string? FilterDescription { get; init; }
}
public sealed record InvoiceStatistics(Guid SnapshotId, DateTime From, DateTime To, decimal Revenue, int InvoiceCount,
    decimal Expense, decimal Profit, string Policy, List<PivotReport> Tables);

public sealed class InvoiceStatisticsService(AppDbContext db, BusMemoryCache<ReportSnapshot> cache)
{
    public async Task<InvoiceStatistics> GetAsync(DateTime from, DateTime to, string period, Guid? snapshotId = null, string? productSearch = null, int? categoryId = null, string productSort = "name")
    {
        if (from.Date > to.Date || to.Year - from.Year > 20 || to.Date == DateTime.MaxValue.Date)
            throw new ArgumentException("Khoảng ngày không hợp lệ hoặc vượt quá 21 năm.");
        if (period is not ("month" or "quarter" or "year"))
            throw new ArgumentException("Chế độ phải là month, quarter hoặc year.");
        var snapshot = await GetSnapshotAsync();
        if (snapshotId.HasValue && snapshot.Id != snapshotId.Value)
            throw new InvalidOperationException("Dữ liệu đã thay đổi hoặc hết cache. Vui lòng xem lại báo cáo trước khi xuất Excel.");
        return Build(snapshot, from.Date, to.Date, period, productSearch, categoryId, productSort);
    }

    public async Task<ReportSnapshot> GetSnapshotAsync()
    {
        var (snapshots, _) = await cache.GetOrCreateAsync(async () =>
        {
            var invoices = await db.Invoices.AsNoTracking().Include(i => i.Items).Include(i => i.Employee)
                .Where(i => (i.InvoiceStatus == "issued" || i.InvoiceStatus == "paid") && i.PaymentStatus == "paid").ToListAsync();
            var expenses = await db.PurchaseOrders.AsNoTracking().Include(p => p.Details).Where(p => p.Status == "completed")
                .Select(p => new ReportExpense(p.UpdatedAt, p.Details.Sum(d => d.Subtotal))).ToListAsync();
            var productRows = await db.Products.AsNoTracking()
                .Select(p => new { p.Id, p.Sku, p.CategoryId, Category = p.Category == null ? null : p.Category.Name, p.Price }).ToListAsync();
            var productInfo = productRows.ToDictionary(p => p.Id, p => new ReportProduct(p.Sku, p.CategoryId, p.Category, p.Price));
            return new List<ReportSnapshot> { new(invoices, expenses) { ProductInfo = productInfo } };
        }, TimeSpan.FromMinutes(10));
        return snapshots[0];
    }

    // Invoice timestamps are stored in UTC; business reports use Vietnam calendar dates.
    public static DateTime BusinessDate(DateTime utc) => utc.AddHours(7).Date;

    public static InvoiceStatistics Build(ReportSnapshot snapshot, DateTime from, DateTime to, string period, string? productSearch = null, int? categoryId = null, string productSort = "name")
    {
        if (productSort is not ("name" or "price_asc" or "price_desc"))
            throw new ArgumentException("Thứ tự sản phẩm không hợp lệ.");
        if (categoryId <= 0) throw new ArgumentException("Danh mục không hợp lệ.");
        var invoices = snapshot.Invoices.Where(i => BusinessDate(i.IssuedAt) >= from && BusinessDate(i.IssuedAt) <= to).ToList();
        var expenses = snapshot.Expenses.Where(e => BusinessDate(e.Date) >= from && BusinessDate(e.Date) <= to).ToList();
        string Key(DateTime d) => period == "year" ? $"{d.Year}" : period == "quarter" ? $"{d.Year}/Q{(d.Month - 1) / 3 + 1}" : $"{d.Year}/{d.Month:00}";
        var periods = new List<string>();
        for (var d = new DateTime(from.Year, from.Month, 1); d <= to; d = d.AddMonths(1))
            if (!periods.Contains(Key(d))) periods.Add(Key(d));
        var income = periods.Select(p => invoices.Where(i => Key(BusinessDate(i.IssuedAt)) == p).Sum(i => i.TotalAmount)).ToArray();
        var cost = periods.Select(p => expenses.Where(e => Key(BusinessDate(e.Date)) == p).Sum(e => e.Amount)).ToArray();
        var profit = income.Zip(cost, (a, b) => a - b).ToArray();
        var financial = new PivotReport("Tổng thu, tổng chi và lợi nhuận", periods.ToArray(),
            new() { new("Tổng thu", income, income.Sum()), new("Tổng chi", cost, cost.Sum()), new("Lợi nhuận", profit, profit.Sum()) },
            Array.Empty<decimal>(), 0);
        var years = Enumerable.Range(from.Year, to.Year - from.Year + 1).Select(y => y.ToString()).ToArray();
        PivotReport ByParty(string title, Func<Invoice, string> id, Func<Invoice, string> name) => Pivot(title, years,
            invoices.GroupBy(id).Select(g => (name(g.First()), years.Select(y => g.Where(i => BusinessDate(i.IssuedAt).Year.ToString() == y).Sum(i => i.TotalAmount)).ToArray())));
        var quarters = Enumerable.Range(from.Year, to.Year - from.Year + 1).SelectMany(y => Enumerable.Range(1, 4).Select(q => $"{y}/Q{q}")).ToArray();
        var allocated = new List<(string Id, string Name, string? Sku, int? CategoryId, string? Category, decimal? Price, string Quarter, decimal Amount)>();
        foreach (var invoice in invoices)
        {
            var items = invoice.Items.OrderBy(i => i.Id).ToList();
            var basis = items.Sum(i => i.TotalPrice);
            decimal remainder = invoice.TotalAmount;
            var date = BusinessDate(invoice.IssuedAt);
            if (items.Count == 0) allocated.Add(("none", "Không có chi tiết", null, null, null, null, $"{date.Year}/Q{(date.Month - 1) / 3 + 1}", remainder));
            for (var n = 0; n < items.Count; n++)
            {
                var item = items[n];
                var amount = n == items.Count - 1 ? remainder : Math.Round(invoice.TotalAmount * (basis == 0 ? 1m / items.Count : item.TotalPrice / basis), 2);
                remainder -= amount;
                snapshot.ProductInfo.TryGetValue(item.ProductId, out var info);
                allocated.Add((item.ProductId.ToString(), item.ProductName, item.Sku ?? info?.Sku, info?.CategoryId, info?.Category, info?.Price ?? item.UnitPrice, $"{date.Year}/Q{(date.Month - 1) / 3 + 1}", amount));
            }
        }
        var search = NormalizeSearch(productSearch);
        var filteredAllocated = allocated.Where(x =>
            (search.Length == 0 || NormalizeSearch(x.Name).Contains(search) || NormalizeSearch(x.Sku).Contains(search)) &&
            (!categoryId.HasValue || x.CategoryId == categoryId));
        var productRows = filteredAllocated.GroupBy(x => x.Id).Select(g => new PivotRow(
            g.First().Name, quarters.Select(q => g.Where(x => x.Quarter == q).Sum(x => x.Amount)).ToArray(), g.Sum(x => x.Amount), g.First().Category, g.First().Price));
        var sortedRows = (productSort switch
        {
            "price_asc" => productRows.OrderBy(r => r.Price == null).ThenBy(r => r.Price).ThenBy(r => r.Label),
            "price_desc" => productRows.OrderBy(r => r.Price == null).ThenByDescending(r => r.Price).ThenBy(r => r.Label),
            _ => productRows.OrderBy(r => r.Label)
        }).ToList();
        var productTotals = quarters.Select((_, i) => sortedRows.Sum(r => r.Values[i])).ToArray();
        var products = new PivotReport("Sản phẩm × quý và năm", quarters, sortedRows, productTotals, productTotals.Sum());
        var categoryName = categoryId.HasValue ? snapshot.ProductInfo.Values.FirstOrDefault(p => p.CategoryId == categoryId)?.Category : null;
        var sortLabel = productSort == "price_asc" ? "Giá bán tăng dần" : productSort == "price_desc" ? "Giá bán giảm dần" : "Tên sản phẩm A–Z";
        products = products with { FilterDescription = $"Tìm kiếm: {(string.IsNullOrWhiteSpace(productSearch) ? "Tất cả" : productSearch.Trim())}; Danh mục: {(categoryId.HasValue ? categoryName ?? $"#{categoryId}" : "Tất cả")}; Sắp xếp: {sortLabel}. Tổng cộng chỉ gồm sản phẩm phù hợp bộ lọc." };
        return new(snapshot.Id, from, to, income.Sum(), invoices.Count, cost.Sum(), profit.Sum(),
            "Ngày Việt Nam (UTC+7). Chỉ hóa đơn issued và paid; loại hóa đơn hủy/hoàn tiền. Tổng thu = TotalAmount đã gồm giảm giá, thuế, phí. Sản phẩm được phân bổ theo tỷ trọng thành tiền, phần dư làm tròn vào dòng cuối. Tổng chi = phiếu nhập completed theo ngày cập nhật hoàn tất; lợi nhuận = thu - chi nhập hàng, chưa gồm chi phí vận hành.",
            new() { financial, ByParty("Nhân viên × năm", i => i.EmployeeId?.ToString() ?? "none", i => i.Employee == null ? "Chưa gán nhân viên" : $"{i.Employee.FullName} (#{i.EmployeeId})"), products,
                ByParty("Khách hàng × năm", i => i.CustomerId?.ToString() ?? "none", i => i.CustomerId == null ? "Khách lẻ" : $"{i.CustomerName} (#{i.CustomerId})") });
    }

    private static string NormalizeSearch(string? value)
    {
        var normalized = (value ?? "").Trim().ToLowerInvariant().Replace('đ', 'd').Normalize(NormalizationForm.FormD);
        return new string(normalized.Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark).ToArray()).Normalize(NormalizationForm.FormC);
    }

    private static PivotReport Pivot(string title, string[] columns, IEnumerable<(string Name, decimal[] Values, string? Category)> source)
    {
        var rows = source.OrderBy(x => x.Name).Select(x => new PivotRow(x.Name, x.Values, x.Values.Sum(), x.Category)).ToList();
        var totals = columns.Select((_, index) => rows.Sum(r => r.Values[index])).ToArray();
        return new(title, columns, rows, totals, totals.Sum());
    }

    private static PivotReport Pivot(string title, string[] columns, IEnumerable<(string Name, decimal[] Values)> source) =>
        Pivot(title, columns, source.Select(x => (x.Name, x.Values, (string?)null)));
}
