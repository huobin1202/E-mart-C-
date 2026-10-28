using backend.Data;
using backend.DTO;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Repository;

public sealed class InvoiceRepository
{
    private readonly AppDbContext _context;
    public InvoiceRepository(AppDbContext context) => _context = context;

    public Task<Invoice?> GetByOrderIdWithItemsAsync(int orderId) => _context.Invoices
        .Include(i => i.Items)
        .FirstOrDefaultAsync(i => i.OrderId == orderId);

    public Task<Order?> GetOrderForInvoiceAsync(int orderId) => _context.Orders
        .Include(o => o.Customer)
        .Include(o => o.User)
        .Include(o => o.OrderItems).ThenInclude(i => i.Product)
        .FirstOrDefaultAsync(o => o.Id == orderId);

    public async Task<Invoice> AddAsync(Invoice invoice)
    {
        _context.Invoices.Add(invoice);
        await _context.SaveChangesAsync();
        return invoice;
    }

    public Task<Invoice?> GetByOrderIdAsync(int orderId) => _context.Invoices
        .FirstOrDefaultAsync(i => i.OrderId == orderId);

    public Task<Order?> GetOrderStatusAsync(int orderId) => _context.Orders
        .FirstOrDefaultAsync(o => o.Id == orderId);

    public Task<List<InvoiceDTO>> GetCompletedInvoiceDtosAsync() => _context.Invoices
        .AsNoTracking()
        .Where(i => i.Order != null && i.Order.Status == "completed")
        .OrderByDescending(i => i.IssuedAt)
        .Select(i => new InvoiceDTO
        {
            InvoiceId = i.Id,
            EmployeeId = i.EmployeeId,
            CustomerId = i.CustomerId,
            OrderId = i.OrderId,
            InvoiceNumber = i.InvoiceNumber,
            OrderNumber = i.Order != null ? i.Order.OrderNumber : "",
            OrderStatus = i.Order != null ? i.Order.Status : "",
            InvoiceStatus = i.InvoiceStatus,
            IssuedAt = i.IssuedAt,
            PaymentStatus = i.PaymentStatus,
            PaymentMethod = i.PaymentMethod,
            Subtotal = i.Subtotal,
            Discount = i.DiscountAmount,
            TaxAmount = i.TaxAmount,
            FeeAmount = i.ShippingFee,
            TotalAmount = i.TotalAmount,
            CustomerName = i.CustomerName,
            CustomerPhone = i.CustomerPhone,
            CustomerEmail = i.CustomerEmail
        }).ToListAsync();

    public Task<Invoice?> GetDetailByOrderIdAsync(int orderId) => _context.Invoices
        .AsNoTracking()
        .Include(i => i.Items)
        .Include(i => i.Order)
        .FirstOrDefaultAsync(i => i.OrderId == orderId);

    public Task SaveChangesAsync() => _context.SaveChangesAsync();
}
