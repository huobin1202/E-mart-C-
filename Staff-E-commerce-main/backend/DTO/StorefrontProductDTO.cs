namespace backend.DTO;

public sealed class StorefrontProductDTO
{
    public int Id { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? CategoryId { get; set; }
    public string? CategoryName { get; set; }
    public decimal Price { get; set; }
    public decimal OriginalPrice { get; set; }
    public string? UnitName { get; set; }
    public int StockQuantity { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal DiscountPercent { get; set; }
    public string? PromotionName { get; set; }
    public DateTime? PromotionEndsAt { get; set; }
    public string? ImageUrl { get; set; }
}

public sealed class StorefrontProductPromotionDTO
{
    public int ProductId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string DiscountType { get; set; } = string.Empty;
    public decimal Value { get; set; }
    public decimal? MaxDiscount { get; set; }
    public DateTime? EndDate { get; set; }
}
