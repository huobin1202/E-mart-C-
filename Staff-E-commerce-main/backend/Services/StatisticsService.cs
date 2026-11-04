using backend.DTO;
using backend.Repository;

namespace backend.Services
{
    public class StatisticsService
    {
        private readonly StatisticsRepository _repository;
        private readonly InvoiceStatisticsService _invoices;

        public StatisticsService(StatisticsRepository repository, InvoiceStatisticsService invoices)
        {
            _repository = repository;
            _invoices = invoices;
        }

        public Task<OverviewStatsDTO> GetOverviewStatsAsync()
        {
            return _repository.GetOverviewStatsAsync();
        }

        public async Task<List<RevenueDataPoint>> GetRevenueByPeriodAsync(int days = 7)
        {
            var today = InvoiceStatisticsService.BusinessDate(DateTime.UtcNow);
            var snapshot = await _invoices.GetSnapshotAsync();
            return Enumerable.Range(0, Math.Clamp(days, 1, 366)).Select(offset =>
            {
                var date = today.AddDays(-Math.Clamp(days, 1, 366) + offset + 1);
                var rows = snapshot.Invoices.Where(i => InvoiceStatisticsService.BusinessDate(i.IssuedAt) == date).ToList();
                return new RevenueDataPoint { Label = date.ToString("dd/MM"), Revenue = rows.Sum(i => i.TotalAmount), OrderCount = rows.Count };
            }).ToList();
        }

        public async Task<List<ProductSalesDTO>> GetBestSellersAsync(int limit = 10, int days = 7)
        {
            var today = InvoiceStatisticsService.BusinessDate(DateTime.UtcNow);
            var start = today.AddDays(-Math.Clamp(days, 1, 366) + 1);
            var snapshot = await _invoices.GetSnapshotAsync();
            return snapshot.Invoices.Where(i => InvoiceStatisticsService.BusinessDate(i.IssuedAt) >= start && InvoiceStatisticsService.BusinessDate(i.IssuedAt) <= today)
                .SelectMany(i => i.Items).GroupBy(i => i.ProductId)
                .Select(g => new ProductSalesDTO { ProductId = g.Key, ProductName = g.First().ProductName, Sku = g.First().Sku, QuantitySold = g.Sum(i => i.Quantity), Revenue = g.Sum(i => i.TotalPrice) })
                .OrderByDescending(p => p.QuantitySold).Take(Math.Clamp(limit, 1, 100)).ToList();
        }

        public Task<List<ProductInventoryDTO>> GetLowStockProductsAsync(int threshold = 10)
        {
            return _repository.GetLowStockProductsAsync(threshold);
        }

        public Task<OrderStatsDTO> GetOrderStatsAsync(int days = 7)
        {
            return _repository.GetOrderStatsAsync(days);
        }
    }
}
