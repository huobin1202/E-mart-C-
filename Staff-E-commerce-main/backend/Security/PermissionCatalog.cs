namespace backend.Security;

public static class PermissionCatalog
{
    public static readonly IReadOnlyDictionary<string, string> Resources = new Dictionary<string, string>
    {
        ["users"] = "tài khoản", ["roles"] = "vai trò và quyền", ["employees"] = "nhân viên",
        ["customers"] = "khách hàng", ["products"] = "sản phẩm", ["categories"] = "danh mục",
        ["units"] = "đơn vị tính", ["suppliers"] = "nhà cung cấp", ["inventory"] = "tồn kho",
        ["purchaseorders"] = "phiếu nhập", ["orders"] = "đơn hàng", ["payments"] = "thanh toán",
        ["invoices"] = "hóa đơn", ["promotions"] = "khuyến mãi", ["reports"] = "báo cáo",
        ["audit"] = "nhật ký hệ thống"
    };

    // Keep a usable administrator while allowing all other permissions to be revoked.
    public static readonly string[] AdministrationPermissions = ["users.read", "users.write", "roles.read", "roles.write"];

    public static string? ForRequest(string controller, string action, string method)
    {
        if (controller == "Orders" && action is "ConfirmPayment" or "ConfirmCash" or "ConfirmOnlinePayment" or "MarkOrderRefunded" or "CreatePosPaymentLink") return "payments.write";
        var resource = controller switch
        {
            "Users" => "users", "Roles" => "roles", "Employees" => "employees",
            "Customers" => "customers", "Products" => "products", "Categories" => "categories",
            "Units" => "units", "Suppliers" => "suppliers", "Inventory" => "inventory",
            "PurchaseOrders" => "purchaseorders", "Orders" or "OrderItem" => "orders",
            "Payment" => "payments", "Invoice" => "invoices", "Promotions" => "promotions",
            "Reports" or "Statistics" => "reports", "ActivityLog" or "ActivityLogs" => "audit",
            "Import" => action.Contains("Customer", StringComparison.OrdinalIgnoreCase) ? "customers" : "products",
            "Auth" when action == "Register" => "users",
            _ => null
        };
        return resource == null ? null : $"{resource}.{(method is "GET" or "HEAD" ? "read" : "write")}";
    }
}
