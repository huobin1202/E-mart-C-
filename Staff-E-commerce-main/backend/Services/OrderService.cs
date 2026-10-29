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
        private readonly RealtimeNotificationService _realtime;

        public OrderService(
            OrderRepository orderRepo,
            ActivityLogService logService,
            UserRepository userRepo,
            CustomerRepository customerRepo,
            IHttpContextAccessor httpContextAccessor,
            InvoiceService invoiceService, PosCheckoutService checkout,
            RealtimeNotificationService realtime)
        {
            _orderRepo = orderRepo;
            _logService = logService;
            _customerRepo = customerRepo;
            _userRepo = userRepo;
            _httpContextAccessor = httpContextAccessor;
            _invoiceService = invoiceService;
            _checkout = checkout;
            _realtime = realtime;
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
                IsPosCheckout = order.CheckoutKey != null,
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
            pageNumber = Math.Max(pageNumber, 1);
            pageSize = Math.Clamp(pageSize, 1, 100);
            var (data, totalItems) = await _orderRepo.GetPagedOrdersAsync(
                pageNumber, pageSize, status, startDate, endDate, search, orderType);

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
            return await RejectOnlineOrderAsync(orderId, "Nhân viên hủy đơn");
        }

        public async Task<bool> CompletePendingOrderAsync(int orderId)
        {
            await using var transaction = await _orderRepo.BeginSerializableTransactionAsync();
            await _orderRepo.LockOrderAsync(orderId);
            var order = await _orderRepo.GetOrderForLifecycleAsync(orderId);
            if (order?.OrderType != "pos")
                throw new InvalidOperationException("Đơn online phải hoàn tất qua nghiệp vụ giao hàng.");
            if (order.CheckoutKey != null)
                throw new InvalidOperationException("Đơn POS phải được xác nhận thanh toán theo đúng phương thức.");
            if (order.PaymentStatus != "paid")
                throw new InvalidOperationException("Chưa có xác nhận thu đủ tiền cho đơn hàng.");
            if (order.Status == "completed") return true;
            if (order.Status != "pending") return false;
            order.Status = "completed";
            order.UserId = GetCurrentUserId();
            order.UpdatedAt = DateTime.UtcNow;
            await _orderRepo.SaveChangesAsync();
            await _invoiceService.SyncOrderLifecycleAsync(orderId);
            await transaction.CommitAsync();
            return true;
        }

        // ===== ONLINE ORDER MANAGEMENT =====

        public async Task<PagedResult<OnlineOrderDTO>> GetOnlineOrdersAsync(
            int pageNumber, int pageSize, string? status, string? search, int? orderId = null)
        {
            // Mobile checkouts can be committed by another API instance, so always
            // query SQL here instead of serving a process-local cache entry.
            var orders = await _orderRepo.GetAllOnlineOrdersAsync();
            var allOrders = orders.Select(o =>
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

            IEnumerable<OnlineOrderDTO> filtered = allOrders;
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
            await using var transaction = await _orderRepo.BeginSerializableTransactionAsync();
            await _orderRepo.LockOrderAsync(orderId);
            var order = await _orderRepo.GetOnlineOrderForLifecycleAsync(orderId);
            if (order == null || order.Status is not ("pending" or "processing")) return false;
            var updated = order.Status == "pending";
            if (updated)
            {
                order.Status = "processing";
                order.UserId = GetCurrentUserId();
                order.UpdatedAt = DateTime.UtcNow;
                await _orderRepo.SaveChangesAsync();
                await _invoiceService.SyncOrderLifecycleAsync(orderId);
            }
            await transaction.CommitAsync();
            if (updated)
            {
                await _realtime.BroadcastToWeb("OrderStatusChanged", new { orderId, status = "processing" });
            }
            return true;
        }

        /// <summary>Từ chối đơn: pending|processing -> cancelled (hoàn kho)</summary>
        public async Task<bool> RejectOnlineOrderAsync(int orderId, string? reason)
        {
            await using var transaction = await _orderRepo.BeginSerializableTransactionAsync();
            await _orderRepo.LockOrderAsync(orderId);
            var order = await _orderRepo.GetOnlineOrderForLifecycleAsync(orderId);
            if (order == null) return false;
            if (order.Status == "cancelled") return true;
            if (order.Status is not ("pending" or "processing")) return false;

            var now = DateTime.UtcNow;
            foreach (var item in order.OrderItems)
            {
                if (!await _orderRepo.RestoreStockAsync(item.ProductId, item.Quantity, now))
                    throw new InvalidOperationException("Không thể hoàn tồn kho của đơn hàng.");
                _orderRepo.AddInventoryAdjustment(new InventoryAdjustment
                {
                    ProductId = item.ProductId,
                    ChangeAmount = item.Quantity,
                    Reason = $"Hủy {order.OrderNumber}",
                    UserId = GetCurrentUserId(),
                    CreatedAt = now
                });
            }
            if (order.Customer != null && order.PointsUsed > 0)
            {
                order.Customer.RewardPoints += order.PointsUsed;
                order.Customer.UpdatedAt = now;
            }
            var redemptions = await _orderRepo.GetPromotionRedemptionsAsync(orderId);
            foreach (var group in redemptions.GroupBy(redemption => redemption.PromotionId))
            {
                var promotion = group.First().Promotion;
                if (promotion != null) promotion.UsedCount = Math.Max(0, promotion.UsedCount - 1);
            }
            _orderRepo.RemovePromotionRedemptions(redemptions);
            order.Status = "cancelled";
            order.UserId = GetCurrentUserId();
            order.UpdatedAt = now;
            if (!string.IsNullOrWhiteSpace(reason))
                order.Note = string.IsNullOrWhiteSpace(order.Note) ? $"Từ chối: {reason}" : $"{order.Note} | Từ chối: {reason}";
            // Paid cancellations remain paid until the refund transaction is confirmed.
            await _orderRepo.SaveChangesAsync();
            await _invoiceService.SyncOrderLifecycleAsync(orderId);
            await transaction.CommitAsync();
            var cancelled = true;
            if (cancelled)
            {
                await _realtime.BroadcastToWeb("OrderStatusChanged", new { orderId, status = "cancelled" });
                await _realtime.BroadcastStock("StockUpdated", new
                {
                    productIds = order.OrderItems.Select(item => item.ProductId).Distinct().ToArray(),
                    orderId,
                    source = "order-cancel",
                    changedAt = now
                });
            }
            return cancelled;
        }

        /// <summary>Giao hàng thành công: processing -> completed</summary>
        public async Task<bool> DeliverOnlineOrderAsync(int orderId)
        {
            await using var transaction = await _orderRepo.BeginSerializableTransactionAsync();
            await _orderRepo.LockOrderAsync(orderId);
            var order = await _orderRepo.GetOnlineOrderForLifecycleAsync(orderId);
            if (order == null) return false;
            if (order.Status == "completed" && order.PaymentStatus == "paid") return true;
            if (order.Status != "processing") return false;
            if (order.PaymentMethod != "cash" && order.PaymentStatus != "paid")
                throw new InvalidOperationException("Chờ xác nhận thanh toán trước khi hoàn tất giao hàng.");

            var now = DateTime.UtcNow;
            if (order.PaymentMethod == "cash" && order.PaymentStatus != "paid")
                _orderRepo.AddPayment(new Payment
                {
                    OrderId = order.Id,
                    Amount = order.TotalAmount,
                    Method = "cash",
                    Status = "completed",
                    TransactionRef = $"COD-{order.Id}",
                    CreatedAt = now
                });
            order.Status = "completed";
            order.PaymentStatus = "paid";
            order.UserId = GetCurrentUserId();
            order.UpdatedAt = now;
            order.PointsEarned = order.CustomerId.HasValue ? (int)decimal.Floor(order.TotalAmount / 10000m) : 0;
            if (order.Customer != null && order.PointsEarned > 0)
            {
                order.Customer.RewardPoints += order.PointsEarned;
                order.Customer.UpdatedAt = now;
            }
            await _orderRepo.SaveChangesAsync();
            await _invoiceService.SyncOrderLifecycleAsync(orderId);
            await transaction.CommitAsync();
            var delivered = true;
            if (delivered)
            {
                await _realtime.BroadcastToWeb("OrderStatusChanged", new { orderId, status = "completed" });
            }
            return delivered;
        }

        public async Task<bool> MarkOrderRefundedAsync(int orderId, decimal amount, string reference)
        {
            if (string.IsNullOrWhiteSpace(reference) || reference.Trim().Length > 200)
                throw new ArgumentException("Nhập mã giao dịch hoàn tiền.");
            var normalizedReference = $"REFUND-{reference.Trim()}";
            await using var transaction = await _orderRepo.BeginSerializableTransactionAsync();
            await _orderRepo.LockOrderAsync(orderId);
            var order = await _orderRepo.GetOnlineOrderForLifecycleAsync(orderId);
            if (order == null || amount != order.TotalAmount) return false;
            if (order.PaymentStatus == "refunded")
                return order.Payments.Any(payment => payment.Status == "refunded" && payment.TransactionRef == normalizedReference);
            if (order.PaymentStatus != "paid") return false;
            if (order.Status is "pending" or "processing")
                throw new InvalidOperationException("Hủy đơn chưa giao trước khi xác nhận hoàn tiền.");
            if (await _orderRepo.TransactionReferenceExistsAsync(normalizedReference))
                throw new InvalidOperationException("Mã hoàn tiền đã được sử dụng.");

            var now = DateTime.UtcNow;
            if (order.Customer != null && order.Status != "cancelled")
            {
                order.Customer.RewardPoints += order.PointsUsed - order.PointsEarned;
                order.Customer.UpdatedAt = now;
            }
            if (order.Status != "cancelled") order.Status = "refunded";
            order.PaymentStatus = "refunded";
            order.UpdatedAt = now;
            _orderRepo.AddPayment(new Payment
            {
                OrderId = order.Id,
                Amount = amount,
                Method = order.PaymentMethod == "e_wallet" ? "other" : order.PaymentMethod ?? "cash",
                Status = "refunded",
                TransactionRef = normalizedReference,
                CreatedAt = now
            });
            await _orderRepo.SaveChangesAsync();
            await _invoiceService.SyncOrderLifecycleAsync(orderId);
            await transaction.CommitAsync();
            await _realtime.BroadcastToWeb("OrderStatusChanged", new
            {
                orderId,
                status = order.Status,
                paymentStatus = "refunded"
            });
            return true;
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
