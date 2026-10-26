using backend.DTO;
using backend.Models;
using backend.Repository;
using Newtonsoft.Json;
using System.Security.Cryptography;
using System.Text;
using backend.Hubs;

namespace backend.Services
{
    public class PaymentService
    {
        private readonly PaymentRepository _paymentRepo;
        private readonly OrderRepository _orderRepo;
        private readonly ActivityLogService _logService;
        private readonly IConfiguration _config;
        private readonly InvoiceService _invoiceService;
        private readonly PosCheckoutService _checkout;
        private readonly OnlinePaymentService _online;
        private readonly OrderNotifications _notifications;

        // Hàm lưu một payment nếu là thanh toán trực tiếp 
        // Lưu Payment (Cash, Card, ECard,...)
        public async Task<Payment> CreatePaymentAsync(Payment payment)
        {
            if (await _paymentRepo.IsLockedPosOrderAsync(payment.OrderId))
                throw new ArgumentException("Đơn POS phải thanh toán qua nghiệp vụ chốt đơn.");
            if (payment.Method != "card" || payment.Status != "completed") throw new ArgumentException("Dùng nghiệp vụ xác nhận chuyển khoản của đơn online.");
            var order = await _online.ConfirmAsync(payment.OrderId, payment.Amount, payment.TransactionRef ?? "");
            return order.Payments.Single(p => p.TransactionRef == payment.TransactionRef?.Trim());
        }

        public PaymentService(PaymentRepository paymentRepo, OrderRepository orderRepo, ActivityLogService logService, IConfiguration config, InvoiceService invoiceService, PosCheckoutService checkout, OnlinePaymentService online, OrderNotifications notifications)
        {
            _paymentRepo = paymentRepo;
            _orderRepo = orderRepo;
            _logService = logService;
            _config = config;
            _invoiceService = invoiceService;
            _checkout = checkout;
            _online = online;
            _notifications = notifications;
        }

        private string SignSHA256(string message, string key)
        {
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(key));
            return BitConverter.ToString(hmac.ComputeHash(Encoding.UTF8.GetBytes(message))).Replace("-", "").ToLower();
        }

        public async Task<MomoPaymentResponseDTO> CreatePaymentAsync(MomoPaymentRequestDTO req)
        {
            var endpoint = _config["Momo:Endpoint"];
            var partnerCode = _config["Momo:PartnerCode"];
            var accessKey = _config["Momo:AccessKey"];
            var secretKey = _config["Momo:SecretKey"];
            if (string.IsNullOrWhiteSpace(endpoint) || string.IsNullOrWhiteSpace(partnerCode) || string.IsNullOrWhiteSpace(accessKey) || string.IsNullOrWhiteSpace(secretKey))
                throw new ArgumentException("Cửa hàng chưa cấu hình thanh toán MoMo.");
            Payment payment;
            await using (var transaction = await _paymentRepo.BeginSalesTransactionAsync())
            {
                var order = await _paymentRepo.GetOrderSnapshotAsync(req.OrderId) ?? throw new ArgumentException("Không tìm thấy đơn hàng.");
                if (order.PaymentStatus != "pending" || order.Status is "cancelled" or "refunded" || order.PaymentMethod != "e_wallet")
                    throw new ArgumentException("Đơn không còn chờ thanh toán MoMo.");
                req.Amount = order.TotalAmount;
                if (req.Amount <= 0 || req.Amount != decimal.Truncate(req.Amount)) throw new ArgumentException("Thanh toán MoMo yêu cầu số tiền nguyên đồng lớn hơn 0.");
                var pending = await _paymentRepo.GetPendingMomoAsync(order.Id);
                if (pending != null)
                {
                    await transaction.CommitAsync();
                    return new MomoPaymentResponseDTO { Success = !string.IsNullOrWhiteSpace(pending.PayUrl), PayUrl = pending.PayUrl,
                        OrderId = pending.TransactionRef, RequestId = pending.ProviderRequestId,
                        Message = string.IsNullOrWhiteSpace(pending.PayUrl) ? "Lần thanh toán trước đang được kiểm tra. Không tạo giao dịch mới khi kết quả chưa rõ." : null };
                }
                payment = new Payment { OrderId = order.Id, Amount = req.Amount, Method = "other", Status = "pending", CreatedAt = DateTime.UtcNow,
                    TransactionRef = $"order_{order.Id}_{Guid.NewGuid():N}", ProviderRequestId = "req_" + Guid.NewGuid().ToString("N") };
                await _paymentRepo.AddPaymentAsync(payment);
                await transaction.CommitAsync();
            }
            string redirectUrl = req.ReturnUrl;
            string ipnUrl = req.NotifyUrl;
            string orderId = payment.TransactionRef!;
            string requestId = payment.ProviderRequestId!;
            string orderInfo = $"Thanh toán đơn hàng {req.OrderId}";
            string amountStr = req.Amount.ToString("0", System.Globalization.CultureInfo.InvariantCulture);

            // Tạo signature chuẩn MoMo
            string requestType = "captureWallet"; // dùng chuẩn sandbox

            string rawSignature =
                $"accessKey={accessKey}" +
                $"&amount={amountStr}" +
                $"&extraData=" +
                $"&ipnUrl={ipnUrl}" +
                $"&orderId={orderId}" +
                $"&orderInfo={orderInfo}" +
                $"&partnerCode={partnerCode}" +
                $"&redirectUrl={redirectUrl}" +
                $"&requestId={requestId}" +
                $"&requestType={requestType}";

            string signature = SignSHA256(rawSignature, secretKey);

            var body = new
            {
                partnerCode,
                accessKey,
                requestId,
                amount = amountStr,
                orderId,
                orderInfo,
                redirectUrl,
                ipnUrl,
                extraData = "",
                requestType = requestType,
                signature
            };

            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
            // Keep an uncertain attempt pending after a timeout; a retry must not create a second charge.
            var resp = await client.PostAsync(endpoint, new StringContent(JsonConvert.SerializeObject(body), Encoding.UTF8, "application/json"));
            var content = await resp.Content.ReadAsStringAsync();
            dynamic json = JsonConvert.DeserializeObject(content)!;
            string payUrl = json?.payUrl ?? "";
            bool success = !string.IsNullOrWhiteSpace(payUrl);
            if (success) await _paymentRepo.SetPayUrlAsync(payment.Id, payUrl);
            else if (resp.IsSuccessStatusCode && json?.resultCode != null && (int)json.resultCode != 0)
                await _paymentRepo.MarkPendingPaymentFailedAsync(payment.Id);

            return new MomoPaymentResponseDTO
            {
                PayUrl = payUrl,
                OrderId = orderId,
                RequestId = requestId,
                Success = success,
                Message = json?.message
            };
        }

        public async Task<bool> HandleMomoCallbackAsync(MomoIpnCallbackDTO callback)
        {
            string accessKey = _config["Momo:AccessKey"];
            string secretKey = _config["Momo:SecretKey"];
            if (string.IsNullOrWhiteSpace(secretKey) || callback.Amount is not long receivedAmount) return false;

            // Signature kiểm tra callback
            string rawSignature =
                $"accessKey={accessKey}" +
                $"&amount={callback.Amount}" +
                $"&extraData={callback.ExtraData}" +
                $"&message={callback.Message}" +
                $"&orderId={callback.OrderId}" +
                $"&orderInfo={callback.OrderInfo}" +
                $"&orderType={callback.OrderType}" +
                $"&partnerCode={callback.PartnerCode}" +
                $"&payType={callback.PayType}" +
                $"&requestId={callback.RequestId}" +
                $"&responseTime={callback.ResponseTime}" +
                $"&resultCode={callback.ResultCode}" +
                $"&transId={callback.TransId}";

            string expected = SignSHA256(rawSignature, secretKey);
            if (string.IsNullOrWhiteSpace(secretKey) || string.IsNullOrWhiteSpace(callback.Signature) ||
                !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(callback.Signature), Encoding.UTF8.GetBytes(expected))) return false;
            if (!string.IsNullOrWhiteSpace(_config["Momo:PartnerCode"]) && callback.PartnerCode != _config["Momo:PartnerCode"]) return false;
            var payment = await _paymentRepo.GetByTransactionRefAsync(callback.OrderId);
            if (payment == null || payment.Amount != callback.Amount) return false;
            if (payment.ProviderRequestId != null && payment.ProviderRequestId != callback.RequestId) return false;
            if (callback.ResultCode != 0) { await _paymentRepo.MarkPendingPaymentFailedAsync(payment.Id); return true; }
            var order = await _paymentRepo.GetOrderSnapshotAsync(payment.OrderId);
            if (order == null || order.TotalAmount != callback.Amount) return false;
            try
            {
                if (order.OrderType == "pos") await _checkout.ConfirmAsync(order.Id, receivedAmount, callback.OrderId!, momo: true);
                else await _online.ConfirmAsync(order.Id, receivedAmount, callback.OrderId!, momo: true);
                await _notifications.PublishAsync("OrderStatusChanged", new { orderId = order.Id });
                return true;
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException) { return false; }
        }

        public async Task<PaymentResponseDTO?> GetByOrderIdAsync(int orderId)
        {
            var payment = await _paymentRepo.GetByOrderIdAsyncVer2(orderId);

            if (payment == null)
                return null;

            return new PaymentResponseDTO(
                method: payment.Method,
                transaction_ref: payment.TransactionRef,
                status: payment.Status
            );
        }

    

    }
}








