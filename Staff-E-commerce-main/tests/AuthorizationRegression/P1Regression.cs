using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using backend.Data;
using backend.DTO;
using backend.Hubs;
using backend.Middlewares;
using backend.Models;
using backend.Repository;
using backend.Services;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

public static class P1Regression
{
    public static async Task RunAsync(IServiceProvider services, HttpClient client, string adminToken)
    {
        var assertions = 0;
        int buyerId = 0, otherBuyerId = 0, productId = 0, lastId = 0, promoProductId = 0, promoId = 0, unitId = 0, offlineId = 0;
        string buyerToken = "", otherToken = "", staffToken = "";
        await Db(async db => {
            var role = await db.Roles.SingleAsync(r => r.Name == "customer");
            var buyer = new Customer { FullName = "P1 buyer", Phone = "0901000041", RewardPoints = 50, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
            var other = new Customer { FullName = "P1 other", Phone = "0901000042", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
            var offline = new Customer { FullName = "P1 offline owner", Phone = "0901000043", RewardPoints = 12, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
            var buyerUser = User("p1_buyer", role); buyerUser.Customer = buyer;
            var otherUser = User("p1_other", role); otherUser.Customer = other;
            var limitedRole = new Role { Name = "p1_limited", IsActive = true, RolePermissions =
                (await db.Permissions.Where(p => p.Code == "users.write" || p.Code == "orders.read").ToListAsync()).Select(p => new RolePermission { PermissionId = p.Id }).ToList() };
            var staff = User("p1_staff", limitedRole);
            var unit = new Unit { Code = "p1-unit", Name = "P1 unit", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow, IsActive = true };
            var product = Product("P1 regular", 20000, 30); product.Unit = unit; product.Cost = 12000; product.Barcode = "P1-BARCODE"; product.Sku = "P1-REGULAR";
            var last = Product("P1 final unit", 20000, 1);
            var discounted = Product("P1 limited promo", 20000, 10);
            var promo = new Promotion { Code = "P1-LIMITED", Name = "P1 limited promo", Type = "product", DiscountType = "fixed", Value = 1000,
                UsageLimit = 1, Status = "active", StartDate = DateTime.UtcNow.AddDays(-1), EndDate = DateTime.UtcNow.AddDays(1), CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
            db.Users.AddRange(buyerUser, otherUser, staff); db.Customers.Add(offline); db.Products.AddRange(product, last, discounted); db.Promotions.Add(promo);
            await db.SaveChangesAsync(); db.ProductPromotions.Add(new ProductPromotion { PromotionId = promo.Id, ProductId = discounted.Id }); await db.SaveChangesAsync();
            (buyerId, otherBuyerId, offlineId, productId, lastId, promoProductId, promoId, unitId) = (buyer.Id, other.Id, offline.Id, product.Id, last.Id, discounted.Id, promo.Id, unit.Id);
            var jwt = services.GetRequiredService<IServiceScopeFactory>().CreateScope();
            using (jwt) { var generator = jwt.ServiceProvider.GetRequiredService<JwtService>(); buyerToken = generator.GenerateToken(buyerUser).token; otherToken = generator.GenerateToken(otherUser).token; staffToken = generator.GenerateToken(staff).token; }
        });

        await Call(HttpMethod.Post, "/api/storefront/register", null,
            new { username = "p1_claim", password = "Password123", fullName = "Different owner", phone = "0901000043" }, HttpStatusCode.Conflict);
        await Db(async db => {
            Check(!await db.Users.AnyAsync(u => u.Username == "p1_claim"), "Registration cannot claim an existing offline profile");
            Check((await db.Customers.FindAsync(offlineId))!.FullName == "P1 offline owner", "Blocked registration preserves original profile");
        });
        await Call(HttpMethod.Get, "/api/activitylog/paged", buyerToken, expected: HttpStatusCode.Forbidden);
        await Call(HttpMethod.Get, "/api/activitylog/paged", staffToken, expected: HttpStatusCode.Forbidden);
        await Call(HttpMethod.Post, "/hub/orders/negotiate?negotiateVersion=1", null, expected: HttpStatusCode.Unauthorized);
        await Call(HttpMethod.Post, "/hub/orders/negotiate?negotiateVersion=1", buyerToken, expected: HttpStatusCode.Forbidden);
        await Call(HttpMethod.Post, "/api/users", staffToken,
            new { username = "p1_elevate", password = "Password123", role = "admin", isActive = true }, HttpStatusCode.Forbidden);

        var middleware = new RequestLoggingMiddleware(_ => Task.CompletedTask, services);
        var sanitize = typeof(RequestLoggingMiddleware).GetMethod("PreparePayload", BindingFlags.NonPublic | BindingFlags.Instance)!;
        var redacted = (string)sanitize.Invoke(middleware, ["{\"CurrentPassword\":\"p1-old-secret\",\"nested\":[{\"new_password\":\"p1-new-secret\",\"accessToken\":\"p1-token-secret\"}]}"])!;
        Check(!redacted.Contains("p1-old-secret") && !redacted.Contains("p1-new-secret") && !redacted.Contains("p1-token-secret"), "Nested password and token values are redacted");
        Check(!((string)sanitize.Invoke(middleware, ["invalid p1-old-secret"])!).Contains("p1-old-secret"), "Malformed payloads are not logged raw");

        // Warm all affected read models before exercising writes.
        await Call(HttpMethod.Get, "/api/products/paginated?pageSize=100", adminToken);
        await Call(HttpMethod.Get, "/api/inventory/paginated?pageSize=100", adminToken);
        await Call(HttpMethod.Get, "/api/customers?pageSize=100", adminToken);
        await Call(HttpMethod.Get, "/api/orders/search?pageSize=100", adminToken);
        await Call(HttpMethod.Get, "/api/orders/online?pageSize=100", adminToken);
        await Call(HttpMethod.Get, "/api/invoice?pageSize=100", adminToken);
        await Call(HttpMethod.Get, "/api/storefront/products", null);

        var saleBody = Payload(productId, points: 3);
        var placed = await Call(HttpMethod.Post, "/api/storefront/orders", buyerToken, saleBody);
        var orderId = placed.GetProperty("id").GetInt32();
        var replay = await Call(HttpMethod.Post, "/api/storefront/orders", buyerToken, saleBody);
        Check(replay.GetProperty("id").GetInt32() == orderId, "Storefront retry returns original order");
        await Call(HttpMethod.Post, "/api/storefront/orders", otherToken, saleBody, HttpStatusCode.Conflict);
        await Db(async db => {
            Check((await db.Inventory.SingleAsync(i => i.ProductId == productId)).Quantity == 29, "Retry debits stock once");
            Check((await db.Orders.FindAsync(orderId))!.PointsUsed == 3, "Points used are stored on order");
            Check((await db.Customers.FindAsync(buyerId))!.RewardPoints == 47, "Retry debits points once");
        });
        var productView = await Call(HttpMethod.Get, "/api/products/paginated?search=P1%20regular", adminToken);
        Check(productView.GetProperty("items").EnumerateArray().Single().GetProperty("inventory").GetProperty("quantity").GetInt32() == 29, "Product RAM cache refreshed after app order");
        var storeView = await Call(HttpMethod.Get, "/api/storefront/products", null);
        Check(storeView.EnumerateArray().Single(p => p.GetProperty("id").GetInt32() == productId).GetProperty("stockQuantity").GetInt32() == 29, "Storefront RAM cache refreshed after app order");
        var customerView = await Call(HttpMethod.Get, $"/api/customers/{buyerId}", adminToken);
        Check(customerView.GetProperty("rewardPoints").GetInt32() == 47, "Customer RAM points refreshed");
        await Call(HttpMethod.Get, $"/api/orders/online/{orderId}", adminToken);

        await Call(HttpMethod.Post, $"/api/orders/{orderId}/confirm", adminToken, new { });
        var invoices = await Call(HttpMethod.Get, "/api/invoice?pageSize=100", adminToken);
        Check(!invoices.GetProperty("items").EnumerateArray().Any(i => i.GetProperty("orderId").GetInt32() == orderId), "Warm invoice cache excludes processing order");
        var cancelled = await Task.WhenAll(Raw(HttpMethod.Post, $"/api/orders/{orderId}/reject", adminToken, new { reason = "P1 cancel" }), Raw(HttpMethod.Post, $"/api/orders/{orderId}/reject", adminToken, new { reason = "P1 cancel" }));
        Check(cancelled.All(r => r.Status == HttpStatusCode.OK), "Concurrent cancellation is idempotent");
        await Db(async db => {
            Check((await db.Inventory.SingleAsync(i => i.ProductId == productId)).Quantity == 30, "Concurrent cancel restores stock once");
            Check((await db.Customers.FindAsync(buyerId))!.RewardPoints == 50, "Concurrent cancel restores points once");
        });
        invoices = await Call(HttpMethod.Get, "/api/invoice?pageSize=100", adminToken);
        Check(!invoices.GetProperty("items").EnumerateArray().Any(i => i.GetProperty("orderId").GetInt32() == orderId), "Warm invoice cache excludes cancelled order");

        var lastResponses = await Task.WhenAll(Raw(HttpMethod.Post, "/api/storefront/orders", buyerToken, Payload(lastId)), Raw(HttpMethod.Post, "/api/storefront/orders", otherToken, Payload(lastId)));
        Check(lastResponses.Count(r => r.Status == HttpStatusCode.OK) == 1 && lastResponses.Count(r => r.Status == HttpStatusCode.Conflict) == 1, "Only one customer buys the last unit");
        await Db(async db => Check(await db.OrderItems.Where(i => i.ProductId == lastId).SumAsync(i => i.Quantity) == 1, "Last-unit ledger contains one unit"));

        var discounted = await Call(HttpMethod.Post, "/api/storefront/orders", buyerToken, Payload(promoProductId));
        var normal = await Call(HttpMethod.Post, "/api/storefront/orders", buyerToken, Payload(promoProductId));
        Check(discounted.GetProperty("totalAmount").GetDecimal() == 19000 && normal.GetProperty("totalAmount").GetDecimal() == 20000, "Product promotion stops at usage limit");
        await Call(HttpMethod.Put, $"/api/promotions/{promoId}", adminToken, new { id = promoId, name = "P1 edit", type = "product", discountType = "fixed", value = 1000,
            startDate = DateTime.UtcNow.AddDays(-1), endDate = DateTime.UtcNow.AddDays(1), status = "active", active = true, usageLimit = 1, usedCount = 0, productIds = new[] { promoProductId } });
        await Call(HttpMethod.Post, "/api/promotions/apply", adminToken, new { promotionId = promoId, orderId }, HttpStatusCode.Conflict);
        await Db(async db => {
            Check((await db.Promotions.FindAsync(promoId))!.UsedCount == 1, "Editing promotion cannot reset usage count");
            Check(await db.PromotionRedemptions.CountAsync(r => r.PromotionId == promoId) == 1, "One product redemption per applied order");
        });
        await Call(HttpMethod.Patch, $"/api/promotions/{promoId}/toggle", adminToken, expected: HttpStatusCode.NoContent);
        await Db(async db => {
            Check((await db.Promotions.FindAsync(promoId))!.Status == "disabled", "Promotion toggle persists status");
            Check((await db.Promotions.FindAsync(promoId))!.UsedCount == 1 && await db.ProductPromotions.AnyAsync(p => p.PromotionId == promoId), "Promotion toggle preserves usage and product links");
        });
        await Call(HttpMethod.Patch, $"/api/promotions/{promoId}/toggle", adminToken, expected: HttpStatusCode.NoContent);

        await Call(HttpMethod.Put, $"/api/products/{productId}", adminToken, new { productName = "P1 regular edited", sku = "P1-REGULAR", unitId, price = 20000, isActive = true, description = "Edited" });
        await Db(async db => { var p = (await db.Products.FindAsync(productId))!; Check(p.Cost == 12000 && p.Barcode == "P1-BARCODE", "Normal product edit preserves cost and barcode"); });

        var bank = await Call(HttpMethod.Post, "/api/storefront/orders", buyerToken, Payload(productId, method: "bank"));
        var bankId = bank.GetProperty("id").GetInt32();
        await Call(HttpMethod.Post, $"/api/orders/{bankId}/confirm-online-payment", staffToken, new { amount = 20000, reference = "P1-BANK" }, HttpStatusCode.Forbidden);
        await Call(HttpMethod.Post, $"/api/orders/{bankId}/confirm-online-payment", adminToken, new { amount = 1, reference = "P1-BANK" }, HttpStatusCode.BadRequest);
        await Call(HttpMethod.Post, $"/api/orders/{bankId}/confirm-online-payment", adminToken, new { amount = 20000, reference = "P1-BANK" });
        await Call(HttpMethod.Post, $"/api/orders/{bankId}/confirm-online-payment", adminToken, new { amount = 20000, reference = " P1-BANK " });
        await Call(HttpMethod.Post, $"/api/orders/{bankId}/complete", adminToken, expected: HttpStatusCode.Conflict);
        await Call(HttpMethod.Post, $"/api/orders/{bankId}/confirm", adminToken, new { });
        var deliveries = await Task.WhenAll(Raw(HttpMethod.Post, $"/api/orders/{bankId}/deliver", adminToken, new { }), Raw(HttpMethod.Post, $"/api/orders/{bankId}/deliver", adminToken, new { }));
        Check(deliveries.All(r => r.Status == HttpStatusCode.OK), "Concurrent delivery is idempotent");
        await Db(async db => {
            Check((await db.Customers.FindAsync(buyerId))!.RewardPoints == 52, "Delivery awards points once");
            Check(await db.Payments.CountAsync(p => p.OrderId == bankId && p.Status == "completed") == 1, "Transfer confirmation records one payment");
        });

        var refundOrder = await Call(HttpMethod.Post, "/api/storefront/orders", buyerToken, Payload(productId, method: "bank", points: 2));
        var refundId = refundOrder.GetProperty("id").GetInt32();
        await Call(HttpMethod.Post, $"/api/orders/{refundId}/confirm-online-payment", adminToken, new { amount = 18000, reference = "P1-BANK-REFUND" });
        await Call(HttpMethod.Post, $"/api/orders/{refundId}/reject", adminToken, new { reason = "P1 paid cancellation" });
        var refundSnapshot = await Call(HttpMethod.Get, $"/api/orders/online/{refundId}", adminToken);
        Check(refundSnapshot.GetProperty("paymentStatus").GetString() == "paid" && refundSnapshot.GetProperty("status").GetString() == "cancelled", "Paid cancellation remains due for refund");
        await Call(HttpMethod.Post, $"/api/orders/{refundId}/refund", adminToken, new { amount = 18000, reference = "P1-REFUND" });
        await Call(HttpMethod.Post, $"/api/orders/{refundId}/refund", adminToken, new { amount = 18000, reference = "P1-REFUND" });
        await Db(async db => {
            Check((await db.Orders.FindAsync(refundId))!.PaymentStatus == "refunded", "Cancelled paid order can be refunded");
            Check(await db.Payments.CountAsync(p => p.OrderId == refundId && p.Status == "refunded") == 1, "Refund confirmation is idempotent");
            Check((await db.Customers.FindAsync(buyerId))!.RewardPoints == 52, "Refund does not return already-restored points twice");
        });

        int fractionalId = 0;
        await Db(async db => {
            var p = Product("P1 fractional discount", 10001, 3); db.Products.Add(p); await db.SaveChangesAsync(); fractionalId = p.Id;
            var promo = new Promotion { Code = "P1-FRACTION", Name = "P1 fraction", Type = "product", DiscountType = "percent", Value = 10, Status = "active",
                StartDate = DateTime.UtcNow.AddDays(-1), EndDate = DateTime.UtcNow.AddDays(1), CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
                ProductDetails = [new ProductPromotion { ProductId = p.Id }] }; db.Promotions.Add(promo); await db.SaveChangesAsync();
        });
        var momo = await Call(HttpMethod.Post, "/api/storefront/orders", buyerToken, Payload(fractionalId, method: "momo"));
        Check(momo.GetProperty("totalAmount").GetDecimal() == 9001, "Whole-dong discount matches POS pricing");
        var momoId = momo.GetProperty("id").GetInt32(); var momoRef = $"order_{momoId}_p1";
        await Db(async db => { db.Payments.Add(new Payment { OrderId = momoId, Amount = 9001, Method = "other", TransactionRef = momoRef, Status = "completed", CreatedAt = DateTime.UtcNow }); await db.SaveChangesAsync(); });
        await Call(HttpMethod.Post, "/api/payment/momo/ipn", null, Callback(momoRef, 9001));
        await Call(HttpMethod.Post, "/api/payment/momo/ipn", null, Callback(momoRef, 9001));
        await Db(async db => {
            Check((await db.Orders.FindAsync(momoId))!.PaymentStatus == "paid", "Callback repairs legacy payment-completed/order-pending state");
            Check(await db.Invoices.CountAsync(i => i.OrderId == momoId) == 1, "Repeated callback creates one invoice");
        });
        var cancelMomo = await Call(HttpMethod.Post, "/api/storefront/orders", buyerToken, Payload(productId, method: "momo", points: 1));
        var cancelledMomoId = cancelMomo.GetProperty("id").GetInt32(); var lateRef = $"order_{cancelledMomoId}_p1_late";
        await Db(async db => { db.Payments.Add(new Payment { OrderId = cancelledMomoId, Amount = 19000, Method = "other", TransactionRef = lateRef, Status = "pending", CreatedAt = DateTime.UtcNow }); await db.SaveChangesAsync(); });
        await Call(HttpMethod.Post, $"/api/orders/{cancelledMomoId}/reject", adminToken, new { reason = "P1 late money" });
        await Call(HttpMethod.Post, "/api/payment/momo/ipn", null, Callback(lateRef, 19000));
        await Db(async db => { var o = (await db.Orders.FindAsync(cancelledMomoId))!; Check(o.Status == "cancelled" && o.PaymentStatus == "paid", "Late signed callback records money without reviving cancelled order"); });

        // Force an invoice failure after payment/order SaveChanges, then verify the whole transaction rolls back.
        var atomic = await Call(HttpMethod.Post, "/api/storefront/orders", buyerToken, Payload(productId, method: "momo"));
        var atomicId = atomic.GetProperty("id").GetInt32(); var atomicRef = $"order_{atomicId}_p1_atomic"; int blockerInvoiceId = 0;
        await Db(async db => {
            db.Payments.Add(new Payment { OrderId = atomicId, Amount = 20000, Method = "other", TransactionRef = atomicRef, Status = "pending", CreatedAt = DateTime.UtcNow });
            var blocker = new Order { OrderNumber = "P1-invoice-blocker", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
            db.Orders.Add(blocker); await db.SaveChangesAsync();
            var invoice = new Invoice { OrderId = blocker.Id, InvoiceNumber = "HD-" + atomic.GetProperty("orderNumber").GetString(), CustomerName = "Test blocker",
                InvoiceStatus = "issued", PaymentStatus = "pending", IssuedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
            db.Invoices.Add(invoice); await db.SaveChangesAsync(); blockerInvoiceId = invoice.Id;
        });
        var failedCallback = await Raw(HttpMethod.Post, "/api/payment/momo/ipn", null, Callback(atomicRef, 20000));
        Check((int)failedCallback.Status >= 400, "Invoice failure rejects callback so the provider can retry");
        await Db(async db => {
            Check((await db.Orders.FindAsync(atomicId))!.PaymentStatus == "pending", "Invoice failure rolls back order payment state");
            Check((await db.Payments.SingleAsync(p => p.TransactionRef == atomicRef)).Status == "pending", "Invoice failure rolls back payment record");
            db.Invoices.Remove((await db.Invoices.FindAsync(blockerInvoiceId))!); await db.SaveChangesAsync();
        });
        await Call(HttpMethod.Post, "/api/payment/momo/ipn", null, Callback(atomicRef, 20000));

        // A completion racing cancellation may win either way; its inventory must match the final state.
        var supplier = await Call(HttpMethod.Post, "/api/suppliers", adminToken, new { name = "P1 supplier", isActive = true }, HttpStatusCode.Created);
        var receipt = await Call(HttpMethod.Post, "/api/purchase-orders", adminToken,
            new { supplierId = supplier.GetProperty("id").GetInt32(), items = new[] { new { productId, quantity = 7, importPrice = 11000 } } }, HttpStatusCode.Created);
        var receiptId = receipt.GetProperty("id").GetInt32(); int stockBeforeReceipt = 0;
        await Db(async db => stockBeforeReceipt = (await db.Inventory.SingleAsync(i => i.ProductId == productId)).Quantity);
        var receiptRace = await Task.WhenAll(Raw(HttpMethod.Post, $"/api/purchase-orders/{receiptId}/complete", adminToken, new { }), Raw(HttpMethod.Post, $"/api/purchase-orders/{receiptId}/cancel", adminToken, new { }));
        Check(receiptRace.Count(r => r.Status == HttpStatusCode.OK) == 1, "Purchase receipt has only one successful terminal transition");
        await Db(async db => {
            var po = (await db.PurchaseOrders.FindAsync(receiptId))!;
            Check((await db.Inventory.SingleAsync(i => i.ProductId == productId)).Quantity == stockBeforeReceipt + (po.Status == "completed" ? 7 : 0), "Receipt stock matches completion/cancellation winner");
        });

        // Editing a previously loaded profile must not write a stale points balance.
        await using (var profileScope = services.CreateAsyncScope())
        {
            var customers = profileScope.ServiceProvider.GetRequiredService<CustomerRepository>();
            var profile = (await customers.GetByIdAsync(buyerId))!;
            var expected = profile.RewardPoints + 3;
            await Db(db => db.Customers.Where(c => c.Id == buyerId).ExecuteUpdateAsync(s => s.SetProperty(c => c.RewardPoints, expected)));
            profile.FullName = "P1 updated profile";
            await customers.UpdateAsync(profile);
            await Db(async db => Check((await db.Customers.FindAsync(buyerId))!.RewardPoints == expected, "Customer profile save preserves concurrently updated points"));
        }
        await using (var profileScope = services.CreateAsyncScope())
        {
            var users = profileScope.ServiceProvider.GetRequiredService<UserRepository>();
            var id = await profileScope.ServiceProvider.GetRequiredService<AppDbContext>().Users.Where(u => u.Username == "p1_buyer").Select(u => u.Id).SingleAsync();
            var profile = (await users.GetByIdAsync(id))!;
            var expected = profile.Customer!.RewardPoints + 2;
            await Db(db => db.Customers.Where(c => c.Id == buyerId).ExecuteUpdateAsync(s => s.SetProperty(c => c.RewardPoints, expected)));
            profile.FullName = profile.Customer.FullName = "P1 updated account";
            await users.UpdateAsync(profile);
            await Db(async db => Check((await db.Customers.FindAsync(buyerId))!.RewardPoints == expected, "Account graph save preserves concurrently updated points"));
        }

        // Revalidate existing realtime connections before every publication, including session revocation.
        await using (var scope = services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var staff = await db.Users.Include(u => u.RoleEntity).SingleAsync(u => u.Username == "p1_staff");
            var registry = new OrderConnectionRegistry(); var recording = new RecordingHub();
            var expires = DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeSeconds();
            registry.Add(new("staff", staff.Id, staff.SessionVersion, staff.RoleEntity.Name, expires));
            registry.Add(new("buyer", (await db.Users.SingleAsync(u => u.CustomerId == buyerId)).Id, 0, "customer", expires));
            registry.Add(new("expired", staff.Id, staff.SessionVersion, staff.RoleEntity.Name, expires - 7200));
            var notifications = new OrderNotifications(db, recording, registry, NullLogger<OrderNotifications>.Instance);
            await notifications.PublishAsync("P1-event", new { orderId }); await notifications.FlushAsync();
            Check(recording.Delivered.SequenceEqual(new[] { "staff" }), "Realtime publication targets only active permitted sessions");
            var permission = await db.RolePermissions.Include(p => p.Permission).SingleAsync(p => p.RoleId == staff.RoleId && p.Permission.Code == "orders.read");
            db.RolePermissions.Remove(permission); await db.SaveChangesAsync();
            await notifications.PublishAsync("P1-event", new { orderId }); await notifications.FlushAsync();
            Check(recording.Delivered.Count == 1, "Open realtime connection loses delivery after permission revocation");
            db.RolePermissions.Add(new RolePermission { RoleId = staff.RoleId, PermissionId = permission.PermissionId }); await db.SaveChangesAsync();
            registry.Add(new("staff", staff.Id, staff.SessionVersion, staff.RoleEntity.Name, expires));
            staff.SessionVersion++; await db.SaveChangesAsync();
            await notifications.PublishAsync("P1-event", new { orderId }); await notifications.FlushAsync();
            Check(recording.Delivered.Count == 1, "Open realtime session loses delivery after session revocation");
        }

        Console.WriteLine($"PASS: {assertions} P0/P1 security, storefront, concurrency, cache and settlement assertions.");

        object Payload(int id, string method = "cod", int points = 0) => new { requestId = Guid.NewGuid().ToString(), fullName = "P1 recipient", phone = "0901000041", address = "P1 address 123", paymentMethod = method, pointsUsed = points, items = new[] { new { productId = id, quantity = 1 } } };
        void Check(bool condition, string message) { if (!condition) throw new Exception(message); assertions++; }
        async Task Db(Func<AppDbContext, Task> action) { await using var scope = services.CreateAsyncScope(); await action(scope.ServiceProvider.GetRequiredService<AppDbContext>()); await scope.ServiceProvider.GetRequiredService<ReadCacheRefreshService>().RefreshAsync(); }
        async Task<(HttpStatusCode Status, string Body)> Raw(HttpMethod method, string path, string? token, object? data = null) {
            using var req = new HttpRequestMessage(method, path); if (token != null) req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            if (data != null) req.Content = JsonContent.Create(data); using var res = await client.SendAsync(req); return (res.StatusCode, await res.Content.ReadAsStringAsync());
        }
        async Task<JsonElement> Call(HttpMethod method, string path, string? token, object? data = null, HttpStatusCode expected = HttpStatusCode.OK) {
            var res = await Raw(method, path, token, data); Check(res.Status == expected, $"{method} {path}: expected {expected}, got {res.Status}: {res.Body}");
            return JsonDocument.Parse(string.IsNullOrWhiteSpace(res.Body) ? "{}" : res.Body).RootElement.Clone();
        }
    }

    private static User User(string name, Role role) => new() { Username = name, FullName = name, RoleEntity = role, IsActive = true, PasswordHash = "unused", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
    private static Product Product(string name, decimal price, int stock) => new() { ProductName = name, Price = price, IsActive = true, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow, Inventory = new Inventory { Quantity = stock, UpdatedAt = DateTime.UtcNow } };
    private static MomoIpnCallbackDTO Callback(string reference, long amount)
    {
        var c = new MomoIpnCallbackDTO { OrderId = reference, Amount = amount, ResultCode = 0, PartnerCode = "test", RequestId = "p1-test", TransId = 1,
            Message = "ok", OrderInfo = "P1", OrderType = "momo_wallet", PayType = "qr", ResponseTime = 1, ExtraData = "" };
        var raw = $"accessKey=test-access&amount={c.Amount}&extraData={c.ExtraData}&message={c.Message}&orderId={c.OrderId}&orderInfo={c.OrderInfo}&orderType={c.OrderType}&partnerCode={c.PartnerCode}&payType={c.PayType}&requestId={c.RequestId}&responseTime={c.ResponseTime}&resultCode={c.ResultCode}&transId={c.TransId}";
        c.Signature = Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes("test-secret"), Encoding.UTF8.GetBytes(raw))).ToLowerInvariant(); return c;
    }

    private sealed class RecordingHub : IHubContext<OrderHub>
    {
        public List<string> Delivered { get; } = new();
        public IHubClients Clients => new RecordingClients(Delivered);
        public IGroupManager Groups => throw new NotSupportedException();
    }
    private sealed class RecordingClients(List<string> delivered) : IHubClients
    {
        public IClientProxy Clients(IReadOnlyList<string> ids) => new RecordingProxy(delivered, ids);
        public IClientProxy All => throw new Exception("Public broadcasts are forbidden");
        public IClientProxy AllExcept(IReadOnlyList<string> ids) => throw new NotSupportedException();
        public IClientProxy Client(string id) => Clients(new[] { id });
        public IClientProxy Group(string name) => throw new NotSupportedException();
        public IClientProxy GroupExcept(string name, IReadOnlyList<string> ids) => throw new NotSupportedException();
        public IClientProxy Groups(IReadOnlyList<string> names) => throw new NotSupportedException();
        public IClientProxy User(string id) => throw new NotSupportedException();
        public IClientProxy Users(IReadOnlyList<string> ids) => throw new NotSupportedException();
    }
    private sealed class RecordingProxy(List<string> delivered, IReadOnlyList<string> ids) : IClientProxy
    {
        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default) { delivered.AddRange(ids); return Task.CompletedTask; }
    }
}
