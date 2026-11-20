using System.Security.Cryptography;
using System.Text.RegularExpressions;
using backend.Models;
using Microsoft.AspNetCore.DataProtection;

namespace backend.Services;

// Guest checkout is a capability, never an identity derived from a phone number.
public sealed class GuestCheckoutAccess(IDataProtectionProvider protection)
{
    private IDataProtector Session => protection.CreateProtector("Emart.GuestCheckout.Session.v1");
    private ITimeLimitedDataProtector Receipt => protection.CreateProtector("Emart.GuestCheckout.Receipt.v1").ToTimeLimitedDataProtector();
    public string IssueSession() => Session.Protect(Convert.ToHexString(RandomNumberGenerator.GetBytes(32)));
    public string ReadSession(string? token)
    {
        try
        {
            var secret = Session.Unprotect(token ?? "");
            if (Regex.IsMatch(secret, "^[0-9A-F]{64}$")) return secret;
        }
        catch (Exception exception) when (exception is CryptographicException or ArgumentException) { }
        throw new BusinessRuleException("Phiên mua hàng không hợp lệ. Vui lòng mở lại bước thanh toán.", 400, true);
    }
    public string IssueReceipt(Order order) => Receipt.Protect($"{order.Id}|{order.CheckoutHash}", TimeSpan.FromDays(7));
    public bool CanRead(Order order, string? token)
    {
        if (order.CustomerId != null || order.OrderType != "mobile" || string.IsNullOrEmpty(order.CheckoutHash)) return false;
        try { return Receipt.Unprotect(token ?? "") == $"{order.Id}|{order.CheckoutHash}"; }
        catch (Exception exception) when (exception is CryptographicException or ArgumentException) { return false; }
    }
}
