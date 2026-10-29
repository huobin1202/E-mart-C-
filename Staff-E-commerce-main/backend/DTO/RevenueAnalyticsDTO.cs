namespace backend.DTO;

public sealed class RevenueAnalyticsDTO
{
    public List<int> Years { get; set; } = [];
    public List<string> FinanceColumns { get; set; } = [];
    public List<string> YearColumns { get; set; } = [];
    public List<string> ProductColumns { get; set; } = [];
    public List<RevenueMatrixRowDTO> FinancialRows { get; set; } = [];
    public List<RevenueMatrixRowDTO> EmployeeRows { get; set; } = [];
    public List<RevenueMatrixRowDTO> CustomerRows { get; set; } = [];
    public List<RevenueMatrixRowDTO> ProductRows { get; set; } = [];
    public decimal PeriodRevenue { get; set; }
}

public sealed class RevenueMatrixRowDTO
{
    public int? Id { get; set; }
    public string Label { get; set; } = "";
    public List<decimal> Values { get; set; } = [];
    public decimal Total { get; set; }
}

public sealed class RevenueAnalyticsRawDTO
{
    public List<RevenueOrderRawDTO> Orders { get; set; } = [];
    public List<RevenuePurchaseRawDTO> Purchases { get; set; } = [];
    public List<RevenueProductRawDTO> SoldItems { get; set; } = [];
    public List<RevenuePersonRawDTO> Employees { get; set; } = [];
    public List<RevenuePersonRawDTO> Customers { get; set; } = [];
    public List<RevenueProductRawDTO> Products { get; set; } = [];
}

public sealed class RevenueOrderRawDTO
{
    public DateTime Date { get; set; }
    public int? CustomerId { get; set; }
    public string? CustomerName { get; set; }
    public int? EmployeeId { get; set; }
    public string? EmployeeName { get; set; }
    public decimal Revenue { get; set; }
}

public sealed class RevenuePurchaseRawDTO { public DateTime Date { get; set; } public decimal Cost { get; set; } }
public sealed class RevenueProductRawDTO
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public DateTime Date { get; set; }
    public decimal Revenue { get; set; }
}
public sealed class RevenuePersonRawDTO { public int Id { get; set; } public string Name { get; set; } = ""; }
