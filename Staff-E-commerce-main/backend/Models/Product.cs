using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace backend.Models
{
    [Index(nameof(Sku), IsUnique = true, Name = "ux_products_sku")]
    // [Index(nameof(Barcode), IsUnique = true, Name = "ux_products_barcode")]
    [Index(nameof(CategoryId), Name = "idx_products_category")]
    [Index(nameof(SupplierId), Name = "idx_products_supplier")]
    [Table("products")]

    public class Product
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Column("sku")]
        [StringLength(100)]
        public string? Sku { get; set; }

        [Required]
        [Column("product_name")]
        [StringLength(255)]
        public string ProductName { get; set; } = string.Empty;

        [Column("barcode")]
        [StringLength(191)]
        public string? Barcode { get; set; }

        // FK -> categories.id
        [Column("category_id")]
        public int? CategoryId { get; set; }

        // FK -> suppliers.id
        [Column("supplier_id")]
        public int? SupplierId { get; set; }

        [Column("price", TypeName = "decimal(12,2)")]
        public decimal Price { get; set; } = 0m;

        [Column("cost", TypeName = "decimal(12,2)")]
        public decimal? Cost { get; set; }

        [Column("unit_id")]
        public int? UnitId { get; set; }

        [Column("description")]
        public string? Description { get; set; }

        [Column("image_url")]
        [StringLength(1024)]
        public string? ImageUrl { get; set; }

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("updated_at")]
        public DateTime UpdatedAt { get; set; }

        // Navigation properties
        [ForeignKey(nameof(CategoryId))]
        public virtual Category? Category { get; set; }

        [ForeignKey(nameof(SupplierId))]
        public virtual Supplier? Supplier { get; set; }

        [ForeignKey(nameof(UnitId))]
        public virtual Unit? Unit { get; set; }

        // 1 product có 1 inventory record (theo schema)
        public virtual Inventory? Inventory { get; set; }

        // 1 product có thể xuất hiện trong nhiều order_items
        public virtual ICollection<OrderItem> OrderItems { get; set; } = new List<OrderItem>();

        // nếu bạn muốn track điều chỉnh tồn kho liên quan đến product
        public virtual ICollection<InventoryAdjustment>? InventoryAdjustments { get; set; }
    }
}