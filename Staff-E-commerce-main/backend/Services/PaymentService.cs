using backend.DTO;
using backend.Models;
using backend.Repository;
using Newtonsoft.Json;
using System.Security.Cryptography;
using System.Text;

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

        // Hàm lưu một payment nếu là thanh toán trực tiếp 
        // Lưu Payment (Cash, Card, ECard,...)
        public async Task<Payment> CreatePaymentAsync(Payment payment)
        {
            if (await _paymentRepo.IsLockedPosOrderAsync(payment.OrderId))
                throw new ArgumentException("Đơn POS phải thanh toán qua nghiệp vụ chốt đơn.");
            // The POS request does not send CreatedAt. Avoid DateTime.MinValue,
            // which SQL Server's datetime column cannot store.
            if (payment.CreatedAt == default)
                payment.CreatedAt = DateTime.UtcNow;

            return await _paymentRepo.AddPaymentAsync(payment);
        }

        public PaymentService(PaymentRepository paymentRepo, OrderRepository orderRepo, ActivityLogService logService, IConfiguration config, InvoiceService invoiceService, PosCheckoutService checkout)
        {
            _paymentRepo = paymentRepo;
            _orderRepo = orderRepo;
            _logService = logService;
            _config = config;
            _invoiceService = invoiceService;
            _checkout = checkout;
        }

        private string SignSHA256(string message, string key)
        {
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(key));
            return BitConverter.ToString(hmac.ComputeHash(Encoding.UTF8.GetBytes(message))).Replace("-", "").ToLower();
        }

        public async Task<MomoPaymentResponseDTO> CreatePaymentAsync(MomoPaymentRequestDTO req)
        {
            var order = await _paymentRepo.GetOrderSnapshotAsync(req.OrderId)
                ?? throw new ArgumentException("Không tìm thấy đơn hàng.");
            if (order.PaymentStatus != "pending" || order.Status is "cancelled" or "refunded" || order.PaymentMethod != "e_wallet")
                throw new ArgumentException("Đơn không còn chờ thanh toán MoMo.");
            req.Amount = order.TotalAmount;
            if (req.Amount != decimal.Truncate(req.Amount))
                throw new ArgumentException("Thanh toán MoMo yêu cầu số tiền nguyên đồng. Vui lòng kiểm tra giá sản phẩm.");
            string endpoint = _config["Momo:Endpoint"];
            string partnerCode = _config["Momo:PartnerCode"];
            string accessKey = _config["Momo:AccessKey"];
            string secretKey = _config["Momo:SecretKey"];
            string redirectUrl = req.ReturnUrl;
            string ipnUrl = req.NotifyUrl;


            // MoMo yêu cầu orderId và requestId dạng string
            string orderId = $"order_{req.OrderId}_{Guid.NewGuid():N}";
            string requestId = "req_" + Guid.NewGuid().ToString("N");
            string orderInfo = $"Thanh toán đơn hàng {req.OrderId}";
            string amountStr = Math.Round(req.Amount).ToString("0");

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

            // Persist the attempt before contacting MoMo so a delayed callback can still be matched.
            var payment = new Payment { OrderId = req.OrderId, Amount = req.Amount, Method = "other", TransactionRef = orderId, Status = "pending", CreatedAt = DateTime.UtcNow };
            await _paymentRepo.AddPaymentAsync(payment);
            using var client = new HttpClient();
            var resp = await client.PostAsync(endpoint, new StringContent(JsonConvert.SerializeObject(body), Encoding.UTF8, "application/json"));
            var content = await resp.Content.ReadAsStringAsync();
            Console.WriteLine("MoMo Response: " + content);

            dynamic json = JsonConvert.DeserializeObject(content);
            string payUrl = json?.payUrl ?? "";
            bool success = !string.IsNullOrEmpty(payUrl);

            // Lưu payment vào DB
            // A callback may already have completed this attempt; never overwrite its status.
            if (!success)
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
            if (callback.Signature != expected)
            {
                return false;
            }

            if (callback.ResultCode == 0)
            {
                // Cập nhật payment + order
                var payment = await _paymentRepo.GetByTransactionRefAsync(callback.OrderId);
                if (payment != null)
                {
                    var pendingOrder = await _paymentRepo.GetOrderSnapshotAsync(payment.OrderId)
                        ?? throw new InvalidOperationException("Không tìm thấy đơn hàng thanh toán.");
                    if (!decimal.TryParse(callback.Amount.ToString(), out var received) || received != payment.Amount || received != pendingOrder.TotalAmount)
                        return false;
                    if (pendingOrder.OrderType == "pos")
                    {
                        try { await _checkout.ConfirmAsync(payment.OrderId, received, callback.OrderId!, momo: true); return true; }
                        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException) { return false; }
                    }
                    if (pendingOrder.Status is "cancelled" or "refunded") return false;
                    if (payment.Status == "completed") return true;
                    payment.Status = "completed";
                    await _paymentRepo.UpdatePaymentAsync(payment);

                    var order = await _orderRepo.GetByIdAsync(payment.OrderId);
                    if (order != null)
                    {
                        var newStatus = order.OrderType == "pos" ? "completed" : (order.Status == "pending" ? "processing" : order.Status);
                        await _orderRepo.UpdateOrderPaymentAsync(order.Id, "paid", newStatus);
                        await _invoiceService.SyncOrderLifecycleAsync(order.Id);
                    }

                    await _logService.LogAsync(
                        pendingOrder.UserId ?? 0,
                        "PAYMENT_SUCCESS",
                        "Payment",
                        payment.Id.ToString(),
                        null,
                        "system");
                }
                else return false;
            }

            return true;
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








