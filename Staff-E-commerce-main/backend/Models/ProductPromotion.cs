using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace backend.Models;

[Table("product_promotions")]
public class ProductPromotion
{
    [Key, Column("id")] public int Id { get; set; }
    [Column("promotion_id")] public int PromotionId { get; set; }
    [Column("product_id")] public int ProductId { get; set; }
    public Promotion? Promotion { get; set; }
}
