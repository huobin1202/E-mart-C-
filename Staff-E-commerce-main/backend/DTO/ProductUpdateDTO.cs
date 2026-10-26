using System.ComponentModel.DataAnnotations;

namespace backend.DTO;

// Writable product fields only. Inventory and transaction history have separate workflows.
public sealed class ProductUpdateDTO
{
    [Required, MaxLength(255)] public string ProductName { get; set; } = "";
    [MaxLength(100)] public string? Sku { get; set; }
    [MaxLength(191)] public string? Barcode { get; set; }
    public int? CategoryId { get; set; }
    public int? SupplierId { get; set; }
    public int? UnitId { get; set; }
    public decimal Price { get; set; }
    public decimal? Cost { get; set; }
    public string? Description { get; set; }
    [MaxLength(1024)] public string? ImageUrl { get; set; }
    public bool IsActive { get; set; } = true;
}
