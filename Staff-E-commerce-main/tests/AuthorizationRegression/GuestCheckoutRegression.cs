using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using backend.Data;
using backend.DTO;
using backend.Models;
using backend.Services;
using Microsoft.EntityFrameworkCore;

public static class GuestCheckoutRegression
{
    public static async Task RunAsync(IServiceProvider services, HttpClient client, string adminToken)
    {
        var assertions = 0;
        int productId = 0, memberId = 0, eventId = 0, productPromotionId = 0;
        string memberToken = "";
        var phone = "0912345689";
        await Db(async db => {
            var member = new Customer { FullName = "Guest Test Member", Phone = phone, RewardPoints = 100, IsActive = true, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
            var user = new User { Username = "guest-test-member", FullName = member.FullName, PasswordHash = "unused", IsActive = true, Customer = member,
                RoleEntity = await db.Roles.SingleAsync(role => role.Name == "customer"), CreatedAt = DateTime.UtcNow };
            var product = new Product { ProductName = "Guest Pricing Product", Sku = "GUEST-TEST-PRODUCT", Price = 100000, StockQuantity = 30, IsActive = true, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
            var campaign = Promotion("GUEST-EVENT", "event", 10);
            campaign.EventDetails = new EventPromotion { MinOrderAmount = 0 };
            var productPromotion = Promotion("GUEST-MEMBER-DISCOUNT", "product", 20);
            db.Users.Add(user); db.Products.Add(product); db.Promotions.AddRange(campaign, productPromotion);
            await db.SaveChangesAsync();
            db.ProductPromotions.Add(new ProductPromotion { ProductId = product.Id, PromotionId = productPromotion.Id });
            await db.SaveChangesAsync();
            (productId, memberId, eventId, productPromotionId) = (product.Id, member.Id, campaign.Id, productPromotion.Id);
            await using var tokenScope = services.CreateAsyncScope();
            memberToken = tokenScope.ServiceProvider.GetRequiredService<JwtService>().GenerateToken(user).token;
        });
        services.GetRequiredService<BusMemoryCache<StorefrontProductDTO>>().Clear();
        var publicProduct = await Call(HttpMethod.Get, $"/api/storefront/products/{productId}");
        Check(publicProduct.GetProperty("price").GetDecimal() == 100000 && publicProduct.GetProperty("discountAmount").GetDecimal() == 0, "Guest catalogue shows regular price");
        var memberProduct = await Call(HttpMethod.Get, $"/api/storefront/products/{productId}", memberToken);
        Check(memberProduct.GetProperty("price").GetDecimal() == 80000, "Signed-in member keeps product discount");
        publicProduct = await Call(HttpMethod.Get, $"/api/storefront/products/{productId}");
        Check(publicProduct.GetProperty("price").GetDecimal() == 100000, "Member catalogue cache never leaks discounted guest prices");
        var guestPage = await Call(HttpMethod.Get, "/api/storefront/products/page?discountedOnly=true");
        Check(guestPage.GetProperty("totalItems").GetInt32() == 0, "Guest flash-sale list excludes member-only product discounts");

        var session = await Call(HttpMethod.Post, "/api/storefront/guest/session");
        var guestToken = session.GetProperty("token").GetString()!;
        StorefrontOrderRequest Bill() => new() { RequestId = Guid.NewGuid().ToString(), GuestToken = guestToken, FullName = "Người nhận vãng lai", Phone = phone,
            Address = "12 Đường Mới, Phường B, Thành phố C", PaymentMethod = "cod", ExpectedTotal = 90000, EventPromotionId = eventId,
            Items = [new StorefrontOrderLine { ProductId = productId, Quantity = 1 }] };
        var bill = Bill();
        int customerCount = 0;
        await Db(async db => customerCount = await db.Customers.CountAsync());
        var placed = await Call(HttpMethod.Post, "/api/storefront/guest/orders", data: bill);
        var orderId = placed.GetProperty("id").GetInt32();
        var receipt = placed.GetProperty("guestAccessToken").GetString()!;
        Check(placed.GetProperty("subtotal").GetDecimal() == 100000 && placed.GetProperty("totalAmount").GetDecimal() == 90000, "Only the event discount applies to a guest order");
        Check(placed.GetProperty("recipientPhone").GetString() == phone, "Guest receipt includes submitted recipient");
        await Db(async db => {
            var order = (await db.Orders.FindAsync(orderId))!;
            Check(order.CustomerId == null && order.PointsUsed == 0 && order.OrderType == "mobile", "Guest order never attaches to a matching phone/account");
            Check(await db.Customers.CountAsync() == customerCount, "No guest customer profile is created");
            Check((await db.Customers.FindAsync(memberId))!.RewardPoints == 100, "Matching account points are untouched");
            Check((await db.Products.FindAsync(productId))!.StockQuantity == 29, "Guest order reduces stock exactly once");
            Check(!await db.PromotionRedemptions.AnyAsync(row => row.OrderId == orderId && row.PromotionId == productPromotionId), "Guest cannot consume a product promotion");
            Check(await db.PromotionRedemptions.AnyAsync(row => row.OrderId == orderId && row.PromotionId == eventId && row.CustomerId == null), "Event redemption is tracked without an account");
        });
        var replay = await Call(HttpMethod.Post, "/api/storefront/guest/orders", data: bill);
        Check(replay.GetProperty("id").GetInt32() == orderId && replay.GetProperty("replay").GetBoolean(), "Lost-response retry returns the same guest order");
        await Db(async db => Check((await db.Products.FindAsync(productId))!.StockQuantity == 29, "Replay never reduces stock twice"));
        var otherSession = await Call(HttpMethod.Post, "/api/storefront/guest/session");
        bill.GuestToken = otherSession.GetProperty("token").GetString();
        await Call(HttpMethod.Post, "/api/storefront/guest/orders", data: bill, expected: HttpStatusCode.Conflict);
        bill.GuestToken = guestToken;
        bill.Phone = "0987654321";
        await Call(HttpMethod.Post, "/api/storefront/guest/orders", data: bill, expected: HttpStatusCode.Conflict);

        foreach (var code in new[] { "PUBLIC-SALE", "PRIVATE-SALE" }) {
            var invalid = Bill(); invalid.PromotionCode = code; invalid.EventPromotionId = null;
            await Call(HttpMethod.Post, "/api/storefront/guest/orders", data: invalid, expected: HttpStatusCode.BadRequest);
            await Call(HttpMethod.Post, "/api/storefront/promotions/validate", data: new { code, orderAmount = 100000 }, expected: HttpStatusCode.Unauthorized);
        }
        var points = Bill(); points.PointsUsed = 1;
        await Call(HttpMethod.Post, "/api/storefront/guest/orders", data: points, expected: HttpStatusCode.BadRequest);
        var missingSecret = Bill(); missingSecret.GuestToken = null;
        await Call(HttpMethod.Post, "/api/storefront/guest/orders", data: missingSecret, expected: HttpStatusCode.BadRequest);
        var missingPhone = Bill(); missingPhone.Phone = "";
        await Call(HttpMethod.Post, "/api/storefront/guest/orders", data: missingPhone, expected: HttpStatusCode.BadRequest);
        var missingAddress = Bill(); missingAddress.Address = "";
        await Call(HttpMethod.Post, "/api/storefront/guest/orders", data: missingAddress, expected: HttpStatusCode.BadRequest);
        var badEvent = Bill(); badEvent.EventPromotionId = productPromotionId;
        await Call(HttpMethod.Post, "/api/storefront/guest/orders", data: badEvent, expected: HttpStatusCode.BadRequest);
        var wrongPrice = Bill(); wrongPrice.ExpectedTotal = 1;
        await Call(HttpMethod.Post, "/api/storefront/guest/orders", data: wrongPrice, expected: HttpStatusCode.Conflict);
        var overStock = Bill(); overStock.Items[0].Quantity = 100; overStock.ExpectedTotal = null;
        await Call(HttpMethod.Post, "/api/storefront/guest/orders", data: overStock, expected: HttpStatusCode.Conflict);

        await Call(HttpMethod.Get, "/api/storefront/orders", expected: HttpStatusCode.Unauthorized);
        var history = await Call(HttpMethod.Get, "/api/storefront/orders", memberToken);
        Check(!history.EnumerateArray().Any(order => order.GetProperty("id").GetInt32() == orderId), "Matching phone never exposes the guest order in member history");
        await Call(HttpMethod.Get, $"/api/storefront/orders/{orderId}/payment-status", memberToken, expected: HttpStatusCode.NotFound);
        await Call(HttpMethod.Get, $"/api/storefront/guest/orders/{orderId}/payment-status", expected: HttpStatusCode.NotFound);
        await Call(HttpMethod.Get, $"/api/storefront/guest/orders/{orderId}/payment-status", guestReceipt: receipt + "tampered", expected: HttpStatusCode.NotFound);
        var status = await Call(HttpMethod.Get, $"/api/storefront/guest/orders/{orderId}/payment-status", guestReceipt: receipt);
        Check(status.GetProperty("totalAmount").GetDecimal() == 90000, "Only the private receipt grants access to guest payment status");
        var adminOrder = await Call(HttpMethod.Get, $"/api/orders/{orderId}", adminToken);
        Check(adminOrder.GetProperty("recipientName").GetString() == "Người nhận vãng lai", "Guest order is visible in normal admin handling");
        await Call(HttpMethod.Post, $"/api/orders/{orderId}/confirm", adminToken, new { });
        await Call(HttpMethod.Post, $"/api/orders/{orderId}/deliver", adminToken, new { });
        await Db(async db => {
            Check((await db.Orders.FindAsync(orderId))!.Status == "completed", "Admin can complete guest delivery");
            Check((await db.Customers.FindAsync(memberId))!.RewardPoints == 100, "Guest completion cannot award points to the phone owner");
        });
        var invoice = await Call(HttpMethod.Get, $"/api/invoice/{orderId}", adminToken);
        Check(invoice.GetProperty("recipientPhone").GetString() == phone, "Guest invoice retains recipient snapshot");

        var canceled = await Call(HttpMethod.Post, "/api/storefront/guest/orders", data: Bill());
        var canceledId = canceled.GetProperty("id").GetInt32();
        await Call(HttpMethod.Get, $"/api/storefront/guest/orders/{canceledId}/payment-status", guestReceipt: receipt, expected: HttpStatusCode.NotFound);
        await Call(HttpMethod.Post, $"/api/orders/{canceledId}/reject", adminToken, new { reason = "Guest test cancel" });
        await Db(async db => Check((await db.Products.FindAsync(productId))!.StockQuantity == 29, "Rejecting guest order restores its stock"));

        // All online-payment assertions use the local simulator, never a real gateway.
        var configuration = services.GetRequiredService<IConfiguration>();
        var previousMode = configuration["Payments:Mode"];
        configuration["Payments:Mode"] = "Simulated";
        try {
            var momoBill = Bill(); momoBill.PaymentMethod = "momo";
            var momoOrder = await Call(HttpMethod.Post, "/api/storefront/guest/orders", data: momoBill);
            var momoId = momoOrder.GetProperty("id").GetInt32();
            var momoReceipt = momoOrder.GetProperty("guestAccessToken").GetString()!;
            Check(!string.IsNullOrEmpty(momoOrder.GetProperty("momoPayUrl").GetString()), "Guest receives a MoMo payment link");
            await Call(HttpMethod.Post, $"/api/storefront/guest/orders/{momoId}/pay-momo", expected: HttpStatusCode.NotFound);
            var retryLink = await Call(HttpMethod.Post, $"/api/storefront/guest/orders/{momoId}/pay-momo", guestReceipt: momoReceipt);
            var paymentPath = new Uri(retryLink.GetProperty("payUrl").GetString()!).PathAndQuery;
            using var paid = await client.PostAsync(paymentPath, new FormUrlEncodedContent(new Dictionary<string, string> { ["result"] = "success" }));
            Check(paid.IsSuccessStatusCode, "Guest simulated payment callback succeeds without an account");
            var paidStatus = await Call(HttpMethod.Get, $"/api/storefront/guest/orders/{momoId}/payment-status", guestReceipt: momoReceipt);
            Check(paidStatus.GetProperty("paymentStatus").GetString() == "paid", "Guest confirmation can see the verified payment result");
            await Call(HttpMethod.Post, $"/api/orders/{momoId}/confirm", adminToken, new { });
            await Call(HttpMethod.Post, $"/api/orders/{momoId}/deliver", adminToken, new { });
            await Db(async db => Check((await db.Customers.FindAsync(memberId))!.RewardPoints == 100, "Guest online payment/delivery never awards account points"));

            var bankKeys = new[] { "BankTransfer:Enabled", "BankTransfer:BankCode", "BankTransfer:AccountNumber", "BankTransfer:AccountName" };
            var previousBank = bankKeys.ToDictionary(key => key, key => configuration[key]);
            try {
                configuration[bankKeys[0]] = "true"; configuration[bankKeys[1]] = "VCB";
                configuration[bankKeys[2]] = "0000000000"; configuration[bankKeys[3]] = "TEST ONLY";
                var bankBill = Bill(); bankBill.PaymentMethod = "bank";
                var bankOrder = await Call(HttpMethod.Post, "/api/storefront/guest/orders", data: bankBill);
                var bankId = bankOrder.GetProperty("id").GetInt32();
                Check(!string.IsNullOrEmpty(bankOrder.GetProperty("vietQrUrl").GetString()), "Guest bank confirmation includes VietQR");
                var bankPath = new Uri(bankOrder.GetProperty("bankSimulatorUrl").GetString()!).PathAndQuery;
                using var transferred = await client.PostAsync(bankPath, new FormUrlEncodedContent(new Dictionary<string, string>()));
                Check(transferred.IsSuccessStatusCode, "Guest simulated bank payment is verified");
                var bankStatus = await Call(HttpMethod.Get, $"/api/storefront/guest/orders/{bankId}/payment-status", guestReceipt: bankOrder.GetProperty("guestAccessToken").GetString());
                Check(bankStatus.GetProperty("paymentStatus").GetString() == "paid", "Guest can confirm bank payment with its receipt");
            } finally { foreach (var (key, value) in previousBank) configuration[key] = value; }
        } finally { configuration["Payments:Mode"] = previousMode; }
        Console.WriteLine($"PASS: {assertions} guest checkout/pricing/privacy assertions.");

        async Task Db(Func<AppDbContext, Task> work) { await using var scope = services.CreateAsyncScope(); await work(scope.ServiceProvider.GetRequiredService<AppDbContext>()); }
        void Check(bool condition, string label) { if (!condition) throw new Exception(label); assertions++; }
        async Task<JsonElement> Call(HttpMethod method, string path, string? token = null, object? data = null, HttpStatusCode expected = HttpStatusCode.OK, string? guestReceipt = null)
        {
            using var request = new HttpRequestMessage(method, path);
            if (token != null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            if (guestReceipt != null) request.Headers.Add("X-Guest-Order-Token", guestReceipt);
            if (data != null) request.Content = JsonContent.Create(data);
            using var response = await client.SendAsync(request);
            var text = await response.Content.ReadAsStringAsync();
            Check(response.StatusCode == expected, $"{path}: expected {expected}, got {response.StatusCode}: {text}");
            return JsonDocument.Parse(string.IsNullOrWhiteSpace(text) ? "null" : text).RootElement.Clone();
        }
    }

    private static Promotion Promotion(string code, string type, decimal percent) => new() {
        Code = code, Name = code, Type = type, DiscountType = "percent", Value = percent, Status = "active",
        StartDate = DateTime.UtcNow.Date.AddDays(-1), EndDate = DateTime.UtcNow.Date.AddDays(2), UsageLimit = 100,
        CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
    };
}
