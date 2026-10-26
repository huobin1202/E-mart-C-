using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace backend.Models
{
    [Table("payments")]
    [Index(nameof(OrderId), Name = "idx_payments_order")]
    public class Payment
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Column("order_id")]
        public int OrderId { get; set; }

        [Column("amount", TypeName = "decimal(12,2)")]
        public decimal Amount { get; set; } = 0m;

        // store as string to match ENUM in DB
        [Column("method")]
        [StringLength(50)]
        public string Method { get; set; } = "cash";

        [Column("transaction_ref")]
        [StringLength(255)]
        public string? TransactionRef { get; set; }
        [Column("pay_url"), StringLength(2048)] public string? PayUrl { get; set; }
        [Column("provider_request_id"), StringLength(100)] public string? ProviderRequestId { get; set; }

        [Column("status")]
        [StringLength(50)]
        public string Status { get; set; } = "completed";

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        // Navigation
        [ForeignKey(nameof(OrderId))]
        public virtual Order? Order { get; set; }
    }
}
