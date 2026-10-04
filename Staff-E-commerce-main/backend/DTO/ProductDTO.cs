using System;
using System.Text.Json.Serialization;

namespace backend.DTO
{
    public class ProductDTO
    {
        public int Id { get; set; }

        public string? Sku { get; set; }

        public string ProductName { get; set; } = string.Empty;

        // public string? Barcode { get; set; }

        public int? CategoryId { get; set; }

        public int? SupplierId { get; set; }

        // Money values use decimal
        public decimal Price { get; set; }

        public decimal? Cost { get; set; }

        public int? UnitId { get; set; }

        public string? UnitName { get; set; }

        public string? UnitCode { get; set; }

        public string? Description { get; set; }

        // [JsonPropertyName("image_url")]
        public string? ImageUrl { get; set; }

        public bool IsActive { get; set; } = true;

        [JsonPropertyName("created_at")]
        public DateTime? CreatedAt { get; set; }

        [JsonPropertyName("updated_at")]
        public DateTime? UpdatedAt { get; set; }

        // Navigation / embedded DTOs (optional)
        public CategoryDTO? Category { get; set; }
        public SupplierDTO? Supplier { get; set; }

        // Inventory snapshot (optional, filled by query/join)
        public InventoryDTO? Inventory { get; set; }

        // Aggregated rating info (optional)
        public double AverageRating { get; set; } = 0.0;
        public int ReviewCount { get; set; } = 0;
    }
}
