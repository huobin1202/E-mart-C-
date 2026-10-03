namespace backend.DTO
{
    public class PromotionDTO
    {
        public int Id { get; set; }
        // Public, customer-entered code. Only vouchers have one.
        public string Code { get; set; } = string.Empty;
        public string Type { get; set; } = "event"; // product | event | voucher
        public string DiscountType { get; set; } = "percent"; // percent | fixed
        public decimal Value { get; set; }
        public decimal MinOrderAmount { get; set; }
        public string? VoucherCode { get; set; }
        public List<int> ProductIds { get; set; } = new();
        public decimal? MaxDiscount { get; set; }
        public DateTime? StartDate { get; set; }
        public DateTime? EndDate { get; set; }
        public int? UsageLimit { get; set; }
        public int UsedCount { get; set; }
        public bool Active { get; set; }
        public string? Status { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
