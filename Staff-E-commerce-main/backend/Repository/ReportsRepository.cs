using backend.Data;
using backend.DTO;
using Microsoft.EntityFrameworkCore;

namespace backend.Repository
{
    public class ReportsRepository
    {
        private readonly AppDbContext _context;

        public ReportsRepository(AppDbContext context)
        {
            _context = context;
        }

        public async Task<List<SalesReportDTO>> GetSalesReportAsync(DateTime? fromDate, DateTime? toDate)
        {
            var query = _context.OrderItems
                .Include(oi => oi.Order)
                    .ThenInclude(o => o!.Customer)
                .Include(oi => oi.Product)
                .Where(oi => oi.Order != null && oi.Order.Status == "completed") // Chỉ lấy orders đã hoàn thành
                .AsQueryable();

            if (fromDate.HasValue)
            {
                // Normalize to start of day
                var startDate = fromDate.Value.Date;
                query = query.Where(oi => oi.Order!.CreatedAt >= startDate);
            }

            if (toDate.HasValue)
            {
                // Normalize to end of day
                var endDate = toDate.Value.Date.AddDays(1).AddTicks(-1);
                query = query.Where(oi => oi.Order!.CreatedAt <= endDate);
            }

            var results = await query
                .Select(oi => new SalesReportDTO
                {
                    Date = oi.Order!.CreatedAt,
                    OrderNumber = oi.Order.OrderNumber,
                    CustomerName = oi.Order.Customer != null ? oi.Order.Customer.FullName : null,
                    ProductName = oi.Product != null ? oi.Product.ProductName : "",
                    Sku = oi.Product != null ? oi.Product.Sku : null,
                    Quantity = oi.Quantity,
                    UnitPrice = oi.UnitPrice,
                    TotalPrice = oi.TotalPrice,
                    Discount = oi.Order.Discount,
                    OrderTotal = oi.Order.TotalAmount,
                    Status = oi.Order.Status
                })
                .OrderByDescending(r => r.Date)
                .ToListAsync();

            return results;
        }

        public async Task<List<InventoryReportDTO>> GetInventoryReportAsync()
        {
            var results = await _context.Inventory
                .Include(i => i.Product)
                    .ThenInclude(p => p!.Category)
                .Where(i => i.Product != null)
                .Select(i => new InventoryReportDTO
                {
                    ProductName = i.Product!.ProductName,
                    Sku = i.Product.Sku,
                    CategoryName = i.Product.Category != null ? i.Product.Category.Name : null,
                    Quantity = i.Quantity,
                    UnitCost = i.Product.Cost ?? 0,
                    TotalValue = i.Quantity * (i.Product.Cost ?? 0),
                    UnitPrice = i.Product.Price,
                    LastUpdated = i.UpdatedAt
                })
                .OrderByDescending(i => i.TotalValue)
                .ToListAsync();

            return results;
        }

        public async Task<SalesSummaryDTO> GetSalesSummaryAsync(DateTime? fromDate, DateTime? toDate)
        {
            var query = _context.Orders.AsQueryable();

            if (fromDate.HasValue)
            {
                // Normalize to start of day
                var startDate = fromDate.Value.Date;
                query = query.Where(o => o.CreatedAt >= startDate);
            }

            if (toDate.HasValue)
            {
                // Normalize to end of day
                var endDate = toDate.Value.Date.AddDays(1).AddTicks(-1);
                query = query.Where(o => o.CreatedAt <= endDate);
            }

            // Chỉ tính các orders đã hoàn thành
            var paidOrders = query.Where(o => o.Status == "completed");

            var netRevenue = await paidOrders.SumAsync(o => o.TotalAmount);
            // TotalDiscount: Tính tổng discount của các orders đã thanh toán (để khớp với NetRevenue)
            var totalDiscount = await paidOrders.SumAsync(o => o.Discount);
            var totalOrders = await paidOrders.CountAsync();

            // ProductsSold: Chỉ tính sản phẩm từ orders đã hoàn thành
            var productsSoldQuery = _context.OrderItems
                .Include(oi => oi.Order)
                .Where(oi => oi.Order != null && oi.Order.Status == "completed");

            if (fromDate.HasValue)
            {
                var startDate = fromDate.Value.Date;
                productsSoldQuery = productsSoldQuery.Where(oi => oi.Order!.CreatedAt >= startDate);
            }

            if (toDate.HasValue)
            {
                var endDate = toDate.Value.Date.AddDays(1).AddTicks(-1);
                productsSoldQuery = productsSoldQuery.Where(oi => oi.Order!.CreatedAt <= endDate);
            }

            var productsSold = await productsSoldQuery.SumAsync(oi => oi.Quantity);

            return new SalesSummaryDTO
            {
                NetRevenue = netRevenue,
                TotalDiscount = totalDiscount,
                TotalOrders = totalOrders,
                ProductsSold = (int)productsSold
            };
        }

        public async Task<List<RevenueByDayDTO>> GetRevenueByDayAsync(DateTime? fromDate, DateTime? toDate)
        {
            var query = _context.Orders
                .Where(o => o.Status == "completed")
                .AsQueryable();

            if (fromDate.HasValue)
            {
                // Normalize to start of day
                var startDate = fromDate.Value.Date;
                query = query.Where(o => o.CreatedAt >= startDate);
            }

            if (toDate.HasValue)
            {
                // Normalize to end of day
                var endDate = toDate.Value.Date.AddDays(1).AddTicks(-1);
                query = query.Where(o => o.CreatedAt <= endDate);
            }

            var results = await query
                .GroupBy(o => o.CreatedAt.Date)
                .Select(g => new RevenueByDayDTO
                {
                    Date = g.Key,
                    Revenue = g.Sum(o => o.TotalAmount),
                    OrderCount = g.Count()
                })
                .OrderBy(r => r.Date)
                .ToListAsync();

            return results;
        }

        public async Task<List<HighValueInventoryDTO>> GetHighValueInventoryAsync(int limit = 100)
        {
            var results = await _context.Inventory
                .Include(i => i.Product)
                .Where(i => i.Product != null) 
                .Select(i => new HighValueInventoryDTO
                {
                    ProductId = i.ProductId,
                    ProductName = i.Product!.ProductName,
                    Sku = i.Product.Sku,
                    Quantity = i.Quantity,
                    TotalValue = i.Quantity * (i.Product.Cost ?? (i.Product.Price > 0 ? i.Product.Price : 0)) // Dùng Price nếu Cost = null, nếu cả 2 = 0 thì = 0
                })
                .OrderByDescending(i => i.TotalValue)
                .ThenByDescending(i => i.Quantity) // Sắp xếp theo số lượng nếu giá trị bằng nhau
                .Take(limit)
                .ToListAsync();

            return results;
        }

        public async Task<PeriodComparisonDTO> GetPeriodComparisonAsync(DateTime? fromDate, DateTime? toDate)
        {
            if (!fromDate.HasValue || !toDate.HasValue)
            {
                throw new ArgumentException("FromDate and ToDate are required for period comparison");
            }

            var periodDays = (toDate.Value.Date - fromDate.Value.Date).Days + 1;
            var previousFromDate = fromDate.Value.Date.AddDays(-periodDays);
            var previousToDate = fromDate.Value.Date.AddDays(-1);

            var currentPeriod = await GetSalesSummaryAsync(fromDate, toDate);
            var previousPeriod = await GetSalesSummaryAsync(previousFromDate, previousToDate);

            var revenueChange = previousPeriod.NetRevenue > 0
                ? ((currentPeriod.NetRevenue - previousPeriod.NetRevenue) / previousPeriod.NetRevenue) * 100
                : (currentPeriod.NetRevenue > 0 ? 100 : 0);

            var ordersChange = previousPeriod.TotalOrders > 0
                ? ((decimal)(currentPeriod.TotalOrders - previousPeriod.TotalOrders) / previousPeriod.TotalOrders) * 100
                : (currentPeriod.TotalOrders > 0 ? 100 : 0);

            var productsSoldChange = previousPeriod.ProductsSold > 0
                ? ((decimal)(currentPeriod.ProductsSold - previousPeriod.ProductsSold) / previousPeriod.ProductsSold) * 100
                : (currentPeriod.ProductsSold > 0 ? 100 : 0);

            return new PeriodComparisonDTO
            {
                CurrentPeriod = currentPeriod,
                PreviousPeriod = previousPeriod,
                RevenueChangePercent = revenueChange,
                OrdersChangePercent = ordersChange,
                ProductsSoldChangePercent = productsSoldChange
            };
        }

        public async Task<List<TopProductReportDTO>> GetTopProductsAsync(DateTime? fromDate, DateTime? toDate, int limit = 10)
        {
            var query = _context.OrderItems
                .Include(oi => oi.Order)
                .Include(oi => oi.Product)
                    .ThenInclude(p => p!.Category)
                .Where(oi => oi.Order != null && oi.Order.Status == "completed")
                .AsQueryable();

            if (fromDate.HasValue)
            {
                var startDate = fromDate.Value.Date;
                query = query.Where(oi => oi.Order!.CreatedAt >= startDate);
            }

            if (toDate.HasValue)
            {
                var endDate = toDate.Value.Date.AddDays(1).AddTicks(-1);
                query = query.Where(oi => oi.Order!.CreatedAt <= endDate);
            }

            var results = await query
                .GroupBy(oi => oi.ProductId)
                .Select(g => new
                {
                    ProductId = g.Key,
                    QuantitySold = g.Sum(oi => oi.Quantity),
                    Revenue = g.Sum(oi => oi.TotalPrice),
                    Product = g.First().Product
                })
                .OrderByDescending(x => x.Revenue)
                .Take(limit)
                .ToListAsync();

            return results.Select(r => new TopProductReportDTO
            {
                ProductId = r.ProductId,
                ProductName = r.Product?.ProductName ?? "",
                Sku = r.Product?.Sku,
                CategoryName = r.Product?.Category?.Name,
                QuantitySold = r.QuantitySold,
                Revenue = r.Revenue,
                AveragePrice = r.QuantitySold > 0 ? r.Revenue / r.QuantitySold : 0
            }).ToList();
        }

        public async Task<List<TopCustomerReportDTO>> GetTopCustomersAsync(DateTime? fromDate, DateTime? toDate, int limit = 10)
        {
            var query = _context.Orders
                .Include(o => o.Customer)
                .Where(o => o.Status == "completed")
                .AsQueryable();

            if (fromDate.HasValue)
            {
                var startDate = fromDate.Value.Date;
                query = query.Where(o => o.CreatedAt >= startDate);
            }

            if (toDate.HasValue)
            {
                var endDate = toDate.Value.Date.AddDays(1).AddTicks(-1);
                query = query.Where(o => o.CreatedAt <= endDate);
            }

            var results = await query
                .Where(o => o.CustomerId.HasValue)
                .GroupBy(o => o.CustomerId!.Value)
                .Select(g => new
                {
                    CustomerId = g.Key,
                    OrderCount = g.Count(),
                    TotalSpent = g.Sum(o => o.TotalAmount),
                    Customer = g.First().Customer
                })
                .OrderByDescending(x => x.TotalSpent)
                .Take(limit)
                .ToListAsync();

            return results.Select(r => new TopCustomerReportDTO
            {
                CustomerId = r.CustomerId,
                CustomerName = r.Customer?.FullName ?? "",
                Email = r.Customer?.Email,
                Phone = r.Customer?.Phone,
                OrderCount = r.OrderCount,
                TotalSpent = r.TotalSpent,
                AverageOrderValue = r.OrderCount > 0 ? r.TotalSpent / r.OrderCount : 0
            }).ToList();
        }

        public async Task<List<SalesByStaffDTO>> GetSalesByStaffAsync(DateTime? fromDate, DateTime? toDate)
        {
            var query = _context.Orders
                .Include(o => o.User)
                .Where(o => o.Status == "completed" && o.UserId.HasValue)
                .AsQueryable();

            if (fromDate.HasValue)
            {
                var startDate = fromDate.Value.Date;
                query = query.Where(o => o.CreatedAt >= startDate);
            }

            if (toDate.HasValue)
            {
                var endDate = toDate.Value.Date.AddDays(1).AddTicks(-1);
                query = query.Where(o => o.CreatedAt <= endDate);
            }

            var results = await query
                .GroupBy(o => o.UserId!.Value)
                .Select(g => new SalesByStaffDTO
                {
                    UserId = g.Key,
                    UserName = g.First().User!.Username,
                    FullName = g.First().User.FullName,
                    OrderCount = g.Count(),
                    TotalRevenue = g.Sum(o => o.TotalAmount),
                    AverageOrderValue = g.Count() > 0 ? g.Average(o => o.TotalAmount) : 0
                })
                .OrderByDescending(x => x.TotalRevenue)
                .ToListAsync();

            return results;
        }
    }
}

