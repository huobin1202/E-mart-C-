using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace backend.Models;

[Table("po_details")]
[Index(nameof(ProductId), Name = "idx_po_details_product")]
public class PurchaseOrderDetail
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("purchase_order_id")]
    public int PurchaseOrderId { get; set; }

    [Column("product_id")]
    public int ProductId { get; set; }

    [Column("quantity")]
    public int Quantity { get; set; }

    [Column("import_price", TypeName = "decimal(12,2)")]
    public decimal ImportPrice { get; set; }

    [DatabaseGenerated(DatabaseGeneratedOption.Computed)]
    [Column("subtotal", TypeName = "decimal(12,2)")]
    public decimal Subtotal { get; private set; }

    [ForeignKey(nameof(PurchaseOrderId))]
    public PurchaseOrder? PurchaseOrder { get; set; }

    [ForeignKey(nameof(ProductId))]
    public Product? Product { get; set; }
}
