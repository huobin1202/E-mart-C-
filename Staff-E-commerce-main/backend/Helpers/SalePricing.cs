using backend.Models;

namespace backend.Helpers;

public static class SalePricing
{
    public static decimal Price(decimal value) => decimal.Round(value, 0, MidpointRounding.AwayFromZero);

    public static decimal Discount(string type, decimal value, decimal? maximum, decimal amount)
    {
        var discount = decimal.Floor(type == "percent" ? amount * value / 100m : value);
        if (maximum.HasValue)
            discount = Math.Min(discount, decimal.Floor(maximum.Value));
        return Math.Clamp(discount, 0, amount);
    }

    public static decimal Discount(Promotion promotion, decimal amount) =>
        Discount(promotion.DiscountType, promotion.Value, promotion.MaxDiscount, amount);

    public static bool Active(Promotion promotion) =>
        !promotion.IsDeleted && promotion.Status == "active" &&
        DateTimeHelper.IsWithinRange(promotion.StartDate, promotion.EndDate) &&
        (!promotion.UsageLimit.HasValue || promotion.UsedCount < promotion.UsageLimit);
}
