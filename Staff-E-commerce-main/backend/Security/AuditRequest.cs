using System.Reflection;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;

namespace backend.Security;

public sealed record AuditOperation(string Action, string Entity, string Endpoint);

public static class AuditRequest
{
    public const string IdentityKey = "Audit.EntityId";
    public const string ResultKey = "Audit.Result";

    public static AuditOperation? Describe(HttpContext context)
    {
        if (!context.Request.Path.StartsWithSegments("/api", StringComparison.OrdinalIgnoreCase) ||
            context.Request.Method is not ("POST" or "PUT" or "PATCH" or "DELETE")) return null;
        var endpoint = context.GetEndpoint();
        var descriptor = endpoint?.Metadata.GetMetadata<ControllerActionDescriptor>();
        if (descriptor == null || endpoint!.Metadata.GetMetadata<ReadOnlyRequestAttribute>() != null) return null;
        var controller = descriptor.ControllerName;
        var action = descriptor.ActionName;
        // These POSTs calculate a preview; they do not change business data.
        if (action is "ValidatePromotion" or "ValidateStorefrontPromotion") return null;
        var entity = controller switch
        {
            "Promotions" when action is "ApplyPromotion" or "ApplyPromotionToOrder" => "Orders",
            "OrderItem" => "Orders", "Payment" => "Payment", "Inventory" => "Inventory_Adjustment",
            "Me" or "Auth" => "Users",
            "Import" => action.Contains("Customer") ? "Customers" : "Products",
            "Storefront" => action switch
            {
                "ClaimVoucher" => "Promotions",
                "RegisterCustomer" or "Login" or "UpdateAccount" or "UpdateAccountAddress" => "Customers",
                _ => "Orders"
            },
            _ => controller
        };
        var operation = action switch
        {
            "Login" => "LOGIN",
            "ChangePassword" => "CHANGE_PASSWORD",
            "CreateOrder" or "CreateGuestOrder" => "CHECKOUT",
            "CreateOrderItems" => "ADD_ITEMS",
            "DeleteItemsByOrder" => "REMOVE_ITEMS",
            "CreateTemporaryOrder" => "CREATE_TEMP",
            "ConfirmPayment" => "CONFIRM_PAYMENT",
            "ConfirmCash" => "CONFIRM_CASH",
            "ConfirmOnlineTransfer" => "CONFIRM_TRANSFER",
            "ConfirmOnlineOrder" => "CONFIRM",
            "CancelOrder" or "Cancel" => "CANCEL",
            "RejectOnlineOrder" => "REJECT",
            "DeliverOnlineOrder" => "DELIVER",
            "MarkOrderRefunded" => "REFUND",
            "CompletePendingOrder" or "Complete" => "COMPLETE",
            "CreatePosPaymentLink" or "CreatePayment" or "RecreateMomoPayment" or "RecreateGuestMomoPayment" => "CREATE_PAYMENT_LINK",
            "MomoCallback" => "PAYMENT_CALLBACK",
            "CompleteMomoSimulation" or "CompleteBankSimulation" => "SIMULATE_PAYMENT",
            "ApplyPromotion" or "ApplyPromotionToOrder" => "APPLY_PROMOTION",
            "ClaimVoucher" => "CLAIM",
            "AdjustInventory" => "ADJUST",
            "UploadImage" => "UPLOAD_IMAGE",
            "UpdateStatus" or "SetProductStatus" or "UpdateActiveCategoryStatus" or "UpdateActiveCustomer" => "SET_STATUS",
            "ToggleActive" => "TOGGLE_STATUS",
            _ when action.StartsWith("Import") => "IMPORT",
            _ when action.StartsWith("Create") || action.StartsWith("Register") => "CREATE",
            _ when action.StartsWith("Update") => "UPDATE",
            _ when action.StartsWith("Delete") => "DELETE",
            _ => "EXECUTE_" + Regex.Replace(action, "([a-z])([A-Z])", "$1_$2").ToUpperInvariant()
        };
        return new($"{operation}_{entity}", entity, $"{controller}.{action}");
    }

    public static string? RouteId(HttpContext context)
    {
        foreach (var key in new[] { "orderId", "invoiceId", "productId", "id" })
            if (context.Request.RouteValues.TryGetValue(key, out var value) && PositiveId(value) is { } id) return id;
        return null;
    }

    public static string? PositiveId(object? value) =>
        long.TryParse(value?.ToString(), out var id) && id > 0 ? id.ToString() : null;

    // Read only known identifier properties; never serialize responses containing tokens or personal data.
    public static string? ObjectId(object? value, string entity, int depth = 0)
    {
        if (value == null || depth > 2) return null;
        if (value is System.Collections.IEnumerable sequence && value is not string)
        {
            var ids = new HashSet<string>();
            var count = 0;
            foreach (var item in sequence)
            {
                if (++count > 200 || ObjectId(item, entity, depth + 1) is not { } itemId) return null;
                ids.Add(itemId);
                if (ids.Count > 1) return null;
            }
            return ids.SingleOrDefault();
        }
        var keys = entity switch
        {
            "Orders" => new[] { "OrderId", "Id" },
            "Inventory_Adjustment" => new[] { "ProductId", "Id" },
            "Promotions" => new[] { "PromotionId", "Id" },
            "Payment" => new[] { "PaymentId", "Id", "OrderId" },
            _ => new[] { "Id", "UserId", "CustomerId" }
        };
        object? Read(string name)
        {
            try { return value.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase)?.GetValue(value); }
            catch { return null; } // Audit inspection must not affect the business result.
        }
        foreach (var key in keys)
            if (PositiveId(Read(key)) is { } id) return id;
        foreach (var key in new[] { "Data", "Order", "Promotion", "Product", "User", "Customer", "Result" })
            if (ObjectId(Read(key), entity, depth + 1) is { } id) return id;
        return null;
    }

    public static Dictionary<string, object?> ResultSummary(object? value)
    {
        var summary = new Dictionary<string, object?>();
        if (value == null) return summary;
        if (value is bool success) { summary["success"] = success; return summary; }
        foreach (var name in new[] { "Status", "PaymentStatus", "IsActive", "Active", "Success", "Succeeded", "TotalRows", "Created", "Updated", "Skipped", "HasErrors", "RolledBack" })
        {
            try
            {
                var property = value.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
                var item = property?.GetValue(value);
                if (item is bool or int or long or decimal || item is string text && text.Length <= 100)
                    summary[char.ToLowerInvariant(name[0]) + name[1..]] = item;
            }
            catch { /* Optional audit metadata must not affect the response. */ }
        }
        return summary;
    }
}

public sealed class AuditIdentityFilter : IAsyncActionFilter, IAsyncResultFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var operation = AuditRequest.Describe(context.HttpContext);
        if (operation != null && AuditRequest.RouteId(context.HttpContext) == null)
        {
            foreach (var key in new[] { "orderId", "invoiceId", "productId", "id" })
                if (context.ActionArguments.TryGetValue(key, out var argument) && AuditRequest.PositiveId(argument) is { } argumentId)
                { context.HttpContext.Items[AuditRequest.IdentityKey] = argumentId; break; }
            // Existing entities only: an incoming Id on CREATE is not evidence of a created record.
            if (!context.HttpContext.Items.ContainsKey(AuditRequest.IdentityKey) &&
                !operation.Action.StartsWith("CREATE_") && !operation.Action.StartsWith("CHECKOUT_"))
                foreach (var argument in context.ActionArguments.Values)
                    if (AuditRequest.ObjectId(argument, operation.Entity) is { } id)
                    { context.HttpContext.Items[AuditRequest.IdentityKey] = id; break; }
        }
        await next();
    }

    public async Task OnResultExecutionAsync(ResultExecutingContext context, ResultExecutionDelegate next)
    {
        var operation = AuditRequest.Describe(context.HttpContext);
        if (operation != null && context.Result is ObjectResult { Value: not null } result)
        {
            context.HttpContext.Items[AuditRequest.ResultKey] = AuditRequest.ResultSummary(result.Value);
            if ((result.StatusCode ?? 200) < 400 && AuditRequest.RouteId(context.HttpContext) == null &&
                AuditRequest.ObjectId(result.Value, operation.Entity) is { } id)
                context.HttpContext.Items[AuditRequest.IdentityKey] = id;
        }
        await next();
    }
}
