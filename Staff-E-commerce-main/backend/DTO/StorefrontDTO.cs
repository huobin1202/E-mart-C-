using System.ComponentModel.DataAnnotations;

namespace backend.DTO;

public sealed class StorefrontCategoryDTO
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
}

public class StorefrontCustomerLoginRequest
{
    [Required, StringLength(150)]
    public string Username { get; set; } = string.Empty;

    [Required, StringLength(128, MinimumLength = 6)]
    public string Password { get; set; } = string.Empty;
}

public sealed class StorefrontCustomerRegisterRequest : StorefrontCustomerLoginRequest
{
    [Required, StringLength(150, MinimumLength = 2)]
    public string FullName { get; set; } = string.Empty;

    [Required, StringLength(20)]
    public string Phone { get; set; } = string.Empty;

    [EmailAddress, StringLength(255)]
    public string? Email { get; set; }

    [StringLength(500)]
    public string? Address { get; set; }

    public DateTime? DateOfBirth { get; set; }
}

public sealed class StorefrontAddressUpdateRequest
{
    [Required, StringLength(500)]
    public string Address { get; set; } = string.Empty;
}

public sealed class StorefrontAccountUpdateRequest
{
    [Required, StringLength(150, MinimumLength = 2)]
    public string FullName { get; set; } = string.Empty;

    [EmailAddress, StringLength(255)]
    public string? Email { get; set; }

    [StringLength(500)]
    public string? Address { get; set; }

    public DateTime? DateOfBirth { get; set; }
}

public sealed class StorefrontCustomerProfileDTO
{
    public int Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? Address { get; set; }
    public DateTime? DateOfBirth { get; set; }
    public int RewardPoints { get; set; }
}

public sealed class StorefrontAuthenticationDTO
{
    public string Token { get; set; } = string.Empty;
    public string TokenType { get; set; } = "Bearer";
    public int ExpiresIn { get; set; }
    public StorefrontCustomerProfileDTO Customer { get; set; } = new();
}

public sealed class StorefrontOrderRequest
{
    [Required, StringLength(36)]
    public string RequestId { get; set; } = string.Empty;

    [Range(typeof(decimal), "0", "9999999999")]
    public decimal? ExpectedTotal { get; set; }

    [Required, StringLength(150, MinimumLength = 2)]
    public string FullName { get; set; } = string.Empty;

    [Required, RegularExpression("^(0|\\+84)[35789]\\d{8}$", ErrorMessage = "Số điện thoại không hợp lệ.")]
    public string Phone { get; set; } = string.Empty;

    [Required, StringLength(500, MinimumLength = 5)]
    public string Address { get; set; } = string.Empty;

    [StringLength(500)]
    public string? Note { get; set; }

    [StringLength(100)]
    public string? PromotionCode { get; set; }

    [Range(1, int.MaxValue)]
    public int? EventPromotionId { get; set; }

    [Range(0, int.MaxValue)]
    public int PointsUsed { get; set; }

    [StringLength(20)]
    public string? PaymentMethod { get; set; } = "cod";

    [Required, MinLength(1), MaxLength(30)]
    public List<StorefrontOrderLine> Items { get; set; } = new();
}

public sealed class StorefrontOrderLine
{
    [Range(1, int.MaxValue)]
    public int ProductId { get; set; }

    [Range(1, 1000)]
    public int Quantity { get; set; }
}

public sealed class StorefrontPromotionRequest
{
    [Range(1, int.MaxValue)]
    public int? EventPromotionId { get; set; }

    [StringLength(100)]
    public string Code { get; set; } = string.Empty;

    [Range(typeof(decimal), "0", "9999999999")]
    public decimal OrderAmount { get; set; }
}

public sealed class StorefrontCheckoutDTO
{
    public int Id { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public decimal Subtotal { get; set; }
    public decimal Discount { get; set; }
    public decimal TotalAmount { get; set; }
    public string PaymentMethod { get; set; } = string.Empty;
    public string PaymentStatus { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public string? RecipientName { get; set; }
    public string? RecipientPhone { get; set; }
    public string? ShippingAddress { get; set; }
    public string? Note { get; set; }
    public int PointsUsed { get; set; }
    public string? MomoPayUrl { get; set; }
    public string? PaymentError { get; set; }
    public object? BankDetails { get; set; }
    public string? VietQrUrl { get; set; }
    public bool Replay { get; set; }
}

public sealed class StorefrontPaymentStatusDTO
{
    public int Id { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string PaymentStatus { get; set; } = string.Empty;
    public string PaymentMethod { get; set; } = string.Empty;
    public decimal TotalAmount { get; set; }
    public string? VietQrUrl { get; set; }
}
