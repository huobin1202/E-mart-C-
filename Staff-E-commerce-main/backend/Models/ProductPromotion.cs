using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace backend.Models;

[Table("product_promotions")]
public class ProductPromotion
{
    [DatabaseGenerated(DatabaseGeneratedOption.Identity), Column("id")] public int Id { get; set; }
    [Column("promotion_id")] public int PromotionId { get; set; }
    [Column("product_id")] public int ProductId { get; set; }
    [Column("discount_percent", TypeName = "decimal(5,2)")] public decimal? DiscountPercent { get; set; }
    public Promotion? Promotion { get; set; }
}
