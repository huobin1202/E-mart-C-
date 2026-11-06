namespace backend.Helpers;

/// <summary>
/// Supplier region ("Miền"). Stored as one of the three canonical values; NULL means "Chưa phân loại".
/// The values match the region strings the product search already uses ("Bắc", "Trung", "Nam").
/// </summary>
public static class SupplierRegion
{
    public const string North = "Bắc";
    public const string Central = "Trung";
    public const string South = "Nam";
    public static readonly string[] All = [North, Central, South];

    /// <summary>Filter value meaning "suppliers without a region".</summary>
    public const string Unclassified = "none";

    /// <summary>Returns the canonical value, null for empty input, or throws for anything else.</summary>
    public static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        foreach (var region in All)
            if (string.Equals(region, trimmed, StringComparison.OrdinalIgnoreCase)) return region;
        throw new ArgumentException("Miền chỉ chấp nhận Bắc, Trung hoặc Nam.");
    }

    /// <summary>Like <see cref="Normalize"/> but a region must be chosen: used when a supplier is created or saved.</summary>
    public static string Require(string? value) =>
        Normalize(value) ?? throw new ArgumentException("Vui lòng chọn miền cho nhà cung cấp (Bắc, Trung hoặc Nam).");
}
