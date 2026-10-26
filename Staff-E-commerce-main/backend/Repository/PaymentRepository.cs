using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Repository
{
    public class PaymentRepository
    {
        private readonly AppDbContext _context;

        public PaymentRepository(AppDbContext context)
        {
            _context = context;
        }

        public Task<Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction> BeginSalesTransactionAsync() => SalesTransaction.BeginAsync(_context);
        public Task<Payment?> GetPendingMomoAsync(int orderId) => _context.Payments.AsNoTracking()
            .Where(p => p.OrderId == orderId && p.Method == "other" && p.Status == "pending")
            .OrderByDescending(p => p.Id).FirstOrDefaultAsync();
        public Task SetPayUrlAsync(int id, string url) => _context.Payments.Where(p => p.Id == id && p.Status == "pending")
            .ExecuteUpdateAsync(u => u.SetProperty(p => p.PayUrl, url));

        // Các phương thức liên quan sẽ được triển khai ở đây.
        // 1. Thêm bản ghi payment mới vào cơ sở dữ liệu
        public async Task<Payment> AddPaymentAsync(Payment payment)
        {
            _context.Payments.Add(payment);
            await _context.SaveChangesAsync();
            return payment;
        }

        // 2. Lấy payment theo Id đơn hàng (OrderId)
        public async Task<Payment?> GetByOrderIdAsync(int orderId)
        {
            return await _context.Payments
                .FirstOrDefaultAsync(p => p.OrderId == orderId);
        }

        // 3. Cập nhật trạng thái thanh toán
        public async Task UpdatePaymentStatusAsync(int paymentId, string status)
        {
            var payment = await _context.Payments.FindAsync(paymentId);
            if (payment != null)
            {
                payment.Status = status;
                await _context.SaveChangesAsync();
            }
        }

        //Lấy max Id
        public int GetMaxId()
        {
            return _context.Payments.Any() 
                ? _context.Payments.Max(p => p.Id) 
                : 0;
        }
        
        public async Task<Payment?> UpdatePaymentAsync(Payment payment)
        {
            var existingPayment = await _context.Payments.FindAsync(payment.Id);
            if (existingPayment == null)
                return null;

            // Cập nhật các trường cần thiết
            existingPayment.OrderId = payment.OrderId;
            existingPayment.Amount = payment.Amount;
            existingPayment.Method = payment.Method;
            existingPayment.TransactionRef = payment.TransactionRef;
            existingPayment.Status = payment.Status;


            await _context.SaveChangesAsync();
            return existingPayment;
        }

        public async Task<Payment?> GetByOrderIdAsyncVer2(int orderId)
        {
            return await _context.Payments
                .FirstOrDefaultAsync(p => p.OrderId == orderId);
        }

        public Task<bool> IsLockedPosOrderAsync(int orderId)
        {
            return _context.Orders.AnyAsync(o => o.Id == orderId && o.OrderType == "pos");
        }

        public Task<Order?> GetOrderSnapshotAsync(int orderId)
        {
            return _context.Orders.AsNoTracking().SingleOrDefaultAsync(o => o.Id == orderId);
        }

        public Task<Payment?> GetByTransactionRefAsync(string? transactionRef)
        {
            return _context.Payments.AsNoTracking().FirstOrDefaultAsync(p => p.TransactionRef == transactionRef);
        }

        public async Task MarkPendingPaymentFailedAsync(int paymentId)
        {
            await _context.Payments
                .Where(p => p.Id == paymentId && p.Status == "pending")
                .ExecuteUpdateAsync(update => update.SetProperty(p => p.Status, "failed"));
        }

    
    }
}
