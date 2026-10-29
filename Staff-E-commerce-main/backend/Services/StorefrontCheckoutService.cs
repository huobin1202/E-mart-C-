using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using backend.DTO;
using backend.Helpers;
using backend.Models;
using backend.Repository;

namespace backend.Services;

public sealed class StorefrontCheckoutService(
    StorefrontRepository repository,
    PromotionService promotions,
    PaymentService payments,
    BankTransferService bank,
    RealtimeNotificationService realtime,
    IConfiguration configuration)
{
    public object GetPaymentOptions() => new
    {
        cod = true,
        bank = bank.Enabled,
        bankDetails = bank.Details,
        momo = !string.IsNullOrWhiteSpace(configuration["Momo:Endpoint"]) &&
               !string.IsNullOrWhiteSpace(configuration["Momo:SecretKey"])
    };

    public async Task<StorefrontCheckoutDTO> CreateAsync(int customerId, StorefrontOrderRequest request)
    {
        if (!Guid.TryParse(request.RequestId, out var requestId))
            throw new BusinessRuleException("Mã yêu cầu đặt hàng không hợp lệ.", 400, true);
        if (request.Items is not { Count: > 0 and <= 30 } || request.PointsUsed < 0)
            throw new BusinessRuleException("Giỏ hàng hoặc số điểm không hợp lệ.", 400, true);

        var lines = request.Items
            .GroupBy(item => item.ProductId)
            .Select(group => new CheckoutLine(group.Key, group.Sum(item => item.Quantity)))
            .OrderBy(item => item.ProductId)
            .ToList();
        if (lines.Any(item => item.ProductId <= 0 || item.Quantity is < 1 or > 1000))
            throw new BusinessRuleException("Số lượng mỗi sản phẩm phải từ 1 đến 1.000.", 400, true);
        if (request.EventPromotionId.HasValue && !string.IsNullOrWhiteSpace(request.PromotionCode))
            throw new BusinessRuleException("Chỉ chọn một ưu đãi sự kiện hoặc nhập một mã voucher.", 400, true);

        var requestedMethod = (request.PaymentMethod ?? "cod").Trim().ToLowerInvariant();
        var databaseMethod = requestedMethod switch
        {
            "cod" => "cash",
            "momo" => "e_wallet",
            "bank" => "card",
            _ => throw new BusinessRuleException("Phương thức thanh toán không hợp lệ.", 400, true)
        };
        var checkoutHash = HashRequest(customerId, databaseMethod, request, lines);

        Order order;
        var replay = false;
        await using (var transaction = await repository.BeginSerializableTransactionAsync())
        {
            await repository.LockCheckoutAsync();
            var existing = await repository.GetByCheckoutKeyAsync(requestId.ToString());
            if (existing != null)
            {
                if (existing.OrderType != "mobile" || existing.CustomerId != customerId || existing.CheckoutHash != checkoutHash)
                    throw new BusinessRuleException("Mã yêu cầu đã được sử dụng cho đơn hàng khác.", 409, true);
                order = existing;
                replay = true;
                await transaction.CommitAsync();
            }
            else
            {
                if (databaseMethod == "card" && !bank.Enabled)
                    throw new BusinessRuleException("Cửa hàng chưa cấu hình tài khoản nhận chuyển khoản. Vui lòng chọn phương thức khác.", 409, true);

                var customer = await repository.GetActiveCustomerAsync(customerId) ??
                    throw new BusinessRuleException("Hồ sơ khách hàng không hợp lệ.", 401, true);
                var productIds = lines.Select(item => item.ProductId).ToList();
                var products = await repository.GetTrackedActiveProductsByIdsAsync(productIds);
                if (products.Count != productIds.Count)
                    throw new BusinessRuleException("Có sản phẩm đã ngừng bán. Vui lòng cập nhật giỏ hàng.", 400, true);
                var productPromotions = await repository.GetTrackedProductPromotionsAsync(productIds);

                var usedPromotions = new Dictionary<int, Promotion>();
                var now = DateTime.UtcNow;
                var orderItems = lines.Select(line =>
                {
                    var product = products[line.ProductId];
                    if (product.Price <= 0)
                        throw new BusinessRuleException($"Giá sản phẩm {product.ProductName} không hợp lệ.", 409, true);

                    var unitPrice = SalePricing.Price(product.Price);
                    var bestPromotion = productPromotions
                        .Where(link => link.ProductId == product.Id && link.Promotion is { Type: "product" } && SalePricing.Active(link.Promotion))
                        .OrderByDescending(link => SalePricing.Discount(link.Promotion!, unitPrice))
                        .FirstOrDefault();
                    if (bestPromotion?.Promotion != null)
                    {
                        usedPromotions[bestPromotion.PromotionId] = bestPromotion.Promotion;
                        unitPrice -= SalePricing.Discount(bestPromotion.Promotion, unitPrice);
                    }

                    return new OrderItem
                    {
                        ProductId = product.Id,
                        Quantity = line.Quantity,
                        UnitPrice = unitPrice,
                        TotalPrice = unitPrice * line.Quantity,
                        CreatedAt = now
                    };
                }).ToList();

                var subtotal = orderItems.Sum(item => item.TotalPrice);
                var discount = 0m;
                int? orderPromotionId = null;
                if (request.EventPromotionId.HasValue || !string.IsNullOrWhiteSpace(request.PromotionCode))
                {
                    var validation = request.EventPromotionId.HasValue
                        ? await promotions.ValidateEventPromotionAsync(request.EventPromotionId.Value, subtotal)
                        : await promotions.ValidatePromotionAsync(request.PromotionCode!, subtotal);
                    if (!validation.IsValid || validation.Promotion == null)
                        throw new BusinessRuleException(validation.Message, 400, true);

                    var promotion = await repository.GetPromotionAsync(validation.Promotion.Id);
                    if (promotion == null || !SalePricing.Active(promotion))
                        throw new BusinessRuleException("Khuyến mãi đã hết lượt hoặc hết hiệu lực.", 409, true);
                    usedPromotions[promotion.Id] = promotion;
                    orderPromotionId = promotion.Id;
                    discount = SalePricing.Discount(promotion, subtotal);
                }

                var maximumPoints = decimal.Floor((subtotal - discount) / 1000m);
                if (request.PointsUsed > customer.RewardPoints || request.PointsUsed > maximumPoints)
                    throw new BusinessRuleException("Số điểm hoặc giá đã thay đổi. Vui lòng cập nhật giỏ hàng.", 409, true);
                discount += request.PointsUsed * 1000m;
                var total = subtotal - discount;
                if (total is < 0 or > 9999999999m)
                    throw new BusinessRuleException("Giá trị đơn hàng không hợp lệ hoặc vượt giới hạn.", 400, true);
                if (request.ExpectedTotal.HasValue && SalePricing.Price(request.ExpectedTotal.Value) != total)
                    throw new BusinessRuleException("Giá hoặc khuyến mãi đã thay đổi. Vui lòng cập nhật giỏ hàng.", 409, true);

                order = new Order
                {
                    OrderNumber = $"WEB-{Guid.NewGuid():N}",
                    OrderType = "mobile",
                    CustomerId = customerId,
                    CheckoutKey = requestId.ToString(),
                    CheckoutHash = checkoutHash,
                    Status = "pending",
                    PaymentStatus = total == 0 ? "paid" : "pending",
                    PaymentMethod = databaseMethod,
                    Subtotal = subtotal,
                    Discount = discount,
                    TotalAmount = total,
                    PointsUsed = request.PointsUsed,
                    PromotionId = orderPromotionId,
                    RecipientName = request.FullName.Trim(),
                    RecipientPhone = request.Phone.Trim(),
                    ShippingAddress = request.Address.Trim(),
                    Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(),
                    CreatedAt = now,
                    UpdatedAt = now,
                    OrderItems = orderItems
                };

                repository.AddOrder(order);
                await repository.SaveChangesAsync();
                foreach (var line in lines)
                {
                    if (!await repository.TryReduceStockAsync(line.ProductId, line.Quantity, now))
                        throw new BusinessRuleException($"Sản phẩm {products[line.ProductId].ProductName} không đủ tồn kho.", 409, true);
                    repository.AddInventoryAdjustment(new InventoryAdjustment
                    {
                        ProductId = line.ProductId,
                        ChangeAmount = -line.Quantity,
                        Reason = $"Đặt hàng {order.OrderNumber}",
                        CreatedAt = now
                    });
                }

                customer.RewardPoints -= request.PointsUsed;
                customer.UpdatedAt = now;
                foreach (var promotion in usedPromotions.Values)
                {
                    promotion.UsedCount++;
                    repository.AddPromotionRedemption(new PromotionRedemption
                    {
                        PromotionId = promotion.Id,
                        CustomerId = customerId,
                        OrderId = order.Id,
                        RedeemedAt = now
                    });
                }

                await repository.SaveChangesAsync();
                await transaction.CommitAsync();
            }
        }

        string? momoPayUrl = null;
        string? paymentError = null;
        if (order.PaymentMethod == "e_wallet" && order.PaymentStatus == "pending" && order.Status == "pending")
        {
            try
            {
                var origin = configuration["App:BaseUrl"] ?? "http://localhost:5099";
                var payment = await payments.CreatePaymentAsync(new MomoPaymentRequestDTO
                {
                    OrderId = order.Id,
                    Amount = order.TotalAmount,
                    ReturnUrl = $"{origin}/api/payment/momo/return",
                    NotifyUrl = $"{origin}/api/payment/momo/ipn"
                });
                momoPayUrl = payment.Success ? payment.PayUrl : null;
                paymentError = payment.Success ? null : payment.Message;
            }
            catch
            {
                paymentError = "Đơn đã lưu nhưng chưa tạo được liên kết MoMo. Hãy thử thanh toán lại từ lịch sử đơn hàng.";
            }
        }

        if (!replay)
        {
            await realtime.BroadcastToWeb("NewOrderPlaced", new
            {
                orderId = order.Id,
                orderNumber = order.OrderNumber,
                orderType = order.OrderType,
                customerName = order.RecipientName,
                phone = order.RecipientPhone,
                totalAmount = order.TotalAmount,
                itemCount = order.OrderItems.Count,
                paymentMethod = requestedMethod,
                createdAt = order.CreatedAt
            });
            await realtime.BroadcastStock("StockUpdated", new
            {
                productIds = lines.Select(line => line.ProductId).ToArray(),
                orderId = order.Id,
                source = "mobile-checkout",
                changedAt = DateTime.UtcNow
            });
        }

        return MapCheckout(order, requestedMethod, replay, momoPayUrl, paymentError);
    }

    public async Task<StorefrontPaymentStatusDTO> GetPaymentStatusAsync(int customerId, int orderId)
    {
        var order = await GetOwnedOrderAsync(customerId, orderId);
        return new StorefrontPaymentStatusDTO
        {
            Id = order.Id,
            OrderNumber = order.OrderNumber,
            Status = order.Status,
            PaymentStatus = order.PaymentStatus,
            PaymentMethod = ToApiPaymentMethod(order.PaymentMethod),
            TotalAmount = order.TotalAmount,
            VietQrUrl = order.PaymentStatus == "pending" && order.PaymentMethod == "card"
                ? bank.QrUrl(order.TotalAmount, order.OrderNumber)
                : null
        };
    }

    public async Task<object> RecreateMomoPaymentAsync(int customerId, int orderId)
    {
        var order = await GetOwnedOrderAsync(customerId, orderId);
        if (order.PaymentStatus == "paid")
            throw new BusinessRuleException("Đơn hàng đã được thanh toán.");
        if (order.PaymentMethod != "e_wallet" || order.Status is "cancelled" or "refunded")
            throw new BusinessRuleException("Đơn hàng không còn chờ thanh toán MoMo.", 409);

        var backendBase = configuration["App:BaseUrl"] ?? "http://localhost:5099";
        var result = await payments.CreatePaymentAsync(new MomoPaymentRequestDTO
        {
            OrderId = order.Id,
            Amount = order.TotalAmount,
            ReturnUrl = $"{backendBase}/api/payment/momo/return",
            NotifyUrl = $"{backendBase}/api/payment/momo/ipn"
        });
        if (!result.Success)
            throw new BusinessRuleException(result.Message ?? "Không thể tạo liên kết thanh toán MoMo.");
        return new { payUrl = result.PayUrl, orderId = order.Id };
    }

    private async Task<Order> GetOwnedOrderAsync(int customerId, int orderId)
    {
        var order = await repository.GetOrderForPaymentStatusAsync(orderId);
        if (order == null || order.CustomerId != customerId)
            throw new BusinessRuleException("Không tìm thấy đơn hàng.", 404);
        return order;
    }

    private StorefrontCheckoutDTO MapCheckout(
        Order order, string requestedMethod, bool replay, string? momoPayUrl, string? paymentError) => new()
    {
        Id = order.Id,
        OrderNumber = order.OrderNumber,
        Status = order.Status,
        Subtotal = order.Subtotal,
        Discount = order.Discount,
        TotalAmount = order.TotalAmount,
        PaymentMethod = requestedMethod,
        PaymentStatus = order.PaymentStatus,
        CreatedAt = order.CreatedAt,
        RecipientName = order.RecipientName,
        RecipientPhone = order.RecipientPhone,
        ShippingAddress = order.ShippingAddress,
        Note = order.Note,
        PointsUsed = order.PointsUsed,
        MomoPayUrl = momoPayUrl,
        PaymentError = paymentError,
        BankDetails = order.PaymentMethod == "card" ? bank.Details : null,
        VietQrUrl = order.PaymentMethod == "card" ? bank.QrUrl(order.TotalAmount, order.OrderNumber) : null,
        Replay = replay
    };

    private static string ToApiPaymentMethod(string? method) => method switch
    {
        "e_wallet" => "momo",
        "card" => "bank",
        _ => "cod"
    };

    private static string HashRequest(
        int customerId, string paymentMethod, StorefrontOrderRequest request, IReadOnlyList<CheckoutLine> lines)
    {
        var canonical = JsonSerializer.Serialize(new
        {
            customerId,
            paymentMethod,
            fullName = request.FullName.Trim(),
            phone = request.Phone.Trim(),
            address = request.Address.Trim(),
            note = request.Note?.Trim(),
            request.PointsUsed,
            request.EventPromotionId,
            promotionCode = request.PromotionCode?.Trim().ToUpperInvariant(),
            expectedTotal = request.ExpectedTotal.HasValue ? (decimal?)SalePricing.Price(request.ExpectedTotal.Value) : null,
            lines
        });
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical)));
    }

    private sealed record CheckoutLine(int ProductId, int Quantity);
}
