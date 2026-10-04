using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace backend.Models
{
    [Table("orders")]
    [Index(nameof(OrderNumber), IsUnique = true, Name = "ux_orders_order_number")]
    [Index(nameof(CustomerId), Name = "idx_orders_customer")]
    [Index(nameof(UserId), Name = "idx_orders_user")]
    [Index(nameof(Status), Name = "idx_orders_status")]
    public class Order
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Required]
        [Column("order_number")]
        [StringLength(100)]
        public string OrderNumber { get; set; } = string.Empty;

        [Column("customer_id")]
        public int? CustomerId { get; set; }

        [Column("user_id")]
        public int? UserId { get; set; }

        [Column("order_type")]
        [StringLength(20)]
        public string OrderType { get; set; } = "pos";

        // Use string to match DB ENUM; alternatively use enum + conversion
        [Column("status")]
        [StringLength(50)]
        public string Status { get; set; } = "pending";

        [Column("subtotal", TypeName = "decimal(12,2)")]
        public decimal Subtotal { get; set; } = 0m;

        [Column("discount", TypeName = "decimal(12,2)")]
        public decimal Discount { get; set; } = 0m;

        [Column("total_amount", TypeName = "decimal(12,2)")]
        public decimal TotalAmount { get; set; } = 0m;

        [Column("payment_method")]
        [StringLength(20)]
        public string? PaymentMethod { get; set; }

        [Column("payment_status")]
        [StringLength(20)]
        public string PaymentStatus { get; set; } = "pending";

        [Column("promotion_id")]
        public int? PromotionId { get; set; }

        [Column("note")]
        public string? Note { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("updated_at")]
        public DateTime UpdatedAt { get; set; }

        // Navigation
        [ForeignKey(nameof(CustomerId))]
        public virtual Customer? Customer { get; set; }

        [ForeignKey(nameof(UserId))]
        public virtual User? User { get; set; }

        [ForeignKey(nameof(PromotionId))]
        public virtual Promotion? Promotion { get; set; }

        public virtual ICollection<OrderItem> OrderItems { get; set; } = new List<OrderItem>();

        public virtual ICollection<Payment> Payments { get; set; } = new List<Payment>();
    }
}
