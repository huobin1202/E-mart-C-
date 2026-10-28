using backend.Data;
using backend.DTO;
using backend.Helpers;
using Microsoft.EntityFrameworkCore;

namespace backend.Repository
{
    public class StatisticsRepository
    {
        private readonly AppDbContext _context;

        public StatisticsRepository(AppDbContext context)
        {
            _context = context;
        }

        public async Task<OverviewStatsDTO> GetOverviewStatsAsync()
        {
            var today = DateTimeHelper.VietnamToday;
            var yesterday = today.AddDays(-1);

            // Chuyển đổi khoảng thời gian "hôm nay" và "hôm qua" sang UTC để query chính xác
            var todayStartUtc = DateTimeHelper.ToUtc(today);
            var todayEndUtc = DateTimeHelper.ToUtc(today.AddDays(1));
            var yesterdayStartUtc = DateTimeHelper.ToUtc(yesterday);
            var yesterdayEndUtc = todayStartUtc;

            var todayRevenue = await _context.Orders
                .Where(o => o.Status == "completed" && o.CreatedAt >= todayStartUtc && o.CreatedAt < todayEndUtc)
                .SumAsync(o => o.TotalAmount);

            var yesterdayRevenue = await _context.Orders
                .Where(o => o.Status == "completed" && o.CreatedAt >= yesterdayStartUtc && o.CreatedAt < yesterdayEndUtc)
                .SumAsync(o => o.TotalAmount);

            decimal? revenueChange = yesterdayRevenue > 0
                ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
                : null;  // null nếu hôm qua không có dữ liệu

            var todayOrders = await _context.Orders
                .Where(o => o.CreatedAt >= todayStartUtc && o.CreatedAt < todayEndUtc)
                .CountAsync();

            var yesterdayOrders = await _context.Orders
                .Where(o => o.CreatedAt >= yesterdayStartUtc && o.CreatedAt < yesterdayEndUtc)
                .CountAsync();

            decimal? ordersChange = yesterdayOrders > 0
                ? ((decimal)(todayOrders - yesterdayOrders) / yesterdayOrders) * 100
                : null;  // null nếu hôm qua không có dữ liệu

            var todayProductsSold = await _context.OrderItems
                .Include(oi => oi.Order)
                .Where(oi => oi.Order != null && oi.Order.CreatedAt >= todayStartUtc && oi.Order.CreatedAt < todayEndUtc && oi.Order.Status == "completed")
                .SumAsync(oi => oi.Quantity);

            // AOV tính theo 7 ngày gần nhất để chính xác hơn
            var last7DaysStartUtc = DateTimeHelper.ToUtc(today.AddDays(-6));
            var last7DaysRevenue = await _context.Orders
                .Where(o => o.Status == "completed" && o.CreatedAt >= last7DaysStartUtc && o.CreatedAt < todayEndUtc)
                .SumAsync(o => o.TotalAmount);
            var last7DaysOrders = await _context.Orders
                .Where(o => o.Status == "completed" && o.CreatedAt >= last7DaysStartUtc && o.CreatedAt < todayEndUtc)
                .CountAsync();
            var avgOrderValue = last7DaysOrders > 0 ? last7DaysRevenue / last7DaysOrders : 0;

            var totalDiscount = await _context.Orders
                .Where(o => o.CreatedAt >= todayStartUtc && o.CreatedAt < todayEndUtc)
                .SumAsync(o => o.Discount);

            var lowStockCount = await _context.Products
                .Where(product => product.StockQuantity < 10)
                .CountAsync();

            var inventoryValue = await _context.Products
                .SumAsync(product => product.StockQuantity * (product.Cost ?? 0));

            return new OverviewStatsDTO
            {
                TodayRevenue = todayRevenue,
                RevenueChange = revenueChange.HasValue ? Math.Round(revenueChange.Value, 1) : null,
                TodayOrders = todayOrders,
                OrdersChange = ordersChange.HasValue ? Math.Round(ordersChange.Value, 1) : null,
                TodayProductsSold = todayProductsSold,
                AverageOrderValue = avgOrderValue,
                TotalDiscountApplied = totalDiscount,
                LowStockCount = lowStockCount,
                InventoryValue = inventoryValue
            };
        }

        public async Task<List<RevenueDataPoint>> GetRevenueByPeriodAsync(int days = 7)
        {
            var today = DateTimeHelper.VietnamToday;
            var startDate = today.AddDays(-days + 1);
            var startDateUtc = DateTimeHelper.ToUtc(startDate);
            var endDateUtc = DateTimeHelper.ToUtc(today.AddDays(1));

            // Lấy tất cả orders trong khoảng thời gian
            var orders = await _context.Orders
                .Where(o => o.Status == "completed" && o.CreatedAt >= startDateUtc && o.CreatedAt < endDateUtc)
                .ToListAsync();

            // Group theo ngày Việt Nam
            var data = orders
                .Select(o => new
                {
                    Order = o,
                    VnDate = DateTimeHelper.ToVietnamTime(o.CreatedAt).Date
                })
                .GroupBy(x => x.VnDate)
                .Select(g => new
                {
                    Date = g.Key,
                    Revenue = g.Sum(x => x.Order.TotalAmount),
                    OrderCount = g.Count()
                })
                .OrderBy(d => d.Date)
                .ToList();

            return data.Select(d => new RevenueDataPoint
            {
                Label = d.Date.ToString("dd/MM"),
                Revenue = d.Revenue,
                OrderCount = d.OrderCount
            }).ToList();
        }

        public async Task<List<ProductSalesDTO>> GetBestSellersAsync(int limit = 10, int days = 7)
        {
            var today = DateTimeHelper.VietnamToday;
            var startDate = today.AddDays(-days + 1);
            var startDateUtc = DateTimeHelper.ToUtc(startDate);
            var endDateUtc = DateTimeHelper.ToUtc(today.AddDays(1));

            var data = await _context.OrderItems
                .Include(oi => oi.Order)
                .Where(oi => oi.Order != null && oi.Order.Status == "completed" && oi.Order.CreatedAt >= startDateUtc && oi.Order.CreatedAt < endDateUtc)
                .GroupBy(oi => oi.ProductId)
                .Select(g => new
                {
                    ProductId = g.Key,
                    QuantitySold = g.Sum(oi => oi.Quantity),
                    Revenue = g.Sum(oi => oi.TotalPrice)
                })
                .OrderByDescending(x => x.QuantitySold)
                .Take(limit)
                .ToListAsync();

            var productIds = data.Select(d => d.ProductId).ToList();
            var products = await _context.Products
                .Include(p => p.Category)
                .Where(p => productIds.Contains(p.Id))
                .ToListAsync();

            return data.Select(d =>
            {
                var product = products.First(p => p.Id == d.ProductId);
                return new ProductSalesDTO
                {
                    ProductId = product.Id,
                    ProductName = product.ProductName,
                    Sku = product.Sku,
                    QuantitySold = d.QuantitySold,
                    Revenue = d.Revenue,
                    ImageUrl = product.ImageUrl,
                    CategoryName = product.Category?.Name
                };
            }).ToList();
        }

        public async Task<List<ProductInventoryDTO>> GetLowStockProductsAsync(int threshold = 10)
        {
            return await _context.Products
                .Where(product => product.StockQuantity < threshold)
                .OrderBy(product => product.StockQuantity)
                .Select(product => new ProductInventoryDTO
                {
                    ProductId = product.Id,
                    ProductName = product.ProductName,
                    Sku = product.Sku,
                    Quantity = product.StockQuantity,
                    Price = product.Price,
                    LastCheckedAt = product.UpdatedAt
                })
                .ToListAsync();
        }

        public async Task<OrderStatsDTO> GetOrderStatsAsync(int days = 7)
        {
            var today = DateTimeHelper.VietnamToday;
            var startDate = today.AddDays(-days + 1);
            var startDateUtc = DateTimeHelper.ToUtc(startDate);
            var endDateUtc = DateTimeHelper.ToUtc(today.AddDays(1));

            var orders = await _context.Orders
                .Where(o => o.CreatedAt >= startDateUtc && o.CreatedAt < endDateUtc)
                .ToListAsync();

            return new OrderStatsDTO
            {
                TotalOrders = orders.Count,
                CompletedOrders = orders.Count(o => o.Status == "completed"),
                PendingOrders = orders.Count(o => o.Status == "pending"),
                ProcessingOrders = 0, // No processing status in ENUM
                CancelledOrders = orders.Count(o => o.Status == "cancelled"),
                TotalRevenue = orders.Where(o => o.Status == "completed").Sum(o => o.TotalAmount),
                AverageOrderValue = orders.Where(o => o.Status == "completed").Any()
                    ? orders.Where(o => o.Status == "completed").Average(o => o.TotalAmount)
                    : 0
            };
        }
    }
}
