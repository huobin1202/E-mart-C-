using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using backend.DTO;
using backend.Helpers;
using backend.Models;
using backend.Repository;

namespace backend.Services;

public sealed class PosCheckoutService(IHttpContextAccessor accessor, InvoiceService invoices, PosCheckoutRepository repository)
{
    private int UserId => int.TryParse(accessor.HttpContext?.User.FindFirst("uid")?.Value, out var id)
        ? id : throw new UnauthorizedAccessException("Không xác định được nhân viên.");

    // Serializes POS lifecycle changes across processes; inventory debits also have a conditional SQL check.
    private static decimal Discount(Promotion p, decimal amount) => SalePricing.Discount(p, amount);
    private static bool Active(Promotion p) => SalePricing.Active(p);

    public async Task<PosCheckoutResponse> CheckoutAsync(PosCheckoutRequest request)
    {
        var userId = UserId;
        if (!Guid.TryParse(request.RequestId, out var requestKey)) throw new ArgumentException("Mã yêu cầu không hợp lệ.");
        if (request.Items == null || request.Items.Count is < 1 or > 200 || request.Items.Any(i => i.ProductId <= 0 || i.Quantity is < 1 or > 1000) || request.PointsUsed < 0)
            throw new ArgumentException("Giỏ hàng hoặc số lượng không hợp lệ.");
        var lines = request.Items.GroupBy(i => i.ProductId).Select(g => new PosCheckoutLine { ProductId = g.Key, Quantity = g.Sum(i => i.Quantity) }).OrderBy(i => i.ProductId).ToList();
        if (lines.Any(i => i.Quantity > 1000)) throw new ArgumentException("Số lượng mỗi sản phẩm không được vượt quá 1.000.");
        var method = request.PaymentMethod?.Trim().ToLowerInvariant() switch
        { "cash" => "cash", "other" or "momo" or "e_wallet" => "e_wallet", _ => throw new ArgumentException("Chỉ hỗ trợ thanh toán tiền mặt hoặc MoMo.") };
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new
        { request.CustomerId, request.PointsUsed, request.PromotionId, method, request.CashReceived, request.ExpectedTotal, request.Note, lines }))));
        await using var transaction = await repository.BeginSerializableTransactionAsync();
        await repository.LockAsync();
        var key = requestKey.ToString();
        var existing = await repository.GetByCheckoutKeyAsync(key);
        if (existing != null)
        {
            if (existing.UserId != userId || existing.CheckoutHash != hash) throw new InvalidOperationException("Mã yêu cầu đã được dùng cho một giỏ hàng khác.");
            var replay = await GetAsync(existing.Id);
            await transaction.CommitAsync();
            return replay;
        }

        Customer? customer = null;
        if (request.CustomerId.HasValue)
            customer = await repository.GetActiveCustomerAsync(request.CustomerId.Value)
                ?? throw new ArgumentException("Khách hàng không tồn tại hoặc đã ngừng hoạt động.");
        if (request.PointsUsed > 0 && customer == null) throw new ArgumentException("Chọn khách hàng để sử dụng điểm.");
        var productIds = lines.Select(i => i.ProductId).ToList();
        var products = await repository.GetActiveProductsByIdsAsync(productIds);
        if (products.Count != productIds.Count) throw new ArgumentException("Có sản phẩm không tồn tại hoặc đã ngừng bán.");
        var productPromotions = await repository.GetProductPromotionsAsync(productIds);
        var usedPromotions = new Dictionary<int, Promotion>();
        var now = DateTime.UtcNow;
        var items = new List<OrderItem>();
        foreach (var line in lines)
        {
            var product = products[line.ProductId];
            if (product.Price < 0) throw new InvalidOperationException("Giá sản phẩm không hợp lệ.");
            var best = productPromotions.Where(p => p.ProductId == product.Id && p.Promotion != null && p.Promotion.Type == "product" && Active(p.Promotion))
                .OrderByDescending(p => Discount(p.Promotion!, SalePricing.Price(product.Price))).FirstOrDefault();
            var price = SalePricing.Price(product.Price) - (best == null ? 0 : Discount(best.Promotion!, SalePricing.Price(product.Price)));
            if (best != null) usedPromotions[best.PromotionId] = best.Promotion!;
            items.Add(new OrderItem { ProductId = product.Id, Quantity = line.Quantity, UnitPrice = price, TotalPrice = price * line.Quantity, CreatedAt = now });
        }
        var subtotal = items.Sum(i => i.TotalPrice);
        decimal discount = 0;
        if (request.PromotionId.HasValue)
        {
            var promotion = await repository.GetPromotionForCheckoutAsync(request.PromotionId.Value);
            if (promotion == null || !Active(promotion) || promotion.Type is not ("voucher" or "event"))
                throw new ArgumentException("Khuyến mãi không còn hợp lệ.");
            if (subtotal < (promotion.EventDetails?.MinOrderAmount ?? 0)) throw new ArgumentException("Đơn hàng chưa đạt mức tối thiểu của khuyến mãi.");
            discount = Discount(promotion, subtotal);
            usedPromotions[promotion.Id] = promotion;
        }
        if (request.PointsUsed > (customer?.RewardPoints ?? 0) || request.PointsUsed > decimal.Floor((subtotal - discount) / 1000m))
            throw new ArgumentException("Số điểm yêu cầu vượt số dư hoặc số tiền có thể giảm.");
        discount += request.PointsUsed * 1000m;
        var total = subtotal - discount;
        if (total > 9999999999m) throw new ArgumentException("Giá trị đơn hàng vượt giới hạn.");
        if (request.ExpectedTotal.HasValue && request.ExpectedTotal.Value != total)
            throw new InvalidOperationException($"Giá hoặc ưu đãi đã thay đổi. Số tiền phải trả hiện tại là {total:N0} ₫. Vui lòng kiểm tra lại giỏ hàng.");
        if (method == "cash" && (!request.CashReceived.HasValue || request.CashReceived < total || request.CashReceived > 9999999999m))
            throw new ArgumentException("Tiền khách đưa phải đủ số tiền cần thanh toán.");

        var order = new Order
        {
            OrderNumber = $"POS-{Guid.NewGuid():N}", OrderType = "pos", UserId = userId, CustomerId = customer?.Id, Customer = customer,
            CheckoutKey = key, CheckoutHash = hash, Status = "pending", PaymentStatus = "pending", PaymentMethod = method,
            Subtotal = subtotal, Discount = discount, TotalAmount = total, PromotionId = request.PromotionId,
            PointsUsed = request.PointsUsed, CashReceived = method == "cash" ? request.CashReceived : null,
            Note = request.Note?.Trim(), CreatedAt = now, UpdatedAt = now, OrderItems = items
        };
        repository.AddOrder(order);
        await repository.SaveChangesAsync();
        foreach (var line in lines)
        {
            if (!await repository.TryReduceInventoryAsync(line.ProductId, line.Quantity, now))
                throw new InvalidOperationException($"Sản phẩm {products[line.ProductId].ProductName} không đủ tồn kho.");
            repository.AddInventoryAdjustment(new InventoryAdjustment { ProductId = line.ProductId, ChangeAmount = -line.Quantity, Reason = $"Xuất bán {order.OrderNumber}", UserId = userId, CreatedAt = now });
        }
        if (customer != null) { customer.RewardPoints -= request.PointsUsed; customer.UpdatedAt = now; }
        foreach (var promotion in usedPromotions.Values)
        {
            promotion.UsedCount++;
            repository.AddPromotionRedemption(new PromotionRedemption { PromotionId = promotion.Id, OrderId = order.Id, CustomerId = customer?.Id, RedeemedAt = now });
        }
        if (method == "cash" || total == 0) Complete(order, method, $"POS-{key}");
        repository.AddActivityLog(new ActivityLog { UserId = userId, Action = "pos_checkout", EntityType = "orders", EntityId = order.Id.ToString(), CreatedAt = now });
        await repository.SaveChangesAsync();
        if (order.PaymentStatus == "paid") await invoices.SyncOrderLifecycleAsync(order.Id);
        var response = await GetAsync(order.Id);
        await transaction.CommitAsync();
        return response;
    }

    private void Complete(Order order, string method, string reference)
    {
        order.Status = "completed"; order.PaymentStatus = "paid"; order.UpdatedAt = DateTime.UtcNow;
        order.PointsEarned = order.CustomerId.HasValue ? (int)decimal.Floor(order.TotalAmount / 10000m) : 0;
        if (order.Customer != null) { order.Customer.RewardPoints += order.PointsEarned; order.Customer.UpdatedAt = order.UpdatedAt; }
        var payment = order.Payments.FirstOrDefault(p => p.TransactionRef == reference);
        if (payment == null)
        {
            payment = new Payment { Amount = order.TotalAmount, Method = method == "e_wallet" ? "other" : method, TransactionRef = reference, CreatedAt = order.UpdatedAt };
            order.Payments.Add(payment);
        }
        payment.Status = "completed";
    }

    public async Task<PosCheckoutResponse> ConfirmAsync(int orderId, decimal amount, string reference, bool momo = false)
    {
        if (string.IsNullOrWhiteSpace(reference) || reference.Length > 200) throw new ArgumentException("Nhập mã giao dịch xác nhận thu tiền.");
        reference = reference.Trim();
        await using var transaction = await repository.BeginSerializableTransactionAsync();
        await repository.LockAsync();
        var order = await repository.GetOrderForConfirmationAsync(orderId)
            ?? throw new ArgumentException("Không tìm thấy đơn POS.");
        if (amount != order.TotalAmount || order.PaymentMethod != (momo ? "e_wallet" : "card"))
            throw new ArgumentException("Số tiền hoặc phương thức không khớp đơn hàng.");
        if (momo && order.Status == "cancelled" && order.PaymentStatus == "pending")
        {
            var latePayment = order.Payments.SingleOrDefault(p => p.TransactionRef == reference && p.Amount == amount)
                ?? throw new ArgumentException("Không tìm thấy lần thanh toán MoMo.");
            latePayment.Status = "completed";
            order.PaymentStatus = "paid"; order.UpdatedAt = DateTime.UtcNow;
            await repository.SaveChangesAsync();
            await invoices.SyncOrderLifecycleAsync(order.Id);
            var cancelled = await GetAsync(orderId);
            await transaction.CommitAsync();
            return cancelled;
        }
        if (order.PaymentStatus == "paid")
        {
            if (!order.Payments.Any(p => p.Status == "completed" && p.TransactionRef == reference))
                throw new InvalidOperationException("Đơn đã được thanh toán bằng giao dịch khác.");
        }
        else
        {
            if (order.Status != "pending" || order.PaymentStatus != "pending") throw new InvalidOperationException("Đơn không còn chờ thanh toán.");
            if (await repository.HasCompletedTransactionAsync(reference, orderId))
                throw new InvalidOperationException("Mã giao dịch đã được ghi nhận cho đơn khác.");
            Complete(order, order.PaymentMethod!, reference.Trim());
            repository.AddActivityLog(new ActivityLog { UserId = momo ? order.UserId : UserId, Action = "pos_payment_confirmed", EntityType = "orders", EntityId = order.Id.ToString(), CreatedAt = DateTime.UtcNow });
            await repository.SaveChangesAsync();
            await invoices.SyncOrderLifecycleAsync(order.Id);
        }
        var result = await GetAsync(orderId);
        await transaction.CommitAsync();
        return result;
    }

    // Legacy POS lines were reserved by the old creation flow. Settle that existing bill;
    // do not create a second order or debit its inventory again.
    public async Task<PosCheckoutResponse> ConfirmCashAsync(int orderId, decimal cashReceived)
    {
        var userId = UserId;
        await using var transaction = await repository.BeginSerializableTransactionAsync();
        await repository.LockAsync();
        var order = await repository.GetLegacyCashOrderAsync(orderId)
            ?? throw new ArgumentException("Không tìm thấy đơn tại quầy.");
        if (order.PaymentMethod != "cash" || cashReceived < order.TotalAmount || cashReceived > 9999999999m || cashReceived < 0)
            throw new ArgumentException("Phải thu đủ tiền mặt theo số tiền của đơn hàng.");
        var reference = $"POS-CASH-{orderId}";
        if (order.Status == "completed" && order.PaymentStatus == "paid" && order.Payments.Any(p => p.Status == "completed" && p.TransactionRef == reference))
        {
            if (order.CashReceived != cashReceived) throw new InvalidOperationException("Đơn đã được thu tiền với số tiền khách đưa khác.");
        }
        else
        {
            if (order.CheckoutKey != null || order.Status != "pending" || order.PaymentStatus != "pending")
                throw new InvalidOperationException("Đơn không còn chờ thu tiền mặt.");
            if (order.OrderItems.Count == 0 || order.OrderItems.Any(i => i.Quantity <= 0 || i.UnitPrice < 0 || i.TotalPrice != i.UnitPrice * i.Quantity)
                || order.OrderItems.Sum(i => i.TotalPrice) != order.Subtotal || order.Discount < 0 || order.TotalAmount < 0
                || order.Subtotal - order.Discount != order.TotalAmount)
                throw new InvalidOperationException("Dữ liệu đơn cũ chưa đầy đủ hoặc số tiền không khớp. Cần đối soát trước khi thu tiền.");
            if (order.Payments.Any(p => p.Status == "completed"))
                throw new InvalidOperationException("Đơn đã có giao dịch thu tiền. Cần đối soát trước khi tiếp tục.");
            order.CashReceived = cashReceived;
            order.UserId ??= userId;
            Complete(order, "cash", reference);
            repository.AddActivityLog(new ActivityLog { UserId = userId, Action = "pos_cash_confirmed", EntityType = "orders", EntityId = orderId.ToString(), CreatedAt = DateTime.UtcNow });
            await repository.SaveChangesAsync();
            await invoices.SyncOrderLifecycleAsync(orderId);
        }
        var response = await GetAsync(orderId);
        await transaction.CommitAsync();
        return response;
    }

    public async Task<bool> CancelAsync(int orderId)
    {
        var userId = UserId;
        await using var transaction = await repository.BeginSerializableTransactionAsync();
        await repository.LockAsync();
        var order = await repository.GetOrderForCancelAsync(orderId);
        if (order.Status == "cancelled") return true;
        if (order.Status != "pending" || order.PaymentStatus != "pending") throw new InvalidOperationException("Chỉ hủy được đơn POS chưa thanh toán.");
        var now = DateTime.UtcNow;
        foreach (var item in order.OrderItems)
        {
            if (!await repository.RestoreInventoryAsync(item.ProductId, item.Quantity, now))
                throw new InvalidOperationException("Không thể hoàn tồn kho.");
            repository.AddInventoryAdjustment(new InventoryAdjustment { ProductId = item.ProductId, ChangeAmount = item.Quantity, Reason = $"Hủy {order.OrderNumber}", UserId = userId, CreatedAt = now });
        }
        if (order.Customer != null) { order.Customer.RewardPoints += order.PointsUsed; order.Customer.UpdatedAt = now; }
        var redemptions = await repository.GetRedemptionsAsync(orderId);
        var promotionIds = redemptions.Select(p => p.PromotionId).Distinct().ToList();
        foreach (var promotion in await repository.GetPromotionsAsync(promotionIds)) promotion.UsedCount = Math.Max(0, promotion.UsedCount - 1);
        repository.RemoveRedemptions(redemptions);
        order.Status = "cancelled"; order.UpdatedAt = now;
        repository.AddActivityLog(new ActivityLog { UserId = userId, Action = "pos_cancelled", EntityType = "orders", EntityId = orderId.ToString(), CreatedAt = now });
        await repository.SaveChangesAsync();
        await invoices.SyncOrderLifecycleAsync(orderId);
        await transaction.CommitAsync();
        return true;
    }

    public async Task<PosCheckoutResponse> GetAsync(int id)
    {
        var order = await repository.GetPosOrderForDisplayAsync(id) ?? throw new ArgumentException("Không tìm thấy đơn POS.");
        var delivery = OrderDeliveryDetails.FromOrder(order);
        return new PosCheckoutResponse { IsLegacy = order.CheckoutKey == null, Id = order.Id, OrderNumber = order.OrderNumber, Status = order.Status, PaymentStatus = order.PaymentStatus,
            PaymentMethod = order.PaymentMethod, Subtotal = order.Subtotal, Discount = order.Discount, TotalAmount = order.TotalAmount,
            CashReceived = order.CashReceived, ChangeDue = order.CashReceived.HasValue ? order.CashReceived.Value - order.TotalAmount : 0,
            PointsUsed = order.PointsUsed, PointsEarned = order.PointsEarned, CustomerName = order.Customer?.FullName, CreatedAt = order.CreatedAt,
            CustomerId = order.CustomerId, UserId = order.UserId, UserName = order.User?.FullName, PromotionId = order.PromotionId, Note = delivery.Note, UpdatedAt = order.UpdatedAt,
            RecipientName = delivery.Name, RecipientPhone = delivery.Phone, ShippingAddress = delivery.Address,
            Items = order.OrderItems.Select(i => new PosCheckoutItemResponse { ProductId = i.ProductId, ProductName = i.Product?.ProductName ?? "", Quantity = i.Quantity, UnitPrice = i.UnitPrice, TotalPrice = i.TotalPrice }).ToList() };
    }

    public async Task<PosCheckoutResponse?> GetByRequestAsync(Guid requestId)
    {
        var userId = UserId;
        var key = requestId.ToString();
        var id = await repository.GetOrderIdByCheckoutKeyAsync(key, userId);
        return id.HasValue ? await GetAsync(id.Value) : null;
    }
}
