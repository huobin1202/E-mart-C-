using backend.Data;
using backend.DTO;
using backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using System.Data;

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

        public Task<IDbContextTransaction> BeginSerializableTransactionAsync() =>
            _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);

        public Task LockOrderAsync(int orderId)
        {
            var resource = $"order-lifecycle-{orderId}";
            return _context.Database.ExecuteSqlInterpolatedAsync($"""
                DECLARE @result INT;
                EXEC @result = sys.sp_getapplock @Resource = {resource}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
                IF @result < 0 THROW 51000, 'Order is busy. Please retry.', 1;
                """);
        }

        public Task<Order?> GetOnlineOrderForLifecycleAsync(int orderId) => _context.Orders
            .Include(order => order.OrderItems)
            .Include(order => order.Customer)
            .Include(order => order.Payments)
            .FirstOrDefaultAsync(order => order.Id == orderId && order.OrderType == "mobile");

        public Task<Order?> GetOrderForLifecycleAsync(int orderId) => _context.Orders
            .Include(order => order.OrderItems)
            .Include(order => order.Customer)
            .Include(order => order.Payments)
            .FirstOrDefaultAsync(order => order.Id == orderId);

        public Task<List<PromotionRedemption>> GetPromotionRedemptionsAsync(int orderId) =>
            _context.PromotionRedemptions.Include(redemption => redemption.Promotion)
                .Where(redemption => redemption.OrderId == orderId).ToListAsync();

        public void RemovePromotionRedemptions(IEnumerable<PromotionRedemption> redemptions) =>
            _context.PromotionRedemptions.RemoveRange(redemptions);

        public void AddPayment(Payment payment) => _context.Payments.Add(payment);
        public void AddInventoryAdjustment(InventoryAdjustment adjustment) => _context.InventoryAdjustments.Add(adjustment);
        public Task SaveChangesAsync() => _context.SaveChangesAsync();

        public async Task<bool> RestoreStockAsync(int productId, int quantity, DateTime updatedAt)
        {
            var updated = await _context.Products.Where(product => product.Id == productId)
                .ExecuteUpdateAsync(update => update
                    .SetProperty(product => product.StockQuantity, product => product.StockQuantity + quantity)
                    .SetProperty(product => product.UpdatedAt, updatedAt));
            return updated == 1;
        }

        public Task<bool> TransactionReferenceExistsAsync(string reference) =>
            _context.Payments.AnyAsync(payment => payment.TransactionRef == reference);

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


    }
}
