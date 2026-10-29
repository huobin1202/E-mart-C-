using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using backend.Data;
using backend.Helpers;
using backend.Models;
using backend.Services;
using Microsoft.EntityFrameworkCore;

public static class OrderDeliveryRegression
{
    public static async Task RunAsync(IServiceProvider services, HttpClient client, string adminToken)
    {
        var assertions = 0;
        var oldNote = "Người nhận: Nguyễn Văn An\r\nSố điện thoại: 0912345678\r\nĐịa chỉ giao hàng: 12 Đường A\r\nPhường B\r\nGhi chú: Gọi trước khi giao\r\nĐể ở lễ tân | Từ chối: Khách hẹn lại";
        var plainNote = "Gọi trước 15 phút.\nĐể hàng tại lễ tân.";
        int legacyId = 0, noNoteId = 0, malformedId = 0, counterId = 0, structuredId = 0, buyerId = 0, productId = 0;
        string buyerToken = "";
        await Db(async db =>
        {
            var old = Legacy("WEB-delivery-old", oldNote);
            var noNote = Legacy("WEB-delivery-no-note", "Người nhận: B\nSố điện thoại: 0987654321\nĐịa chỉ giao hàng: 20 Đường C");
            var malformed = Legacy("WEB-delivery-malformed", "Người nhận: nội dung chưa đầy đủ");
            var counter = Legacy("POS-delivery-counter", oldNote); counter.OrderType = "pos";
            var structured = Legacy("WEB-delivery-structured", oldNote);
            structured.RecipientName = "Người nhận mới"; structured.RecipientPhone = "0901234567"; structured.ShippingAddress = "Địa chỉ đã tách";
            db.Orders.AddRange(old, noNote, malformed, counter, structured);
            var buyer = new Customer { FullName = "Chủ tài khoản", Phone = "0988888811", Address = "Địa chỉ hồ sơ cũ", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
            var user = new User { Username = "delivery_buyer", FullName = buyer.FullName, PasswordHash = "unused", Customer = buyer,
                RoleEntity = await db.Roles.SingleAsync(r => r.Name == "customer"), IsActive = true, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
            var product = new Product { ProductName = "Delivery item", Price = 20000, StockQuantity = 10, IsActive = true, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
            db.Users.Add(user); db.Products.Add(product);
            await db.SaveChangesAsync();
            (legacyId, noNoteId, malformedId, counterId, structuredId, buyerId, productId) = (old.Id, noNote.Id, malformed.Id, counter.Id, structured.Id, buyer.Id, product.Id);
            using var jwtScope = services.CreateScope();
            buyerToken = jwtScope.ServiceProvider.GetRequiredService<JwtService>().GenerateToken(user).token;
            // Exercise the one-time migration with actual legacy records in the temporary DB.
            await db.Database.ExecuteSqlRawAsync("DELETE FROM authorization_migrations WHERE name = 'order-delivery-v1'");
        });
        await AuthorizationSchemaInitializer.InitializeAsync(services);
        await Db(async db =>
        {
            var old = (await db.Orders.FindAsync(legacyId))!;
            Check(old.RecipientName == "Nguyễn Văn An" && old.RecipientPhone == "0912345678", "Legacy name and phone migrated");
            Check(old.ShippingAddress == "12 Đường A\r\nPhường B", "Multiline address preserved");
            Check(old.Note == "Gọi trước khi giao\r\nĐể ở lễ tân\nTừ chối: Khách hẹn lại", "Customer instructions and rejection preserved");
            Check((await db.Orders.FindAsync(noNoteId))!.Note == null, "Legacy address-only order leaves empty customer note");
            var malformed = (await db.Orders.FindAsync(malformedId))!;
            Check(malformed.RecipientName == null && malformed.Note == "Người nhận: nội dung chưa đầy đủ", "Incomplete legacy data remains untouched");
            Check((await db.Orders.FindAsync(counterId))!.Note == oldNote && (await db.Orders.FindAsync(counterId))!.RecipientName == null, "Counter notes are not mistaken for encoded delivery data");
            var structured = (await db.Orders.FindAsync(structuredId))!;
            Check(structured.RecipientName == "Người nhận mới" && structured.Note == oldNote, "Structured snapshot and arbitrary customer note preserved");
            Check(OrderDeliveryDetails.FromOrder(structured).Note == oldNote, "New notes are never reparsed as legacy payload");
        });
        await AuthorizationSchemaInitializer.InitializeAsync(services);
        var migrated = await Call(HttpMethod.Get, $"/api/orders/{legacyId}", adminToken);
        Check(migrated.GetProperty("recipientName").GetString() == "Nguyễn Văn An", "History exposes migrated recipient fields");
        Check(migrated.GetProperty("note").GetString()!.StartsWith("Gọi trước"), "Migration is idempotent");

        foreach (var channel in new[] { "mobile", "pos" })
        {
            var expectedCount = 0;
            await Db(async db => expectedCount = await db.Orders.CountAsync(o => o.OrderType == channel && o.Status == "pending"));
            var filtered = await Call(HttpMethod.Get, $"/api/orders/search?orderType={channel}&status=pending&pageNumber=1&pageSize=1", adminToken);
            Check(filtered.GetProperty("totalItems").GetInt32() == expectedCount, $"{channel} filter counts matching orders before pagination");
            Check(filtered.GetProperty("items").GetArrayLength() == Math.Min(1, expectedCount)
                && filtered.GetProperty("items").EnumerateArray().All(o => o.GetProperty("orderType").GetString() == channel && o.GetProperty("status").GetString() == "pending"),
                $"{channel} filter combines channel, status and page size");
        }
        await Call(HttpMethod.Get, "/api/orders/search?orderType=invalid", adminToken, expected: HttpStatusCode.BadRequest);

        var body = new { fullName = "Người nhận khác", phone = "0912345678", address = "99 Đường Giao Hàng\nPhường Mới", note = plainNote,
            paymentMethod = "cod", pointsUsed = 0, items = new[] { new { productId, quantity = 1 } } };
        var placed = await Call(HttpMethod.Post, "/api/storefront/orders", buyerToken, body);
        var orderId = placed.GetProperty("id").GetInt32();
        Check(placed.GetProperty("recipientName").GetString() == body.fullName && placed.GetProperty("note").GetString() == plainNote, "Checkout stores separate recipient and customer note");
        await Db(async db =>
        {
            var order = (await db.Orders.FindAsync(orderId))!;
            Check(order.CustomerId == buyerId && order.RecipientPhone == body.phone && order.ShippingAddress == body.address, "Recipient phone does not change account ownership");
            Check(!await db.Customers.AnyAsync(c => c.Phone == body.phone), "No extra customer profile created for the recipient");
            var buyer = (await db.Customers.FindAsync(buyerId))!;
            buyer.FullName = "Chủ tài khoản đổi tên"; buyer.Phone = "0988888822"; buyer.Address = "Địa chỉ hồ sơ mới";
            await db.SaveChangesAsync();
        });
        var history = await Call(HttpMethod.Get, $"/api/orders/{orderId}", adminToken);
        Check(history.GetProperty("recipientPhone").GetString() == body.phone && history.GetProperty("shippingAddress").GetString() == body.address, "Editing profile does not rewrite historical delivery snapshot");
        var pos = await Call(HttpMethod.Get, $"/api/orders/online/{orderId}", adminToken);
        Check(pos.GetProperty("recipientName").GetString() == body.fullName && pos.GetProperty("note").GetString() == plainNote, "POS exposes separate recipient and note");
        var customerOrders = await Call(HttpMethod.Get, "/api/storefront/orders", buyerToken);
        Check(customerOrders.EnumerateArray().Single(o => o.GetProperty("id").GetInt32() == orderId).GetProperty("shippingAddress").GetString() == body.address, "Customer history reads structured delivery address");
        await Call(HttpMethod.Post, $"/api/orders/{orderId}/confirm", adminToken, new { });
        await Call(HttpMethod.Post, $"/api/orders/{orderId}/deliver", adminToken, new { });
        var invoice = await Call(HttpMethod.Get, $"/api/invoice/{orderId}", adminToken);
        Check(invoice.GetProperty("recipientName").GetString() == body.fullName && invoice.GetProperty("shippingAddress").GetString() == body.address, "Invoice preserves the order's original delivery snapshot");
        await Call(HttpMethod.Post, "/api/storefront/orders", null, new { body.fullName, body.phone, body.address, pointsUsed = 1, body.items }, HttpStatusCode.Unauthorized);
        Console.WriteLine($"PASS: {assertions} delivery snapshot/migration assertions.");

        async Task Db(Func<AppDbContext, Task> action) { await using var scope = services.CreateAsyncScope(); await action(scope.ServiceProvider.GetRequiredService<AppDbContext>()); }
        void Check(bool value, string message) { if (!value) throw new Exception(message); assertions++; }
        async Task<JsonElement> Call(HttpMethod method, string path, string? token, object? data = null, HttpStatusCode expected = HttpStatusCode.OK)
        {
            using var request = new HttpRequestMessage(method, path);
            if (token != null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            if (data != null) request.Content = JsonContent.Create(data);
            using var response = await client.SendAsync(request);
            var text = await response.Content.ReadAsStringAsync();
            Check(response.StatusCode == expected, $"{path}: {response.StatusCode} {text}");
            using var json = JsonDocument.Parse(text);
            return json.RootElement.Clone();
        }
    }

    private static Order Legacy(string number, string? note) => new() { OrderNumber = number, OrderType = "mobile", Note = note, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
}
