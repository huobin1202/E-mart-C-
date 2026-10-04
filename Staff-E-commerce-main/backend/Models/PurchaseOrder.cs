using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace backend.Models;

[Table("purchase_orders")]
[Index(nameof(PoCode), IsUnique = true, Name = "ux_purchase_orders_po_code")]
[Index(nameof(SupplierId), Name = "idx_purchase_orders_supplier")]
[Index(nameof(UserId), Name = "idx_purchase_orders_user")]
public class PurchaseOrder
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Required]
    [Column("po_code")]
    [StringLength(20)]
    public string PoCode { get; set; } = string.Empty;

    [Column("supplier_id")]
    public int SupplierId { get; set; }

    [Column("user_id")]
    public int UserId { get; set; }

    [Column("total_amount", TypeName = "decimal(12,2)")]
    public decimal TotalAmount { get; set; }

    [Column("note")]
    public string? Note { get; set; }

    [Column("status")]
    [StringLength(20)]
    public string Status { get; set; } = "pending";

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    [ForeignKey(nameof(SupplierId))]
    public Supplier? Supplier { get; set; }

    [ForeignKey(nameof(UserId))]
    public User? User { get; set; }

    public ICollection<PurchaseOrderDetail> Details { get; set; } = new List<PurchaseOrderDetail>();
}
