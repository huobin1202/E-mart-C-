using backend.DTO;
using backend.Models;
using backend.Repository;

namespace backend.Services
{
    public class OrderItemService
    {
        private readonly OrderItemRepository _orderItemRepository;

        public OrderItemService(OrderItemRepository orderItemRepository)
        {
            _orderItemRepository = orderItemRepository;
        }

        // Lưu list OrderItem
        public async Task<bool> SaveOrderItemsAsync(List<OrderItem> items)
        {
            if (items == null || !items.Any())
                return false;
            var ids = items.Select(i => i.OrderId).ToList();
            if (await _orderItemRepository.ContainsLockedPosOrderAsync(ids))
                throw new ArgumentException("Không sửa dòng hàng của đơn POS đã chốt giỏ.");

            // Do not rely on the caller to provide a value compatible with the
            // legacy SQL Server DATETIME column.
            var now = DateTime.UtcNow;
            foreach (var item in items)
            {
                item.Id = 0;
                item.CreatedAt = now;
            }

            await _orderItemRepository.AddOrderItemsAsync(items);
            return true;
        }

        // Lấy theo OrderId
        public async Task<List<OrderItem>> GetByOrderIdAsync(int orderId)
        {
            return await _orderItemRepository.GetByOrderIdAsync(orderId);
        }

        // Xóa theo OrderId
        public async Task DeleteByOrderIdAsync(int orderId)
        {
            if (await _orderItemRepository.IsLockedPosOrderAsync(orderId))
                throw new ArgumentException("Không xóa dòng hàng của đơn POS đã chốt giỏ.");
            await _orderItemRepository.DeleteByOrderIdAsync(orderId);
        }

        public async Task<List<OrderItemReponse>> GetItemsByOrderAsync(int orderId)
        {
            return await _orderItemRepository.GetByOrderIdAsyncVer2(orderId);
        }
    }
}
