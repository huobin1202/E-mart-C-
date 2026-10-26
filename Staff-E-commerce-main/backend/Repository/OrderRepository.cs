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


        public Task<Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction> BeginSalesTransactionAsync() => SalesTransaction.BeginAsync(_context);
        public Task<bool> HasPermissionAsync(int userId, string code) => _context.Users.AnyAsync(u => u.Id == userId &&
            u.RoleEntity.RolePermissions.Any(p => p.Permission.Code == code));
        public Task<Order?> GetForSettlementAsync(int orderId) => _context.Orders.Include(o => o.Customer).Include(o => o.Payments)
            .FirstOrDefaultAsync(o => o.Id == orderId);
        public Task SaveChangesAsync() => _context.SaveChangesAsync();
        public Task<bool> TransactionExistsAsync(string reference, int? exceptPaymentId = null) => _context.Payments
            .AnyAsync(p => p.TransactionRef == reference && p.Status == "completed" && p.Id != exceptPaymentId);

        public async Task<bool> ConfirmOnlineOrderAsync(int orderId, int userId)
        {
            var order = await _context.Orders.FirstOrDefaultAsync(o => o.Id == orderId && o.OrderType == "mobile");
            if (order == null || order.Status is not ("pending" or "processing")) return false;
            if (order.Status == "processing") return true;
            order.Status = "processing"; order.UserId = userId; order.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync(); return true;
        }

        // Caller holds the shared sales transaction through invoice synchronization.
        public async Task<bool> RejectOnlineOrderAsync(int orderId, string? reason, int? userId = null)
        {
            var order = await _context.Orders.Include(o => o.OrderItems).Include(o => o.Customer)
                .FirstOrDefaultAsync(o => o.Id == orderId && o.OrderType == "mobile");
            if (order == null) return false;
            if (order.Status == "cancelled") return true;
            if (order.Status is not ("pending" or "processing")) return false;
            var now = DateTime.UtcNow;
            foreach (var item in order.OrderItems)
            {
                var count = await _context.Inventory.Where(i => i.ProductId == item.ProductId).ExecuteUpdateAsync(u => u
                    .SetProperty(i => i.Quantity, i => i.Quantity + item.Quantity).SetProperty(i => i.UpdatedAt, now));
                if (count != 1) throw new InvalidOperationException("Không thể hoàn tồn kho của đơn hàng.");
                _context.InventoryAdjustments.Add(new InventoryAdjustment { ProductId = item.ProductId, ChangeAmount = item.Quantity,
                    Reason = $"Hủy {order.OrderNumber}", UserId = userId, CreatedAt = now });
            }
            if (order.Customer != null) { order.Customer.RewardPoints += order.PointsUsed; order.Customer.UpdatedAt = now; }
            var redemptions = await _context.PromotionRedemptions.Include(r => r.Promotion).Where(r => r.OrderId == orderId).ToListAsync();
            foreach (var group in redemptions.GroupBy(r => r.PromotionId))
                if (group.First().Promotion is { } promotion) promotion.UsedCount = Math.Max(0, promotion.UsedCount - 1);
            _context.PromotionRedemptions.RemoveRange(redemptions);
            order.Status = "cancelled"; order.UpdatedAt = now;
            if (!string.IsNullOrWhiteSpace(reason)) order.Note = string.IsNullOrWhiteSpace(order.Note) ? $"Từ chối: {reason}" : $"{order.Note} | Từ chối: {reason}";
            // A paid cancellation stays paid until an actual refund is confirmed.
            await _context.SaveChangesAsync(); return true;
        }

        public async Task<bool> DeliverOnlineOrderAsync(int orderId, int userId)
        {
            var order = await _context.Orders.Include(o => o.Customer).Include(o => o.Payments)
                .FirstOrDefaultAsync(o => o.Id == orderId && o.OrderType == "mobile");
            if (order == null) return false;
            if (order.Status == "completed" && order.PaymentStatus == "paid") return true;
            if (order.Status != "processing") return false;
            if (order.PaymentMethod != "cash" && order.PaymentStatus != "paid")
                throw new InvalidOperationException("Chờ xác nhận thanh toán trước khi hoàn tất giao hàng.");
            var now = DateTime.UtcNow;
            if (order.PaymentMethod == "cash" && order.PaymentStatus != "paid")
                order.Payments.Add(new Payment { Amount = order.TotalAmount, Method = "cash", Status = "completed", TransactionRef = $"COD-{order.Id}", CreatedAt = now });
            order.Status = "completed"; order.PaymentStatus = "paid"; order.UserId = userId; order.UpdatedAt = now;
            order.PointsEarned = order.CustomerId.HasValue ? (int)decimal.Floor(order.TotalAmount / 10000m) : 0;
            if (order.Customer != null) { order.Customer.RewardPoints += order.PointsEarned; order.Customer.UpdatedAt = now; }
            await _context.SaveChangesAsync(); return true;
        }

        public async Task<bool> MarkOrderRefundedAsync(int orderId, decimal amount, string reference)
        {
            if (string.IsNullOrWhiteSpace(reference) || reference.Trim().Length > 200) throw new ArgumentException("Nhập mã giao dịch hoàn tiền.");
            reference = "REFUND-" + reference.Trim();
            var order = await _context.Orders.Include(o => o.Customer).Include(o => o.Payments).FirstOrDefaultAsync(o => o.Id == orderId);
            if (order == null) return false;
            if (amount != order.TotalAmount) throw new ArgumentException("Số tiền hoàn phải khớp đơn hàng.");
            if (order.PaymentStatus == "refunded") return order.Payments.Any(p => p.Status == "refunded" && p.TransactionRef == reference);
            if (order.PaymentStatus != "paid") return false;
            if (await _context.Payments.AnyAsync(p => p.TransactionRef == reference)) throw new InvalidOperationException("Mã hoàn tiền đã được sử dụng.");
            if (order.Status is "pending" or "processing") throw new InvalidOperationException("Hủy đơn chưa giao trước khi xác nhận hoàn tiền.");
            if (order.Customer != null && order.Status != "cancelled")
            { order.Customer.RewardPoints += order.PointsUsed - order.PointsEarned; order.Customer.UpdatedAt = DateTime.UtcNow; }
            if (order.Status != "cancelled") order.Status = "refunded";
            order.PaymentStatus = "refunded"; order.UpdatedAt = DateTime.UtcNow;
            order.Payments.Add(new Payment { Amount = amount, Method = order.PaymentMethod == "e_wallet" ? "other" : order.PaymentMethod ?? "cash",
                Status = "refunded", TransactionRef = reference, CreatedAt = DateTime.UtcNow });
            await _context.SaveChangesAsync(); return true;
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
                    Status = o.Status, OrderType = o.OrderType, IsPosCheckout = o.OrderType == "pos" && o.CheckoutKey != null,
                    PaymentStatus = o.PaymentStatus, PaymentMethod = o.PaymentMethod, Subtotal = o.Subtotal,
                    Discount = o.Discount, TotalAmount = o.TotalAmount, PromotionId = o.PromotionId,
                    Note = o.Note, RecipientName = o.RecipientName, RecipientPhone = o.RecipientPhone,
                    ShippingAddress = o.ShippingAddress, CreatedAt = o.CreatedAt, UpdatedAt = o.UpdatedAt,
                    CustomerName = o.Customer != null ? o.Customer.FullName : null,
                    UserName = o.User != null ? o.User.FullName : null,
                    PromotionCode = o.Promotion != null ? o.Promotion.Code : null
                }).ToListAsync();
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

                var inventories = await _context.Inventory
                    .Where(i => productIds.Contains(i.ProductId))
                    .ToListAsync();

                // Update tồn kho
                foreach (var item in order.OrderItems)
                {
                    var inv = inventories.FirstOrDefault(i => i.ProductId == item.ProductId);
                    if (inv != null)
                    {
                        inv.Quantity += item.Quantity;
                        inv.UpdatedAt = now;
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
