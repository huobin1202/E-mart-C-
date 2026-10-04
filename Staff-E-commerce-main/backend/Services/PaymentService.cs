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

        // Hàm lưu một payment nếu là thanh toán trực tiếp 
        // Lưu Payment (Cash, Card, ECard,...)
        public async Task<Payment> CreatePaymentAsync(Payment payment)
        {
            // The POS request does not send CreatedAt. Avoid DateTime.MinValue,
            // which SQL Server's datetime column cannot store.
            if (payment.CreatedAt == default)
                payment.CreatedAt = DateTime.UtcNow;

            return await _paymentRepo.AddPaymentAsync(payment);
        }

        public PaymentService(PaymentRepository paymentRepo, OrderRepository orderRepo, ActivityLogService logService, IConfiguration config)
        {
            _paymentRepo = paymentRepo;
            _orderRepo = orderRepo;
            _logService = logService;
            _config = config;
        }

        private string SignSHA256(string message, string key)
        {
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(key));
            return BitConverter.ToString(hmac.ComputeHash(Encoding.UTF8.GetBytes(message))).Replace("-", "").ToLower();
        }

        public async Task<MomoPaymentResponseDTO> CreatePaymentAsync(MomoPaymentRequestDTO req)
        {
            string endpoint = _config["Momo:Endpoint"];
            string partnerCode = _config["Momo:PartnerCode"];
            string accessKey = _config["Momo:AccessKey"];
            string secretKey = _config["Momo:SecretKey"];
            string redirectUrl = req.ReturnUrl;
            string ipnUrl = req.NotifyUrl;


            // MoMo yêu cầu orderId và requestId dạng string
            string orderId = "order_" + req.OrderId;
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

            using var client = new HttpClient();
            var resp = await client.PostAsync(endpoint, new StringContent(JsonConvert.SerializeObject(body), Encoding.UTF8, "application/json"));
            var content = await resp.Content.ReadAsStringAsync();
            Console.WriteLine("MoMo Response: " + content);

            dynamic json = JsonConvert.DeserializeObject(content);
            string payUrl = json?.payUrl ?? "";
            bool success = !string.IsNullOrEmpty(payUrl);

            // Lưu payment vào DB
            var payment = new Payment
            {
                OrderId = req.OrderId,
                Amount = req.Amount,
                Method = "other",
                TransactionRef = orderId,
                Status = success ? "pending" : "failed",
                CreatedAt = DateTime.UtcNow
            };
            await _paymentRepo.AddPaymentAsync(payment);

            

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
                await _logService.LogAsync(0, "INVALID_SIGNATURE", "Payment", callback.OrderId ?? "", "Chữ ký MoMo không hợp lệ", "system");
                return false;
            }

            if (callback.ResultCode == 0)
            {
                // Cập nhật payment + order
                var payment = await _paymentRepo.GetByOrderIdAsync(int.Parse(callback.OrderId.Replace("order_", "")));
                if (payment != null)
                {
                    payment.Status = "completed";
                    await _paymentRepo.UpdatePaymentAsync(payment);
                    await _orderRepo.UpdateOrderStatusAsync(payment.OrderId, "completed");
                    await _logService.LogAsync(payment.OrderId, "PAYMENT_SUCCESS", "Payment", payment.TransactionRef, JsonConvert.SerializeObject(callback), "system");
                }
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








