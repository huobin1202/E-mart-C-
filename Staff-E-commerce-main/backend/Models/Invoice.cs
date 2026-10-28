using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace backend.Models;

[Table("invoices")]
public class Invoice
{
    [Key, Column("id")] public int Id { get; set; }
    [Column("order_id")] public int OrderId { get; set; }
    [Column("employee_id")] public int? EmployeeId { get; set; }
    [Column("customer_id")] public int? CustomerId { get; set; }
    [Required, StringLength(120), Column("invoice_number")] public string InvoiceNumber { get; set; } = "";
    [StringLength(20), Column("invoice_status")] public string InvoiceStatus { get; set; } = "issued";
    [StringLength(20), Column("payment_status")] public string PaymentStatus { get; set; } = "pending";
    [StringLength(20), Column("payment_method")] public string? PaymentMethod { get; set; }
    [StringLength(255), Column("customer_name")] public string CustomerName { get; set; } = "Khách lẻ";
    [StringLength(50), Column("customer_phone")] public string? CustomerPhone { get; set; }
    [StringLength(255), Column("customer_email")] public string? CustomerEmail { get; set; }
    [Column("customer_address")] public string? CustomerAddress { get; set; }
    [Column("subtotal", TypeName = "decimal(12,2)")] public decimal Subtotal { get; set; }
    [Column("tax_amount", TypeName = "decimal(12,2)")] public decimal TaxAmount { get; set; }
    [Column("shipping_fee", TypeName = "decimal(12,2)")] public decimal ShippingFee { get; set; }
    [Column("discount_amount", TypeName = "decimal(12,2)")] public decimal DiscountAmount { get; set; }
    [Column("total_amount", TypeName = "decimal(12,2)")] public decimal TotalAmount { get; set; }
    [Column("issued_at")] public DateTime IssuedAt { get; set; }
    [Column("updated_at")] public DateTime UpdatedAt { get; set; }
    public Order? Order { get; set; }
    public Employee? Employee { get; set; }
    public Customer? Customer { get; set; }
    public ICollection<InvoiceItem> Items { get; set; } = new List<InvoiceItem>();
}

[Table("invoice_items")]
public class InvoiceItem
{
    [DatabaseGenerated(DatabaseGeneratedOption.Identity), Column("id")] public int Id { get; set; }
    [Column("invoice_id")] public int InvoiceId { get; set; }
    [Column("product_id")] public int ProductId { get; set; }
    [Required, StringLength(255), Column("product_name")] public string ProductName { get; set; } = "";
    [StringLength(100), Column("sku")] public string? Sku { get; set; }
    [Column("quantity")] public int Quantity { get; set; }
    [Column("unit_price", TypeName = "decimal(12,2)")] public decimal UnitPrice { get; set; }
    [Column("total_price", TypeName = "decimal(12,2)")] public decimal TotalPrice { get; set; }
    public Invoice? Invoice { get; set; }
}
