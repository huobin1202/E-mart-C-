using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using backend.Controllers;
using backend.Helpers;
using backend.Models;
using backend.Repository;

namespace backend.Services;

public sealed class StorefrontCheckoutService(PosCheckoutRepository sales, StorefrontRepository customers,
    PromotionService promotions, IHttpContextAccessor accessor, BankTransferService bank)
{
    public async Task<(Order Order, bool Replay)> CreateAsync(StorefrontOrderRequest request)
    {
        if (!int.TryParse(accessor.HttpContext?.User.FindFirst("customer_id")?.Value, out var customerId))
            throw new UnauthorizedAccessException("Đăng nhập bằng tài khoản khách hàng để đặt đơn.");
        if (!Guid.TryParse(request.RequestId, out var key)) throw new ArgumentException("Mã yêu cầu đặt hàng không hợp lệ.");
        if (request.Items is not { Count: > 0 and <= 30 } || request.Items.Any(i => i.ProductId <= 0 || i.Quantity is < 1 or > 1000) || request.PointsUsed < 0)
            throw new ArgumentException("Giỏ hàng hoặc số điểm không hợp lệ.");
        var lines = request.Items.GroupBy(i => i.ProductId).Select(g => new { ProductId = g.Key, Quantity = g.Sum(i => i.Quantity) }).OrderBy(i => i.ProductId).ToList();
        if (lines.Any(i => i.Quantity > 1000)) throw new ArgumentException("Số lượng mỗi sản phẩm không được vượt quá 1.000.");
        if (request.EventPromotionId.HasValue && !string.IsNullOrWhiteSpace(request.PromotionCode)) throw new ArgumentException("Chỉ chọn một ưu đãi cấp đơn.");
        var method = (request.PaymentMethod ?? "cod").ToLowerInvariant() switch {
            "cod" => "cash", "momo" => "e_wallet", "bank" => "card", _ => throw new ArgumentException("Phương thức thanh toán không hợp lệ.") };
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new {
            customerId, method, request.FullName, request.Phone, request.Address, request.Note,
            request.PointsUsed, request.EventPromotionId, request.PromotionCode, request.ExpectedTotal, lines }))));
        await using var transaction = await sales.BeginSerializableTransactionAsync();
        await sales.LockAsync();
        var existing = await sales.GetByCheckoutKeyAsync(key.ToString());
        if (existing != null)
        {
            if (existing.OrderType != "mobile" || existing.CustomerId != customerId || existing.CheckoutHash != hash)
                throw new InvalidOperationException("Mã yêu cầu đã được sử dụng cho đơn khác.");
            await transaction.CommitAsync();
            return (existing, true);
        }
        if (method == "card" && !bank.Enabled) throw new InvalidOperationException("Cửa hàng chưa cấu hình tài khoản nhận chuyển khoản. Vui lòng chọn phương thức khác.");
        var customer = await customers.GetActiveCustomerAsync(customerId) ?? throw new UnauthorizedAccessException("Hồ sơ khách hàng không hợp lệ.");
        var productIds = lines.Select(i => i.ProductId).ToList();
        var products = await sales.GetActiveProductsByIdsAsync(productIds);
        if (products.Count != productIds.Count) throw new ArgumentException("Có sản phẩm đã ngừng bán. Vui lòng cập nhật giỏ hàng.");
        var availablePromotions = await sales.GetProductPromotionsAsync(productIds);
        var used = new Dictionary<int, Promotion>();
        var now = DateTime.UtcNow;
        var items = lines.Select(line => {
            var product = products[line.ProductId];
            if (product.Price <= 0) throw new InvalidOperationException("Giá sản phẩm không hợp lệ.");
            var price = SalePricing.Price(product.Price);
            var best = availablePromotions.Where(p => p.ProductId == product.Id && p.Promotion is { Type: "product" } && SalePricing.Active(p.Promotion))
                .OrderByDescending(p => SalePricing.Discount(p.Promotion!, price)).FirstOrDefault();
            if (best != null) { used[best.PromotionId] = best.Promotion!; price -= SalePricing.Discount(best.Promotion!, price); }
            return new OrderItem { ProductId = product.Id, Quantity = line.Quantity, UnitPrice = price, TotalPrice = price * line.Quantity, CreatedAt = now };
        }).ToList();
        var subtotal = items.Sum(i => i.TotalPrice);
        decimal discount = 0;
        int? orderPromotionId = null;
        if (request.EventPromotionId.HasValue || !string.IsNullOrWhiteSpace(request.PromotionCode))
        {
            var validation = request.EventPromotionId.HasValue
                ? await promotions.ValidateEventPromotionAsync(request.EventPromotionId.Value, subtotal)
                : await promotions.ValidatePromotionAsync(request.PromotionCode!, subtotal);
            if (!validation.IsValid || validation.Promotion == null) throw new ArgumentException(validation.Message);
            var promotion = await customers.GetPromotionAsync(validation.Promotion.Id) ?? throw new ArgumentException("Khuyến mãi không tồn tại.");
            if (!SalePricing.Active(promotion)) throw new InvalidOperationException("Khuyến mãi đã hết lượt hoặc hết hiệu lực.");
            used[promotion.Id] = promotion; orderPromotionId = promotion.Id;
            discount = SalePricing.Discount(promotion, subtotal);
        }
        if (request.PointsUsed > 0 && (request.PointsUsed > customer.RewardPoints || request.PointsUsed > decimal.Floor((subtotal - discount) / 1000m)))
            throw new InvalidOperationException("Số điểm hoặc giá đã thay đổi. Vui lòng cập nhật giỏ hàng.");
        discount += request.PointsUsed * 1000m;
        var total = subtotal - discount;
        if (total > 9999999999m) throw new ArgumentException("Giá trị đơn hàng vượt giới hạn.");
        if (request.ExpectedTotal.HasValue && request.ExpectedTotal != total) throw new InvalidOperationException("Giá hoặc khuyến mãi đã thay đổi. Vui lòng cập nhật giỏ hàng.");
        var order = new Order { OrderNumber = $"WEB-{Guid.NewGuid():N}", OrderType = "mobile", CustomerId = customerId,
            CheckoutKey = key.ToString(), CheckoutHash = hash, Status = "pending", PaymentStatus = total == 0 ? "paid" : "pending", PaymentMethod = method,
            Subtotal = subtotal, Discount = discount, TotalAmount = total, PointsUsed = request.PointsUsed, PromotionId = orderPromotionId,
            RecipientName = request.FullName.Trim(), RecipientPhone = request.Phone.Trim(), ShippingAddress = request.Address.Trim(),
            Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(), CreatedAt = now, UpdatedAt = now, OrderItems = items };
        sales.AddOrder(order); await sales.SaveChangesAsync();
        foreach (var line in lines)
        {
            if (!await sales.TryReduceInventoryAsync(line.ProductId, line.Quantity, now)) throw new InvalidOperationException($"Sản phẩm {products[line.ProductId].ProductName} không đủ tồn kho.");
            sales.AddInventoryAdjustment(new InventoryAdjustment { ProductId = line.ProductId, ChangeAmount = -line.Quantity,
                Reason = $"Đặt hàng {order.OrderNumber}", CreatedAt = now });
        }
        customer.RewardPoints -= request.PointsUsed; customer.UpdatedAt = now;
        foreach (var promotion in used.Values)
        {
            promotion.UsedCount++;
            sales.AddPromotionRedemption(new PromotionRedemption { PromotionId = promotion.Id, OrderId = order.Id, CustomerId = customerId, RedeemedAt = now });
        }
        await sales.SaveChangesAsync(); await transaction.CommitAsync();
        return (order, false);
    }
}
