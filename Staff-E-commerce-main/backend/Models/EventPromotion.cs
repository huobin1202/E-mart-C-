using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace backend.Models;

[Table("event_promotions")]
public class EventPromotion
{
    [Key, Column("id")] public int Id { get; set; }
    [Column("promotion_id")] public int PromotionId { get; set; }
    [Column("min_order_amount", TypeName = "decimal(12,2)")] public decimal MinOrderAmount { get; set; }
    public Promotion? Promotion { get; set; }
}
