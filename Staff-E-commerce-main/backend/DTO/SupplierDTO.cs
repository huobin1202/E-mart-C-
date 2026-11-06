using System;
using System.Text.Json.Serialization;

namespace backend.DTO
{
    public class SupplierDTO
    {
        public int Id { get; set; }
        public string SupplierCode { get; set; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        public string? ContactName { get; set; }
        public string? Phone { get; set; }
        public string? Email { get; set; }
        public string? Address { get; set; }
        public string? Region { get; set; }
        public bool IsActive { get; set; } = true;
        public int ProductCount { get; set; }
        public decimal TotalImportedValue { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
