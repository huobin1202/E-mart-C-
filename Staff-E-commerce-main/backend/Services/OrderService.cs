using backend.Models;
using backend.Repository;
using backend.DTO;
using backend.Helpers;
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
        private readonly InvoiceService _invoiceService;
        private readonly PosCheckoutService _checkout;
        private readonly BusMemoryCache<OrderDTO> _orderCache;
        private readonly BusMemoryCache<OnlineOrderDTO> _onlineOrderCache;
        private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(15);

        public OrderService(
            OrderRepository orderRepo,
            ActivityLogService logService,
            UserRepository userRepo,
            CustomerRepository customerRepo,
            IHttpContextAccessor httpContextAccessor,
            InvoiceService invoiceService, PosCheckoutService checkout,
            BusMemoryCache<OrderDTO> orderCache,
            BusMemoryCache<OnlineOrderDTO> onlineOrderCache)
        {
            _orderRepo = orderRepo;
            _logService = logService;
            _customerRepo = customerRepo;
            _userRepo = userRepo;
            _httpContextAccessor = httpContextAccessor;
            _invoiceService = invoiceService;
            _checkout = checkout;
            _orderCache = orderCache;
            _onlineOrderCache = onlineOrderCache;
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







        // Chuyển Order sang OrderDTO đầy đủ
        public async Task<OrderDTO> MapToDTOAsync(int orderId)
        {
            var order = await _orderRepo.GetForDisplayAsync(orderId);
            if (order == null) throw new Exception("Không tìm thấy đơn hàng");

            var delivery = OrderDeliveryDetails.FromOrder(order);

            return new OrderDTO
            {
                Id = order.Id,
                OrderNumber = order.OrderNumber,
                CustomerId = order.CustomerId ?? 0,
                UserId = order.UserId,
                Status = order.Status,
                OrderType = order.OrderType,
                PaymentStatus = order.PaymentStatus,
                PaymentMethod = order.PaymentMethod,
                IsPosCheckout = order.OrderType == "pos" && order.CheckoutKey != null,
                Subtotal = order.Subtotal,
                Discount = order.Discount,
                TotalAmount = order.TotalAmount,
                PromotionId = order.PromotionId,
                Note = delivery.Note,
                RecipientName = delivery.Name,
                RecipientPhone = delivery.Phone,
                ShippingAddress = delivery.Address,
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
            string? search,
            string? orderType = null
        )
        {
            var cached = await _orderCache.GetOrCreateAsync(
                () => _orderRepo.GetAllForCacheAsync(), CacheTtl);
            IEnumerable<OrderDTO> filtered = cached.Items;
            if (!string.IsNullOrWhiteSpace(status)) filtered = filtered.Where(o => o.Status == status);
            if (!string.IsNullOrWhiteSpace(orderType)) filtered = filtered.Where(o => o.OrderType == orderType);
            if (startDate.HasValue) filtered = filtered.Where(o => o.CreatedAt >= startDate.Value.Date);
            if (endDate.HasValue) filtered = filtered.Where(o => o.CreatedAt <= endDate.Value.Date.AddDays(1).AddTicks(-1));
            if (!string.IsNullOrWhiteSpace(search))
            {
                var keyword = search.Trim();
                filtered = filtered.Where(o =>
                    (o.OrderNumber?.Contains(keyword, StringComparison.OrdinalIgnoreCase) ?? false) ||
                    (o.CustomerName?.Contains(keyword, StringComparison.OrdinalIgnoreCase) ?? false) ||
                    (o.UserName?.Contains(keyword, StringComparison.OrdinalIgnoreCase) ?? false));
            }
            var allItems = filtered.ToList();
            var totalItems = allItems.Count;
            var data = allItems.Skip((pageNumber - 1) * pageSize).Take(pageSize).ToList();

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
            if (await _orderRepo.IsPosOrderAsync(orderId))
                return await _checkout.CancelAsync(orderId);
            return await RejectOnlineOrderAsync(orderId, null);
        }

        public Task<bool> CompletePendingOrderAsync(int orderId) => RunLifecycleAsync(orderId, async () =>
        {
            var order = await _orderRepo.GetStatusSnapshotAsync(orderId);
            if (order?.OrderType != "pos") throw new InvalidOperationException("Đơn online phải hoàn tất qua nghiệp vụ giao hàng.");
            if (order?.CheckoutKey != null)
                throw new InvalidOperationException("Đơn POS phải được xác nhận thanh toán theo đúng phương thức.");
            if (order?.PaymentStatus != "paid") throw new InvalidOperationException("Chưa có xác nhận thu đủ tiền cho đơn hàng.");
            var currentUserId = GetCurrentUserId();
            return await _orderRepo.CompletePendingOrderAsync(orderId, currentUserId);
        });

        // ===== ONLINE ORDER MANAGEMENT =====

        internal async Task<List<OnlineOrderDTO>> LoadOnlineCacheAsync()
        {
                var orders = await _orderRepo.GetAllOnlineOrdersAsync();
                return orders.Select(o =>
                {
                    var delivery = OrderDeliveryDetails.FromOrder(o);
                    return new OnlineOrderDTO
                    {
                        Id = o.Id, OrderNumber = o.OrderNumber, CustomerId = o.CustomerId,
                        CustomerName = delivery.Name ?? o.Customer?.FullName,
                        CustomerPhone = delivery.Phone ?? o.Customer?.Phone,
                        CustomerAddress = delivery.Address ?? o.Customer?.Address,
                        RecipientName = delivery.Name, RecipientPhone = delivery.Phone,
                        ShippingAddress = delivery.Address, Status = o.Status, OrderType = o.OrderType,
                        Subtotal = o.Subtotal, Discount = o.Discount, TotalAmount = o.TotalAmount,
                        PaymentMethod = o.PaymentMethod, PaymentStatus = o.PaymentStatus,
                        Note = delivery.Note, PromotionCode = o.Promotion?.Code,
                        CreatedAt = o.CreatedAt, UpdatedAt = o.UpdatedAt,
                        Items = o.OrderItems.Select(oi => new OnlineOrderItemDTO
                        {
                            Id = oi.Id, ProductId = oi.ProductId,
                            ProductName = oi.Product?.ProductName ?? "", Sku = oi.Product?.Sku,
                            ImageUrl = oi.Product?.ImageUrl, Quantity = oi.Quantity,
                            UnitPrice = oi.UnitPrice, TotalPrice = oi.TotalPrice
                        }).ToList()
                    };
                }).ToList();
        }

        public async Task<PagedResult<OnlineOrderDTO>> GetOnlineOrdersAsync(
            int pageNumber, int pageSize, string? status, string? search, int? orderId = null)
        {
            var (cachedOrders, _) = await _onlineOrderCache.GetOrCreateAsync(async () =>
            {
                return await LoadOnlineCacheAsync();
            }, CacheTtl);

            IEnumerable<OnlineOrderDTO> filtered = cachedOrders;
            if (orderId.HasValue) filtered = filtered.Where(order => order.Id == orderId.Value);
            if (!string.IsNullOrWhiteSpace(status)) filtered = filtered.Where(order => order.Status == status);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var keyword = search.Trim();
                filtered = filtered.Where(order => order.OrderNumber.Contains(keyword, StringComparison.OrdinalIgnoreCase) ||
                    (order.CustomerName?.Contains(keyword, StringComparison.OrdinalIgnoreCase) ?? false) ||
                    (order.CustomerPhone?.Contains(keyword, StringComparison.OrdinalIgnoreCase) ?? false));
            }
            var filteredList = filtered.ToList();
            var totalItems = filteredList.Count;
            var dtos = filteredList.Skip((pageNumber - 1) * pageSize).Take(pageSize).ToList();

            return new PagedResult<OnlineOrderDTO>
            {
                Items = dtos,
                TotalItems = totalItems,
                PageNumber = pageNumber,
                PageSize = pageSize,
                TotalPages = (int)Math.Ceiling(totalItems / (double)pageSize)
            };
        }

        /// <summary>Xác nhận đơn: pending -> processing</summary>
        public async Task<bool> ConfirmOnlineOrderAsync(int orderId)
        {
            return await RunLifecycleAsync(orderId, () => _orderRepo.ConfirmOnlineOrderAsync(orderId, GetCurrentUserId()));
        }

        public Task<bool> RejectOnlineOrderAsync(int orderId, string? reason) =>
            RunLifecycleAsync(orderId, () => _orderRepo.RejectOnlineOrderAsync(orderId, reason, GetCurrentUserId()));

        public Task<bool> CancelCustomerOrderAsync(int orderId, int customerId) => RunLifecycleAsync(orderId, async () => {
            var order = await _orderRepo.GetStatusSnapshotAsync(orderId);
            if (order?.CustomerId != customerId || order.PaymentStatus == "paid") return false;
            return await _orderRepo.RejectOnlineOrderAsync(orderId, "Khách hàng yêu cầu hủy", GetCurrentUserId());
        });

        public Task<bool> DeliverOnlineOrderAsync(int orderId) => RunLifecycleAsync(orderId, async () => {
            var order = await _orderRepo.GetStatusSnapshotAsync(orderId);
            if (order?.PaymentMethod == "cash" && order.PaymentStatus != "paid" &&
                !await _orderRepo.HasPermissionAsync(GetCurrentUserId(), "payments.write"))
                throw new UnauthorizedAccessException("Bạn không có quyền xác nhận thu tiền COD.");
            return await _orderRepo.DeliverOnlineOrderAsync(orderId, GetCurrentUserId());
        });

        public Task<bool> MarkOrderRefundedAsync(int orderId, decimal amount, string reference) =>
            RunLifecycleAsync(orderId, () => _orderRepo.MarkOrderRefundedAsync(orderId, amount, reference));

        private async Task<bool> RunLifecycleAsync(int orderId, Func<Task<bool>> action)
        {
            await using var transaction = await _orderRepo.BeginSalesTransactionAsync();
            var result = await action();
            if (result) await _invoiceService.SyncOrderLifecycleAsync(orderId);
            await transaction.CommitAsync();
            return result;
        }

        /// <summary>Lấy danh sách items của đơn hàng</summary>
        public async Task<List<OnlineOrderItemDTO>> GetOrderItemsAsync(int orderId)
        {
            return await _orderRepo.GetOrderItemsAsync(orderId);
        }
    }  // end class OrderService

    public class PagedResult<T>
    {
        public List<T> Items { get; set; } = new();
        public int TotalItems { get; set; }
        public int PageNumber { get; set; }
        public int PageSize { get; set; }
        public int TotalPages { get; set; }
    }

}
