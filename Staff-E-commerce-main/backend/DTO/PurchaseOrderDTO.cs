namespace backend.DTO;

public class PurchaseOrderCreateDTO
{
    public int SupplierId { get; set; }
    public string? Note { get; set; }
    public List<PurchaseOrderItemCreateDTO> Items { get; set; } = new();
}

public class PurchaseOrderItemCreateDTO
{
    public int ProductId { get; set; }
    public int Quantity { get; set; }
    public decimal ImportPrice { get; set; }
}

public class PurchaseOrderListDTO
{
    public int Id { get; set; }
    public string PoCode { get; set; } = string.Empty;
    public int SupplierId { get; set; }
    public string SupplierName { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public decimal TotalAmount { get; set; }
    public int ItemCount { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class PurchaseOrderDetailDTO : PurchaseOrderListDTO
{
    public string? Note { get; set; }
    public DateTime UpdatedAt { get; set; }
    public List<PurchaseOrderItemDTO> Items { get; set; } = new();
}

public class PurchaseOrderItemDTO
{
    public int ProductId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public string? Sku { get; set; }
    public int Quantity { get; set; }
    public decimal ImportPrice { get; set; }
    public decimal Subtotal { get; set; }
}
