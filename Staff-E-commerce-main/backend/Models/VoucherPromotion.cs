using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace backend.Models;

[Table("voucher_promotions")]
public class VoucherPromotion
{
    [Key, Column("id")] public int Id { get; set; }
    [Column("promotion_id")] public int PromotionId { get; set; }
    [Column("voucher_code"), StringLength(50)] public string VoucherCode { get; set; } = string.Empty;
    public Promotion? Promotion { get; set; }
}
