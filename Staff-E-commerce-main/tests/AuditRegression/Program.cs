using System.Net;
using System.Reflection;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using backend.Controllers;
using backend.Middlewares;
using backend.Security;
using backend.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing.Patterns;
using Microsoft.Extensions.DependencyInjection;

var checks = 0;
void Check(bool condition, string description)
{
    if (!condition) throw new Exception(description);
    checks++;
}

HttpContext Context(string controller, string action, string method = "POST", string path = "/api/probe", string body = "{}", params object[] metadata)
{
    var context = new DefaultHttpContext();
    context.Request.Method = method;
    context.Request.Path = path;
    context.Request.ContentType = "application/json";
    context.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes(body));
    context.Response.Body = new MemoryStream();
    var descriptor = new ControllerActionDescriptor { ControllerName = controller, ActionName = action };
    var builder = new RouteEndpointBuilder(_ => Task.CompletedTask, RoutePatternFactory.Parse(path), 0);
    builder.Metadata.Add(descriptor);
    foreach (var item in metadata) builder.Metadata.Add(item);
    context.SetEndpoint(builder.Build());
    context.Connection.RemoteIpAddress = IPAddress.Loopback;
    context.User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("uid", "7") }, "test"));
    return context;
}

var sink = new MemoryWriter();
await using var provider = new ServiceCollection().AddSingleton<IActivityLogWriter>(sink).BuildServiceProvider();
async Task Run(HttpContext context, RequestDelegate? next = null)
{
    await new RequestLoggingMiddleware(next ?? (_ => Task.CompletedTask), provider).InvokeAsync(context);
}

// No hub negotiation/transport, static requests, unresolved routes, GETs or read-only POST previews.
foreach (var context in new[] {
    Context("Hub", "Negotiate", path: "/hub/notifications/negotiate"),
    Context("Hub", "Send", path: "/hub/notifications"),
    Context("Files", "Upload", path: "/assets/file"),
    Context("Products", "Get", "GET"),
    Context("Promotions", "ValidatePromotion"),
    Context("Storefront", "ValidateStorefrontPromotion"),
    Context("Products", "AdvancedSearch", metadata: new ReadOnlyRequestAttribute()),
    new DefaultHttpContext()
}) await Run(context);
Check(sink.Rows.Count == 0, "Technical and read-only requests must not create audit rows");

var expected = new Dictionary<string, string> {
    ["ConfirmCash"] = "CONFIRM_CASH_Orders", ["ConfirmOnlineTransfer"] = "CONFIRM_TRANSFER_Orders",
    ["CancelOrder"] = "CANCEL_Orders", ["CompletePendingOrder"] = "COMPLETE_Orders",
    ["ConfirmOnlineOrder"] = "CONFIRM_Orders", ["RejectOnlineOrder"] = "REJECT_Orders",
    ["DeliverOnlineOrder"] = "DELIVER_Orders", ["MarkOrderRefunded"] = "REFUND_Orders",
    ["CreateOrder"] = "CHECKOUT_Orders", ["CreatePosPaymentLink"] = "CREATE_PAYMENT_LINK_Orders"
};
foreach (var (action, label) in expected)
    Check(AuditRequest.Describe(Context("Orders", action))?.Action == label, action);
Check(AuditRequest.Describe(Context("Promotions", "ApplyPromotion"))?.Action == "APPLY_PROMOTION_Orders", "Apply promotion targets order");
Check(AuditRequest.Describe(Context("PurchaseOrders", "Complete"))?.Action == "COMPLETE_PurchaseOrders", "Receive purchase order");
Check(AuditRequest.Describe(Context("Inventory", "AdjustInventory", "PUT"))?.Action == "ADJUST_Inventory_Adjustment", "Inventory adjustment");
Check(AuditRequest.Describe(Context("Import", "ImportProducts"))?.Action == "IMPORT_Products", "Product import");
Check(AuditRequest.Describe(Context("Payment", "MomoCallback"))?.Action == "PAYMENT_CALLBACK_Payment", "Callback is not a create");

// Every existing mutation endpoint must have a meaningful mapping (future endpoints fail this check).
foreach (var controller in typeof(OrdersController).Assembly.GetTypes().Where(type => type.IsSubclassOf(typeof(ControllerBase))))
foreach (var method in controller.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
foreach (var http in method.GetCustomAttributes<HttpMethodAttribute>())
foreach (var verb in http.HttpMethods.Where(verb => verb is "POST" or "PUT" or "PATCH" or "DELETE"))
{
    var context = Context(controller.Name.Replace("Controller", ""), method.Name, verb);
    if (method.GetCustomAttribute<ReadOnlyRequestAttribute>() != null) continue;
    var operation = AuditRequest.Describe(context);
    Check(operation == null ? method.Name.Contains("Validate") : !operation.Action.StartsWith("EXECUTE_") && !operation.Entity.Contains("Unknown"), $"Unmapped business endpoint: {controller.Name}.{method.Name}");
}

// Chunked requests (no Content-Length), redaction, valid JSON after truncation, and body rewind.
var payloadContext = Context("Users", "UpdateUser", "PUT", body: "{\"password\":\"secret\",\"email\":\"person@example.com\",\"nested\":{\"accessToken\":\"private-token\"},\"name\":\"" + new string('x', 1500) + "\"}");
payloadContext.Request.RouteValues["id"] = 12;
await Run(payloadContext, async context => {
    Check(context.Request.Body.Position == 0, "Business code receives original body");
    Check((await new StreamReader(context.Request.Body).ReadToEndAsync()).Contains("secret"), "Original request is not redacted for business code");
    context.Response.StatusCode = 409;
});
var row = sink.Rows.Last();
Check(row.Id == "12" && row.UserId == 7 && row.Action == "UPDATE_Users", "Route identity and authenticated actor");
using (var json = JsonDocument.Parse(row.Payload!)) {
    Check(!json.RootElement.GetProperty("succeeded").GetBoolean(), "HTTP failures must not appear successful");
    Check(json.RootElement.GetProperty("method").GetString() == "PUT", "Method retained");
}
Check(!row.Payload!.Contains("private-token") && !row.Payload.Contains("person@example.com") && !row.Payload.Contains("secret"), "Sensitive information is redacted before truncation");

// Capture newly created IDs from MVC results, never from a client-supplied create Id.
var filter = new AuditIdentityFilter();
var created = Context("Products", "CreateProduct");
var actionContext = new ActionContext(created, new RouteData(), new ControllerActionDescriptor(), new ModelStateDictionary());
var filters = new List<IFilterMetadata>();
await filter.OnActionExecutionAsync(new ActionExecutingContext(actionContext, filters, new Dictionary<string, object?> { ["dto"] = new { Id = 999 } }, new object()),
    () => Task.FromResult(new ActionExecutedContext(actionContext, filters, new object())));
Check(!created.Items.ContainsKey(AuditRequest.IdentityKey), "Do not trust incoming ID for create");
var result = new CreatedResult("/api/products/42", new { id = 42, accessToken = "must-not-be-logged" });
var resultContext = new ResultExecutingContext(actionContext, filters, result, new object());
ResultExecutionDelegate executeResult = () => Task.FromResult(new ResultExecutedContext(actionContext, filters, result, new object()));
await Run(created, async context => {
    await filter.OnResultExecutionAsync(resultContext, executeResult);
    context.Response.StatusCode = 201;
});
Check(sink.Rows.Last().Id == "42" && !sink.Rows.Last().Payload!.Contains("must-not-be-logged"), "New ID captured without response credentials");
Check(AuditRequest.ObjectId(new { data = new { orderId = 63 } }, "Orders") == "63", "Wrapped checkout IDs");
Check(AuditRequest.ObjectId(new { productId = 5, id = 88 }, "Inventory_Adjustment") == "5", "Inventory targets the product");
Check(AuditRequest.ObjectId(new[] { new { OrderId = 5, Id = 111 }, new { OrderId = 5, Id = 112 } }, "Orders") == "5", "Order item batch targets its parent order");
Check(AuditRequest.ObjectId(new[] { new { OrderId = 5 }, new { OrderId = 6 } }, "Orders") == null, "Do not invent a single target for multiple orders");
Check(AuditRequest.ResultSummary(false).GetValueOrDefault("success") is false, "Boolean business failure is retained");

var adjustment = Context("Inventory", "AdjustInventory", "PUT");
var adjustmentAction = new ActionContext(adjustment, new RouteData(), new ControllerActionDescriptor(), new ModelStateDictionary());
await filter.OnActionExecutionAsync(new ActionExecutingContext(adjustmentAction, filters, new Dictionary<string, object?> { ["dto"] = new { ProductId = 15, NewQuantity = 30 } }, new object()),
    () => Task.FromResult(new ActionExecutedContext(adjustmentAction, filters, new object())));
Check(adjustment.Items[AuditRequest.IdentityKey]?.ToString() == "15", "Body identity captured for inventory adjustment");

var import = Context("Import", "ImportProducts");
import.Items[AuditRequest.ResultKey] = AuditRequest.ResultSummary(new { TotalRows = 10, Created = 8, Updated = 0, Skipped = 2, HasErrors = true, RolledBack = false, AccessToken = "private" });
await Run(import);
using (var json = JsonDocument.Parse(sink.Rows.Last().Payload!)) {
    Check(json.RootElement.GetProperty("outcome").GetString() == "partial", "Partial imports must not be presented as fully successful");
    Check(json.RootElement.GetProperty("result").GetProperty("created").GetInt32() == 8 && !sink.Rows.Last().Payload!.Contains("private"), "Import counts without response secrets");
}
import.Items[AuditRequest.ResultKey] = AuditRequest.ResultSummary(new { HasErrors = true, RolledBack = true });
await Run(import);
using (var json = JsonDocument.Parse(sink.Rows.Last().Payload!))
    Check(!json.RootElement.GetProperty("succeeded").GetBoolean(), "Rolled-back import must be failed even if HTTP 200");

var payment = Context("Payment", "CompleteBankSimulation", path: "/api/payment/simulator/bank/{orderId:int}/{token}");
payment.Request.RouteValues["orderId"] = 81;
payment.Request.RouteValues["token"] = "private-url-token";
payment.Request.QueryString = new QueryString("?access_token=private-query-token");
await Run(payment);
Check(sink.Rows.Last().Id == "81" && !sink.Rows.Last().Payload!.Contains("private-"), "Payment URLs preserve ID without leaking tokens");

// Exceptions remain exceptions; logs record 500 instead of the default response status 200.
try { await Run(Context("Orders", "CancelOrder"), _ => throw new InvalidOperationException("business failure")); }
catch (InvalidOperationException) { }
using (var json = JsonDocument.Parse(sink.Rows.Last().Payload!))
    Check(json.RootElement.GetProperty("statusCode").GetInt32() == 500 && !json.RootElement.GetProperty("succeeded").GetBoolean(), "Unhandled failure outcome");

await Run(Context("Auth", "Login", path: "/api/auth/login", body: "{\"password\":\"do-not-log\"}"));
Check(!sink.Rows.Last().Payload!.Contains("do-not-log"), "Authentication request bodies omitted");
sink.Fail = true;
var completed = false;
await Run(Context("Products", "DeleteProduct", "DELETE"), _ => { completed = true; return Task.CompletedTask; });
Check(completed, "Audit storage failure must not break a business request");
Console.WriteLine($"PASS: {checks} audit regression checks (no application database used).");

sealed record Row(int? UserId, string Action, string Entity, string Id, string? Payload);
sealed class MemoryWriter : IActivityLogWriter
{
    public List<Row> Rows { get; } = [];
    public bool Fail { get; set; }
    public Task LogAsync(int? userId, string action, string entityType, string entityId, string? payload, string ipAddress)
    {
        if (Fail) throw new IOException("Simulated unavailable log storage");
        Rows.Add(new(userId, action, entityType, entityId, payload));
        return Task.CompletedTask;
    }
}
