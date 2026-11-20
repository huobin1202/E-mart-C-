using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace backend.Models
{
    [Table("customers")]
    [Index(nameof(Phone), IsUnique = true, Name = "ux_customers_phone")]
    [Index(nameof(Email), IsUnique = true, Name = "ux_customers_email")]
    public class Customer
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Required]
        [Column("full_name")]
        [StringLength(255)]
        public string FullName { get; set; } = string.Empty;

        [Column("phone")]
        [StringLength(50)]
        public string? Phone { get; set; }

        [Column("email")]
        [StringLength(255)]
        public string? Email { get; set; }

        [Column("address")]
        public string? Address { get; set; }

        [Column("reward_points")]
        public int RewardPoints { get; set; } = 0;

        [Column("note")]
        public string? Note { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("updated_at")]
        public DateTime UpdatedAt { get; set; }

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        // Navigation: one customer -> many orders, many promotion redemptions, many point histories
        public virtual ICollection<Order>? Orders { get; set; }
        public virtual ICollection<PromotionRedemption>? PromotionRedemptions { get; set; }
    }
}
