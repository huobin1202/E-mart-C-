using backend.Models;
using backend.Repository;
using backend.DTO;
using System;
using System.Threading.Tasks;
using System.Security.Claims;

namespace backend.Services
{
    public class OrderService
    {
        private readonly OrderRepository _orderRepo;
        private readonly ActivityLogService _logService;
        private readonly UserRepository _userRepo;
        private readonly CustomerRepository _customerRepo;

        private readonly IHttpContextAccessor _httpContextAccessor;

        public OrderService(
            OrderRepository orderRepo,
            ActivityLogService logService,
            UserRepository userRepo,
            CustomerRepository customerRepo,
            IHttpContextAccessor httpContextAccessor)
        {
            _orderRepo = orderRepo;
            _logService = logService;
            _customerRepo = customerRepo;
            _userRepo = userRepo;
            _httpContextAccessor = httpContextAccessor;
        }

        // Tự động lấy user_id
        private int GetCurrentUserId()
        {
            var context = _httpContextAccessor.HttpContext;

            // check claim JWT
            if (context?.User?.Identity?.IsAuthenticated == true)
            {
                var claim = context.User.FindFirst("uid")
                            ?? context.User.FindFirst("userId")
                            ?? context.User.FindFirst(ClaimTypes.NameIdentifier);

                if (claim != null && int.TryParse(claim.Value, out int id))
                    return id;
            }

            throw new InvalidOperationException("Không tìm thấy user_id trong token");
        }



        /*
            Phương thúc Tạo đơn hàng mới 
            Trả về object OrderDTO vừa tạo có 
                Id: Lấy max Id + 1
                OrderNumber: DH_Id_timestamp <Ví dụ: DH_5_1696543200>
                CustomerId: 0 => Mặc định là khách vãng lai
                UserId: Nhân viên đang tạo đơn hàng (Tạm thời để là 2 vì chưa biết ai đang làm đăng nhập . Tạm thời để đó)
                Status: pending
                Subtotal, Discount, TotalAmount: 0m
                PromotionId: null
                Note: null
                CreatedAt, UpdatedAt: thời gian hiện tại

        */
         public async Task<OrderDTO> CreateTemporaryOrderAsync()
        {
            
            string orderCode = Guid.NewGuid().ToString();

            // Lấy user_id thực tế
            int userId = GetCurrentUserId();
            var user = await _userRepo.GetByIdAsync(userId);
            string userName = user?.FullName ?? $"Nhân viên #{userId}";

           

            var tempOrder = new OrderDTO
            {
            
                OrderNumber = orderCode,
                CustomerId = null,
                UserId = userId,
                Status = "pending",
                Subtotal = 0m,
                Discount = 0m,
                TotalAmount = 0m,
                PromotionId = null,
                Note = null,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                CustomerName = null,
                UserName = userName,
                PromotionCode = null
            };

            return tempOrder;
        }



        // Lưu đơn hàng (frontend đã gửi đủ dữ liệu)
        public async Task<Order> SaveOrderAsync(Order order)
        {
            if (order.Subtotal < 0 || order.Discount < 0 || order.TotalAmount < 0)
                throw new ArgumentException("Các giá trị tiền không được âm.");

            if (!new[] { "pending", "processing", "completed", "cancelled" }
                .Contains(order.Status, StringComparer.OrdinalIgnoreCase))
            {
                throw new ArgumentException("Trạng thái đơn hàng không hợp lệ.");
            }

            order.Id = 0;
            order.UserId = GetCurrentUserId();
            order.OrderNumber = string.IsNullOrWhiteSpace(order.OrderNumber)
                ? $"DH-{Guid.NewGuid():N}"
                : order.OrderNumber.Trim();
            order.CreatedAt = DateTime.UtcNow;
            order.UpdatedAt = DateTime.UtcNow;
            return await _orderRepo.CreateOrderAsync(order);
        }



        // Chuyển Order sang OrderDTO đầy đủ
        public async Task<OrderDTO> MapToDTOAsync(int orderId)
        {
            var order = await _orderRepo.GetByIdAsync(orderId);
            if (order == null) throw new Exception("Không tìm thấy đơn hàng");

            return new OrderDTO
            {
                Id = order.Id,
                OrderNumber = order.OrderNumber,
                CustomerId = order.CustomerId ?? 0,
                UserId = order.UserId,
                Status = order.Status,
                Subtotal = order.Subtotal,
                Discount = order.Discount,
                TotalAmount = order.TotalAmount,
                PromotionId = order.PromotionId,
                Note = order.Note,
                CreatedAt = order.CreatedAt,
                UpdatedAt = order.UpdatedAt,
                CustomerName = order.Customer?.FullName,
                UserName = order.User?.FullName,
                PromotionCode = order.Promotion?.Code
            };
        }

        //Phân trang kết hợp tìm kiếm
        public async Task<PagedResult<OrderDTO>> GetPagedOrdersAsync(
            int pageNumber,
            int pageSize,
            string? status,
            DateTime? startDate,
            DateTime? endDate,
            string? search
        )
        {
            var (data, totalItems) = await _orderRepo.SearchPagingAsync(
                pageNumber, pageSize, status, startDate, endDate, search
            );

            return new PagedResult<OrderDTO>
            {
                Items = data,
                TotalItems = totalItems,
                PageNumber = pageNumber,
                PageSize = pageSize,
                TotalPages = (int)Math.Ceiling(totalItems / (double)pageSize)
            };
        }
        public async Task<bool> CancelOrderAsync(int orderId)
        {
            // 1. Lấy user hiện tại
            int currentUserId = GetCurrentUserId();

            // 2. Kiểm tra order tồn tại
            var order = await _orderRepo.GetByIdAsync(orderId);
            if (order == null)
                return false;

            // 3. Ghi lại ai là người hủy đơn
            await _orderRepo.UpdateOrderUserAsync(orderId, currentUserId);

            // 4. Tiến hành hủy đơn
            return await _orderRepo.CancelOrderAsync(orderId);
        }

        public async Task<bool> CompletePendingOrderAsync(int orderId)
        {
            var currentUserId = GetCurrentUserId();
            return await _orderRepo.CompletePendingOrderAsync(orderId, currentUserId);
        }




    }

    public class PagedResult<T>
    {
        public List<T> Items { get; set; } = new();
        public int TotalItems { get; set; }
        public int PageNumber { get; set; }
        public int PageSize { get; set; }
        public int TotalPages { get; set; }
    }

}
