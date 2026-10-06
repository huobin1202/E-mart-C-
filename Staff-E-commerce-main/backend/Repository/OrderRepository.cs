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

        /*Tìm kiếm kết hợp phân trang*/

        public async Task<(List<OrderDTO> Data, int TotalItems)> SearchPagingAsync(
            int pageNumber,
            int pageSize,
            string? status,
            DateTime? startDate,
            DateTime? endDate,
            string? search
        )
        {
            var query = _context.Orders
                .Include(o => o.Customer)
                .Include(o => o.User)
                .Include(o => o.Promotion)
                .AsQueryable();

            // === LỌC TRẠNG THÁI ===
            if (!string.IsNullOrEmpty(status))
                query = query.Where(o => o.Status == status);

            // === LỌC TỪ NGÀY ===
            if (startDate.HasValue)
            {
                var start = startDate.Value.Date; // 00:00:00
                query = query.Where(o => o.CreatedAt >= start);
            }

            // === LỌC ĐẾN NGÀY ===
            if (endDate.HasValue)
            {
                var end = endDate.Value.Date.AddDays(1).AddTicks(-1); // 23:59:59.9999999
                query = query.Where(o => o.CreatedAt <= end);
            }

            // === TÌM KIẾM THEO TÊN ===
            if (!string.IsNullOrEmpty(search))
            {
                string keyword = $"%{search}%";

                query = query.Where(o =>
                    (o.Customer != null && EF.Functions.Like(o.Customer.FullName, keyword)) ||
                    (o.User != null && EF.Functions.Like(o.User.FullName, keyword))
                );
            }

            // === ĐẾM TỔNG ===
            int totalItems = await query.CountAsync();

            // === TRẢ VỀ DATA THEO TRANG ===
            var data = await query
                .OrderByDescending(o => o.CreatedAt)
                .ThenByDescending(o => o.Id)

                .Skip((pageNumber - 1) * pageSize)
                .Take(pageSize)
                .Select(o => new OrderDTO
                {
                    Id = o.Id,
                    OrderNumber = o.OrderNumber,
                    CustomerId = o.CustomerId,
                    UserId = o.UserId,
                    Status = o.Status,
                    Subtotal = o.Subtotal,
                    Discount = o.Discount,
                    TotalAmount = o.TotalAmount,
                    PromotionId = o.PromotionId,
                    Note = o.Note,
                    CreatedAt = o.CreatedAt,
                    UpdatedAt = o.UpdatedAt,
                    CustomerName = o.Customer != null ? o.Customer.FullName : null,
                    UserName = o.User != null ? o.User.FullName : null,
                    PromotionCode = o.Promotion != null ? o.Promotion.Code : null
                })
                .ToListAsync();

            return (data, totalItems);
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
