using backend.Models;
using backend.Repository;

namespace backend.Services;

public sealed class OnlinePaymentService(OrderRepository orders, InvoiceService invoices)
{
    public async Task<Order> ConfirmAsync(int orderId, decimal amount, string reference, bool momo = false)
    {
        if (string.IsNullOrWhiteSpace(reference) || reference.Trim().Length > 200) throw new ArgumentException("Nhập mã giao dịch xác nhận nhận tiền.");
        reference = reference.Trim();
        await using var transaction = await orders.BeginSalesTransactionAsync();
        var order = await orders.GetForSettlementAsync(orderId) ?? throw new ArgumentException("Không tìm thấy đơn hàng.");
        if (order.OrderType != "mobile" || order.PaymentMethod != (momo ? "e_wallet" : "card") || amount != order.TotalAmount)
            throw new ArgumentException("Số tiền hoặc phương thức thanh toán không khớp đơn online.");
        var payment = order.Payments.FirstOrDefault(p => p.TransactionRef == reference);
        if (momo && payment == null) throw new ArgumentException("Không tìm thấy lần thanh toán MoMo.");
        if (payment != null && payment.Amount != amount) throw new ArgumentException("Số tiền giao dịch không khớp.");
        if (order.PaymentStatus == "refunded")
        {
            if (payment?.Status == "completed") { await transaction.CommitAsync(); return order; }
            throw new InvalidOperationException("Đơn đã hoàn tiền; cần đối soát giao dịch mới.");
        }
        if (!momo && order.Status is "cancelled" or "refunded") throw new InvalidOperationException("Không xác nhận chuyển khoản cho đơn đã hủy/hoàn tiền.");
        if (order.PaymentStatus == "paid" && payment?.Status != "completed") throw new InvalidOperationException("Đơn đã nhận tiền theo giao dịch khác. Cần đối soát giao dịch mới.");
        if (await orders.TransactionExistsAsync(reference, payment?.Id)) throw new InvalidOperationException("Mã giao dịch đã được ghi nhận cho đơn khác.");
        payment ??= new Payment { OrderId = order.Id, Amount = amount, Method = momo ? "other" : "card", TransactionRef = reference, CreatedAt = DateTime.UtcNow };
        if (!order.Payments.Contains(payment)) order.Payments.Add(payment);
        payment.Status = "completed";
        // Preserve cancellation/fulfillment. Late money on a cancelled order requires a refund.
        order.PaymentStatus = "paid";
        order.UpdatedAt = DateTime.UtcNow;
        await orders.SaveChangesAsync();
        await invoices.SyncOrderLifecycleAsync(order.Id);
        await transaction.CommitAsync();
        return order;
    }
}
