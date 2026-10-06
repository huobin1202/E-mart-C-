using System;
using System.Text.Json.Serialization;


namespace backend.DTO
{
    public class InventoryDTO
    {
        public int ProductId { get; set; }
        public int Quantity { get; set; } = 0;
        public DateTime? LastCheckedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    public class InventoryListDTO
    {
        public int Id { get; set; }
        public int ProductId { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public string? Sku { get; set; }
        public string? ImageUrl { get; set; }
        public int Quantity { get; set; }
        public DateTime? LastCheckedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public string? CategoryName { get; set; }
        public decimal? Price { get; set; }
        public string? Unit { get; set; }
    }

    public class AdjustInventoryDTO
    {
        public int InventoryId { get; set; }
        public int NewQuantity { get; set; }
        public string? Reason { get; set; }
    }

    public class InventoryStatsDTO
    {
        public int Total { get; set; }
        public int OutOfStock { get; set; }
        public int LowStock { get; set; }
        public int InStock { get; set; }
    }

    public class InventoryAdjustmentDTO
    {
        public int Id { get; set; }
        public int ProductId { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public string? Sku { get; set; }
        public int ChangeAmount { get; set; }
        public string? Reason { get; set; }
        public int? UserId { get; set; }
        public string? UserName { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
