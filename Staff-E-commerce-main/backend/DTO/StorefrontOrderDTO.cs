namespace backend.DTO;

public sealed class StorefrontCustomerOrderDTO
{
    public int Id { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public string OrderType { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string PaymentStatus { get; set; } = string.Empty;
    public string? PaymentMethod { get; set; }
    public decimal Subtotal { get; set; }
    public decimal Discount { get; set; }
    public decimal TotalAmount { get; set; }
    public string? Note { get; set; }
    public string? RecipientName { get; set; }
    public string? RecipientPhone { get; set; }
    public string? ShippingAddress { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<StorefrontCustomerOrderItemDTO> Items { get; set; } = new();
}

public sealed class StorefrontCustomerOrderItemDTO
{
    public int ProductId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public string? ImageUrl { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal TotalPrice { get; set; }
}
