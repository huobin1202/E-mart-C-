using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace backend.Models
{
    [Table("promotions")]
    [Index(nameof(Code), IsUnique = true, Name = "ux_promotions_code")]
    public class Promotion
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Required]
        [Column("code")]
        [StringLength(100)]
        public string Code { get; set; } = string.Empty;

        // Campaign kind: product, event, or voucher.
        [Column("type")]
        [StringLength(20)]
        public string Type { get; set; } = "event";

        [Column("discount_type")]
        [StringLength(10)]
        public string DiscountType { get; set; } = "percent";

        [Column("discount_value", TypeName = "decimal(12,2)")]
        public decimal Value { get; set; } = 0m;

        [Column("max_discount", TypeName = "decimal(12,2)")]
        public decimal? MaxDiscount { get; set; }

        [Column("start_date")]
        public DateTime? StartDate { get; set; }

        [Column("end_date")]
        public DateTime? EndDate { get; set; }

        [Column("usage_limit")]
        public int? UsageLimit { get; set; }

        [Column("used_count")]
        public int UsedCount { get; set; } = 0;

        [Column("name")]
        [StringLength(150)]
        public string Name { get; set; } = string.Empty;

        [Column("status")]
        [StringLength(20)]
        public string Status { get; set; } = "active";

        [NotMapped]
        public bool Active { get => Status == "active"; set => Status = value ? "active" : "disabled"; }

        [NotMapped]
        public decimal MinOrderAmount { get; set; }

        [NotMapped]
        public string? VoucherCode { get; set; }

        [NotMapped]
        public List<int> ProductIds { get; set; } = new();

        [Column("description")]
        [StringLength(1000)]
        public string? Description { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("updated_at")]
        public DateTime UpdatedAt { get; set; }

        // Soft delete
        [Column("is_deleted")]
        public bool IsDeleted { get; set; } = false;

        [Column("deleted_at")]
        public DateTime? DeletedAt { get; set; }

        // Navigation
        public virtual ICollection<Order>? Orders { get; set; }
        public virtual ICollection<PromotionRedemption>? Redemptions { get; set; }
        public virtual EventPromotion? EventDetails { get; set; }
        public virtual VoucherPromotion? VoucherDetails { get; set; }
        public virtual ICollection<ProductPromotion>? ProductDetails { get; set; }
    }
}
