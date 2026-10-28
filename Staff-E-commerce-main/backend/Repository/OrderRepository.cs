using backend.Data;
using backend.DTO;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Repository
{
    public class OrderRepository
    {
        private readonly AppDbContext _context;

        public OrderRepository(AppDbContext context)
        {
            _context = context;
        }

        // Các phương thức liên quan sẽ được triển khai ở đây.

        // 1. Lấy thông tin đơn hàng theo Id
        public async Task<Order?> GetByIdAsync(int id)
        {
            return await _context.Orders
                .Include(o => o.OrderItems) // nếu bạn có navigation
                .FirstOrDefaultAsync(o => o.Id == id);
        }

        public Task<Order?> GetForDisplayAsync(int id) => _context.Orders
            .Include(o => o.Customer).Include(o => o.User).Include(o => o.Promotion)
            .FirstOrDefaultAsync(o => o.Id == id);

        public Task<bool> IsPosOrderAsync(int orderId) => _context.Orders
            .AnyAsync(o => o.Id == orderId && o.OrderType == "pos");

        public Task<Order?> GetStatusSnapshotAsync(int orderId) => _context.Orders
            .AsNoTracking().FirstOrDefaultAsync(o => o.Id == orderId);

        public Task<List<Order>> GetAllOnlineOrdersAsync()
        {
            return _context.Orders.AsNoTracking()
                .Include(o => o.Customer).Include(o => o.Promotion)
                .Include(o => o.OrderItems).ThenInclude(oi => oi.Product)
                .Where(o => o.OrderType == "mobile")
                .OrderByDescending(o => o.CreatedAt).ThenByDescending(o => o.Id)
                .ToListAsync();
        }

        public async Task<bool> ConfirmOnlineOrderAsync(int orderId, int userId)
        {
            var updated = await _context.Orders
                .Where(o => o.Id == orderId && o.Status == "pending" && o.OrderType == "mobile" && o.CheckoutKey == null)
                .ExecuteUpdateAsync(u => u
                    .SetProperty(o => o.Status, "processing")
                    .SetProperty(o => o.UserId, (int?)userId)
                    .SetProperty(o => o.UpdatedAt, DateTime.UtcNow));
            return updated == 1;
        }

        public async Task<bool> RejectOnlineOrderAsync(int orderId, string? reason)
        {
            var order = await _context.Orders.Include(o => o.OrderItems)
                .FirstOrDefaultAsync(o => o.Id == orderId);
            if (order == null || order.OrderType != "mobile" || order.CheckoutKey != null ||
                (order.Status != "pending" && order.Status != "processing")) return false;

            await using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var now = DateTime.UtcNow;
                order.Status = "cancelled";
                order.Note = string.IsNullOrWhiteSpace(reason) ? order.Note :
                    (string.IsNullOrWhiteSpace(order.Note) ? $"Từ chối: {reason}" : $"{order.Note} | Từ chối: {reason}");
                order.UpdatedAt = now;
                var productIds = order.OrderItems.Select(i => i.ProductId).Distinct().ToList();
                var products = await _context.Products.Where(i => productIds.Contains(i.Id)).ToListAsync();
                foreach (var item in order.OrderItems)
                {
                    var product = products.FirstOrDefault(i => i.Id == item.ProductId);
                    if (product != null) { product.StockQuantity += item.Quantity; product.UpdatedAt = now; }
                }
                await _context.SaveChangesAsync();
                await transaction.CommitAsync();
                return true;
            }
            catch { await transaction.RollbackAsync(); throw; }
        }

        public async Task<bool> DeliverOnlineOrderAsync(int orderId, int userId)
        {
            var order = await _context.Orders.Include(o => o.Customer)
                .FirstOrDefaultAsync(o => o.Id == orderId && o.Status == "processing" && o.OrderType == "mobile" && o.CheckoutKey == null);
            if (order == null) return false;
            if (order.PaymentMethod != "cash" && order.PaymentStatus != "paid")
                throw new InvalidOperationException("Chờ xác nhận thanh toán trước khi hoàn tất giao hàng.");
            var now = DateTime.UtcNow;
            order.Status = "completed"; order.PaymentStatus = "paid"; order.UserId = userId; order.UpdatedAt = now;
            if (order.CustomerId.HasValue)
            {
                var customer = await _context.Customers.FindAsync(order.CustomerId.Value);
                if (customer != null)
                {
                    var points = (int)(order.TotalAmount / 10000m);
                    customer.RewardPoints += points; customer.UpdatedAt = now;
                }
            }
            await _context.SaveChangesAsync();
            return true;
        }

        public async Task<bool> MarkOrderRefundedAsync(int orderId)
        {
            var order = await _context.Orders.FirstOrDefaultAsync(o => o.Id == orderId);
            if (order == null || order.PaymentStatus != "paid" || order.Status == "cancelled") return false;
            order.Status = "refunded"; order.PaymentStatus = "refunded"; order.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            return true;
        }

        public async Task<List<OnlineOrderItemDTO>> GetOrderItemsAsync(int orderId)
        {
            return await _context.OrderItems.Include(oi => oi.Product).Where(oi => oi.OrderId == orderId)
                .Select(oi => new OnlineOrderItemDTO
                {
                    Id = oi.Id, ProductId = oi.ProductId, ProductName = oi.Product != null ? oi.Product.ProductName : "",
                    Sku = oi.Product != null ? oi.Product.Sku : null, ImageUrl = oi.Product != null ? oi.Product.ImageUrl : null,
                    Quantity = oi.Quantity, UnitPrice = oi.UnitPrice, TotalPrice = oi.TotalPrice
                }).ToListAsync();
        }

        // 2. Cập nhật trạng thái đơn hàng (VD: pending → paid → completed)
        public async Task UpdateOrderStatusAsync(int orderId, string newStatus)
        {
            var order = await _context.Orders.FindAsync(orderId);
            if (order != null)
            {
                order.Status = newStatus;
                order.UpdatedAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();
            }
        }

        public async Task UpdateOrderPaymentAsync(int orderId, string paymentStatus, string? newOrderStatus = null)
        {
            var order = await _context.Orders.FindAsync(orderId);
            if (order != null)
            {
                order.PaymentStatus = paymentStatus;
                if (!string.IsNullOrEmpty(newOrderStatus))
                    order.Status = newOrderStatus;
                order.UpdatedAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();
            }
        }

        //3. Lấy max Id hiện tại trong bảng Orders => nếu chưa có đơn hàng nào thì trả về 0
        public async Task<int> GetMaxIdAsync()
        {
            return await _context.Orders.AnyAsync() ? await _context.Orders.MaxAsync(o => o.Id) : 0;
        }

        /*
            4. Tạo đơn hàng mới 

        */
        public async Task<Order> CreateOrderAsync(Order order)
        {
            _context.Orders.Add(order);
            await _context.SaveChangesAsync();
            return order;
        }

        public Task<List<OrderDTO>> GetAllForCacheAsync()
        {
            return _context.Orders.AsNoTracking()
                .Include(o => o.Customer).Include(o => o.User).Include(o => o.Promotion)
                .OrderByDescending(o => o.CreatedAt).ThenByDescending(o => o.Id)
                .Select(o => new OrderDTO
                {
                    Id = o.Id, OrderNumber = o.OrderNumber, CustomerId = o.CustomerId, UserId = o.UserId,
                    Status = o.Status, OrderType = o.OrderType, IsPosCheckout = o.CheckoutKey != null,
                    PaymentStatus = o.PaymentStatus, PaymentMethod = o.PaymentMethod, Subtotal = o.Subtotal,
                    Discount = o.Discount, TotalAmount = o.TotalAmount, PromotionId = o.PromotionId,
                    Note = o.Note, RecipientName = o.RecipientName, RecipientPhone = o.RecipientPhone,
                    ShippingAddress = o.ShippingAddress, CreatedAt = o.CreatedAt, UpdatedAt = o.UpdatedAt,
                    CustomerName = o.Customer != null ? o.Customer.FullName : null,
                    UserName = o.User != null ? o.User.FullName : null,
                    PromotionCode = o.Promotion != null ? o.Promotion.Code : null
                }).ToListAsync();
        }

        public async Task<(List<OrderDTO> Items, int TotalItems)> GetPagedOrdersAsync(
            int pageNumber, int pageSize, string? status, DateTime? startDate,
            DateTime? endDate, string? search, string? orderType)
        {
            IQueryable<Order> query = _context.Orders.AsNoTracking()
                .Include(order => order.Customer)
                .Include(order => order.User)
                .Include(order => order.Promotion);

            if (!string.IsNullOrWhiteSpace(status))
                query = query.Where(order => order.Status == status);
            if (!string.IsNullOrWhiteSpace(orderType))
                query = query.Where(order => order.OrderType == orderType);
            if (startDate.HasValue)
                query = query.Where(order => order.CreatedAt >= startDate.Value.Date);
            if (endDate.HasValue)
            {
                var endExclusive = endDate.Value.Date.AddDays(1);
                query = query.Where(order => order.CreatedAt < endExclusive);
            }
            if (!string.IsNullOrWhiteSpace(search))
            {
                var keyword = search.Trim();
                query = query.Where(order => order.OrderNumber.Contains(keyword) ||
                    (order.Customer != null && order.Customer.FullName.Contains(keyword)) ||
                    (order.User != null && order.User.FullName.Contains(keyword)));
            }

            var totalItems = await query.CountAsync();
            var items = await query
                .OrderByDescending(order => order.CreatedAt)
                .ThenByDescending(order => order.Id)
                .Skip((pageNumber - 1) * pageSize)
                .Take(pageSize)
                .Select(order => new OrderDTO
                {
                    Id = order.Id,
                    OrderNumber = order.OrderNumber,
                    CustomerId = order.CustomerId,
                    UserId = order.UserId,
                    Status = order.Status,
                    OrderType = order.OrderType,
                    IsPosCheckout = order.CheckoutKey != null,
                    PaymentStatus = order.PaymentStatus,
                    PaymentMethod = order.PaymentMethod,
                    Subtotal = order.Subtotal,
                    Discount = order.Discount,
                    TotalAmount = order.TotalAmount,
                    PromotionId = order.PromotionId,
                    Note = order.Note,
                    RecipientName = order.RecipientName,
                    RecipientPhone = order.RecipientPhone,
                    ShippingAddress = order.ShippingAddress,
                    CreatedAt = order.CreatedAt,
                    UpdatedAt = order.UpdatedAt,
                    CustomerName = order.Customer != null ? order.Customer.FullName : null,
                    UserName = order.User != null ? order.User.FullName : null,
                    PromotionCode = order.Promotion != null ? order.Promotion.Code : null
                }).ToListAsync();

            return (items, totalItems);
        }


        /// <summary>
        /// Cập nhật user xử lý đơn hàng theo user_id bạn truyền vào.
        /// </summary>
        public async Task<bool> UpdateOrderUserAsync(int orderId, int? newUserId)
        {
            var order = await _context.Orders.FirstOrDefaultAsync(o => o.Id == orderId);
            if (order == null)
                return false;

            order.UserId = newUserId;
            order.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            return true;
        }

        // HỦY ĐƠN
        public async Task<bool> CancelOrderAsync(int orderId)
        {
            // Lấy Order + Items + Payment (nếu cần) bằng Include
            var order = await _context.Orders
                .Include(o => o.OrderItems)
                .FirstOrDefaultAsync(o => o.Id == orderId);

            if (order == null)
                return false;

            if (!order.Status.Equals("pending", StringComparison.OrdinalIgnoreCase))
                return false;

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var now = DateTime.UtcNow;

                // Hủy đơn
                order.Status = "cancelled";
                order.UpdatedAt = now;

                // Lấy danh sách productId cần update để giảm truy vấn
                var productIds = order.OrderItems.Select(i => i.ProductId).ToList();

                var products = await _context.Products
                    .Where(i => productIds.Contains(i.Id))
                    .ToListAsync();

                // Update tồn kho
                foreach (var item in order.OrderItems)
                {
                    var product = products.FirstOrDefault(i => i.Id == item.ProductId);
                    if (product != null)
                    {
                        product.StockQuantity += item.Quantity;
                        product.UpdatedAt = now;
                    }
                }

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();
                return true;
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        }

        public async Task<bool> CompletePendingOrderAsync(int orderId, int userId)
        {
            var now = DateTime.UtcNow;
            var updated = await _context.Orders
                .Where(order => order.Id == orderId && order.Status == "pending")
                .ExecuteUpdateAsync(update => update
                    .SetProperty(order => order.Status, "completed")
                    .SetProperty(order => order.UserId, (int?)userId)
                    .SetProperty(order => order.UpdatedAt, now));

            return updated == 1;
        }



    }
}
