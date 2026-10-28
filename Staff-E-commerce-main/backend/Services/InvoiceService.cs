using backend.DTO;
using backend.Helpers;
using backend.Models;
using backend.Repository;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

public sealed class InvoiceService
{
    private readonly InvoiceRepository _repository;
    private readonly BusMemoryCache<InvoiceDTO> _cache;
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(15);

    public InvoiceService(InvoiceRepository repository, BusMemoryCache<InvoiceDTO> cache)
    {
        _repository = repository;
        _cache = cache;
    }

    public async Task<Invoice?> EnsureInvoiceForOrderAsync(int orderId)
    {
        var existing = await _repository.GetByOrderIdWithItemsAsync(orderId);
        if (existing is not null) return existing;

        var order = await _repository.GetOrderForInvoiceAsync(orderId);
        if (order is null || order.Status == "cancelled" ||
            !(order.Status is "processing" or "completed" || order.PaymentStatus == "paid"))
            return null;

        var now = DateTime.UtcNow;
        var invoice = new Invoice
        {
            OrderId = order.Id,
            EmployeeId = order.User?.EmployeeId,
            CustomerId = order.CustomerId,
            InvoiceNumber = "HD-" + order.OrderNumber,
            InvoiceStatus = "issued",
            PaymentStatus = order.PaymentStatus,
            PaymentMethod = order.PaymentMethod,
            CustomerName = order.Customer?.FullName ?? "Khách lẻ",
            CustomerPhone = order.Customer?.Phone,
            CustomerEmail = order.Customer?.Email,
            CustomerAddress = order.Customer?.Address,
            Subtotal = order.Subtotal,
            DiscountAmount = order.Discount,
            TotalAmount = order.TotalAmount,
            IssuedAt = now,
            UpdatedAt = now,
            Items = order.OrderItems.GroupBy(item => item.ProductId).Select(group =>
            {
                var first = group.First();
                var quantity = group.Sum(item => item.Quantity);
                var totalPrice = group.Sum(item => item.TotalPrice);
                return new InvoiceItem
                {
                    ProductId = group.Key,
                    ProductName = first.Product?.ProductName ?? "Sản phẩm",
                    Sku = first.Product?.Sku,
                    Quantity = quantity,
                    UnitPrice = quantity == 0 ? first.UnitPrice
                        : decimal.Round(totalPrice / quantity, 2, MidpointRounding.AwayFromZero),
                    TotalPrice = totalPrice
                };
            }).ToList()
        };

        try
        {
            var created = await _repository.AddAsync(invoice);
            _cache.AddOrUpdate(MapSummary(created, order), item => item.InvoiceId);
            return created;
        }
        catch (DbUpdateException)
        {
            var concurrentInvoice = await _repository.GetByOrderIdWithItemsAsync(orderId);
            if (concurrentInvoice is not null) return concurrentInvoice;
            throw;
        }
    }

    public async Task SyncOrderLifecycleAsync(int orderId)
    {
        var order = await _repository.GetOrderStatusAsync(orderId);
        if (order is null) return;
        var invoice = await _repository.GetByOrderIdAsync(orderId);

        if (order.Status == "cancelled")
        {
            if (invoice is not null && invoice.InvoiceStatus != "refunded")
            {
                invoice.InvoiceStatus = "voided";
                invoice.UpdatedAt = DateTime.UtcNow;
                await _repository.SaveChangesAsync();
            }
            return;
        }

        if (order.PaymentStatus == "refunded" || order.Status == "refunded")
        {
            if (invoice is not null)
            {
                invoice.InvoiceStatus = "refunded";
                invoice.PaymentStatus = "refunded";
                invoice.UpdatedAt = DateTime.UtcNow;
                await _repository.SaveChangesAsync();
            }
            return;
        }

        if (order.Status is "processing" or "completed" || order.PaymentStatus == "paid")
            invoice = await EnsureInvoiceForOrderAsync(orderId);
        if (invoice is null) return;

        invoice.PaymentStatus = order.PaymentStatus;
        invoice.PaymentMethod = order.PaymentMethod;
        if (order.PaymentStatus == "paid") invoice.InvoiceStatus = "paid";
        else if (invoice.InvoiceStatus == "paid") invoice.InvoiceStatus = "issued";
        invoice.UpdatedAt = DateTime.UtcNow;
        await _repository.SaveChangesAsync();
        _cache.AddOrUpdate(MapSummary(invoice, order), item => item.InvoiceId);
    }

    public async Task<PagedResult<InvoiceDTO>> GetInvoicesAsync(
        int page, int pageSize, DateTime? from, DateTime? to,
        string? paymentStatus, string? customerSearch = null)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var (items, _) = await _cache.GetOrCreateAsync(
            () => _repository.GetCompletedInvoiceDtosAsync(), CacheTtl);

        IEnumerable<InvoiceDTO> filtered = items;
        if (from.HasValue) filtered = filtered.Where(i => i.IssuedAt >= from.Value);
        if (to.HasValue) filtered = filtered.Where(i => i.IssuedAt < to.Value.Date.AddDays(1));
        if (!string.IsNullOrWhiteSpace(paymentStatus))
            filtered = filtered.Where(i => string.Equals(i.PaymentStatus, paymentStatus, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(customerSearch))
        {
            var keyword = customerSearch.Trim();
            filtered = filtered.Where(i =>
                (i.CustomerName?.Contains(keyword, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (i.CustomerPhone?.Contains(keyword, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (i.CustomerEmail?.Contains(keyword, StringComparison.OrdinalIgnoreCase) ?? false));
        }

        var ordered = filtered.OrderByDescending(i => i.IssuedAt).ToList();
        var total = ordered.Count;
        return new PagedResult<InvoiceDTO>
        {
            Items = ordered.Skip((page - 1) * pageSize).Take(pageSize).ToList(),
            TotalItems = total,
            PageNumber = page,
            PageSize = pageSize,
            TotalPages = (int)Math.Ceiling(total / (double)pageSize)
        };
    }

    public async Task<InvoiceDTO?> GetInvoiceAsync(int orderId)
    {
        var invoice = await _repository.GetDetailByOrderIdAsync(orderId);
        if (invoice is null) return null;
        var delivery = invoice.Order is null ? null : OrderDeliveryDetails.FromOrder(invoice.Order);
        return new InvoiceDTO
        {
            InvoiceId = invoice.Id,
            EmployeeId = invoice.EmployeeId,
            CustomerId = invoice.CustomerId,
            OrderId = invoice.OrderId,
            InvoiceNumber = invoice.InvoiceNumber,
            OrderNumber = invoice.Order?.OrderNumber ?? "",
            OrderStatus = invoice.Order?.Status ?? "",
            InvoiceStatus = invoice.InvoiceStatus,
            IssuedAt = invoice.IssuedAt,
            PaymentStatus = invoice.PaymentStatus,
            PaymentMethod = invoice.PaymentMethod,
            Subtotal = invoice.Subtotal,
            Discount = invoice.DiscountAmount,
            TaxAmount = invoice.TaxAmount,
            FeeAmount = invoice.ShippingFee,
            TotalAmount = invoice.TotalAmount,
            CustomerName = invoice.CustomerName,
            CustomerPhone = invoice.CustomerPhone,
            CustomerEmail = invoice.CustomerEmail,
            CustomerAddress = invoice.CustomerAddress,
            RecipientName = delivery?.Name,
            RecipientPhone = delivery?.Phone,
            ShippingAddress = delivery?.Address,
            Items = invoice.Items.Select(x => new InvoiceItemDTO
            {
                ProductName = x.ProductName,
                Sku = x.Sku,
                Quantity = x.Quantity,
                UnitPrice = x.UnitPrice,
                TotalPrice = x.TotalPrice
            }).ToList()
        };
    }

    private static InvoiceDTO MapSummary(Invoice invoice, Order order) => new()
    {
        InvoiceId = invoice.Id,
        EmployeeId = invoice.EmployeeId,
        CustomerId = invoice.CustomerId,
        OrderId = invoice.OrderId,
        InvoiceNumber = invoice.InvoiceNumber,
        OrderNumber = order.OrderNumber,
        OrderStatus = order.Status,
        InvoiceStatus = invoice.InvoiceStatus,
        IssuedAt = invoice.IssuedAt,
        PaymentStatus = invoice.PaymentStatus,
        PaymentMethod = invoice.PaymentMethod,
        Subtotal = invoice.Subtotal,
        Discount = invoice.DiscountAmount,
        TaxAmount = invoice.TaxAmount,
        FeeAmount = invoice.ShippingFee,
        TotalAmount = invoice.TotalAmount,
        CustomerName = invoice.CustomerName,
        CustomerPhone = invoice.CustomerPhone,
        CustomerEmail = invoice.CustomerEmail
    };
}
