using backend.Data;
using backend.DTO;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Repository
{
    public class OrderItemRepository
    {
        private readonly AppDbContext _context;

        public OrderItemRepository(AppDbContext context)
        {
            _context = context;
        }

        public Task<bool> ContainsLockedPosOrderAsync(IEnumerable<int> orderIds)
        {
            var ids = orderIds.Distinct().ToList();
            if (ids.Count == 0)
                return Task.FromResult(false);

            return _context.Orders.AnyAsync(o => ids.Contains(o.Id) && o.CheckoutKey != null);
        }

        public Task<bool> IsLockedPosOrderAsync(int orderId)
        {
            return _context.Orders.AnyAsync(o => o.Id == orderId && o.CheckoutKey != null);
        }

        // Lưu nhiều OrderItem
        public async Task<List<OrderItem>> AddOrderItemsAsync(List<OrderItem> items)
        {
            _context.OrderItems.AddRange(items);
            await _context.SaveChangesAsync();
            return items;
        }

        // Lấy danh sách OrderItem theo OrderId
        public async Task<List<OrderItem>> GetByOrderIdAsync(int orderId)
        {
            return await _context.OrderItems
                .Include(i => i.Product)
                .Where(i => i.OrderId == orderId)
                .ToListAsync();
        }

        // Xóa OrderItem theo OrderId (nếu cần)
        public async Task DeleteByOrderIdAsync(int orderId)
        {
            var items = await _context.OrderItems.Where(i => i.OrderId == orderId).ToListAsync();
            if (items.Any())
            {
                _context.OrderItems.RemoveRange(items);
                await _context.SaveChangesAsync();
            }
        }

          public async Task<List<OrderItemReponse>> GetByOrderIdAsyncVer2(int orderId)
        {
            return await _context.OrderItems
                .Where(x => x.OrderId == orderId)
                .Include(x => x.Product)
                .Select(x => new OrderItemReponse
                {
                    id = x.Id,
                    product = x.Product != null ? x.Product.ProductName : "N/A",
                    qty = x.Quantity,
                    price = (int)x.UnitPrice,
                    total = (int)x.TotalPrice
                })
                .ToListAsync();
        }


    }
}
