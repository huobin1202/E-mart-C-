using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

public static class CustomerLoginRegression
{
    public static async Task RunAsync(IServiceProvider services, HttpClient client)
    {
        var checks = 0;
        var password = "Customer123";
        int accountId = 0, customerId = 0, otherId = 0;
        await Db(async db =>
        {
            var role = await db.Roles.SingleAsync(r => r.Name == "customer");
            var account = NewCustomer("0912345678", "buyer@example.com", role);
            var other = NewCustomer("0987654321", "other@example.com", role);
            db.Users.AddRange(account, other, new User
            {
                Username = "internal_login_test", Email = "staff@example.com", FullName = "Staff",
                RoleEntity = await db.Roles.SingleAsync(r => r.Name == "staff"),
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(password, 4),
                IsActive = true, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
            (accountId, customerId, otherId) = (account.Id, account.CustomerId!.Value, other.Id);
        });

        foreach (var identifier in new[] { "0912345678", "+84912345678", "091 234 5678", "buyer@example.com", "  BUYER@EXAMPLE.COM  " })
        {
            var data = await Login(identifier, password);
            Check(data.GetProperty("customer").GetProperty("id").GetInt32() == customerId, "Identifiers resolve the same customer");
            Check(!string.IsNullOrEmpty(data.GetProperty("token").GetString()), "Successful login returns a signed session");
        }
        await Db(async db =>
        {
            var account = await db.Users.FindAsync(accountId);
            Check(account!.Username == "0912345678" && account.LastLogin.HasValue, "Email login preserves phone username and updates last login");
        });

        await Login("buyer@example.com", "WrongPassword", HttpStatusCode.Unauthorized);
        await Login("unknown@example.com", password, HttpStatusCode.Unauthorized);
        await Login("staff@example.com", password, HttpStatusCode.Unauthorized);
        await Login("", password, HttpStatusCode.BadRequest);
        var session = await Login("buyer@example.com", password);

        // Editing the existing account email changes the email used for subsequent logins.
        var longEmail = new string('a', 64) + "@" + new string('b', 60) + "." + new string('c', 30) + ".com";
        Check(longEmail.Length > 150 && longEmail.Length <= 255, "Long email exercises the login DTO's full supported length");
        using (var update = new HttpRequestMessage(HttpMethod.Put, "/api/storefront/account"))
        {
            update.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session.GetProperty("token").GetString());
            update.Content = JsonContent.Create(new { fullName = "Email login customer", email = longEmail });
            using var response = await client.SendAsync(update);
            Check(response.StatusCode == HttpStatusCode.OK, "Customer can update email through the existing profile API");
        }
        await Login("buyer@example.com", password, HttpStatusCode.Unauthorized);
        var longSession = await Login(longEmail.ToUpperInvariant(), password);
        Check(longSession.GetProperty("customer").GetProperty("id").GetInt32() == customerId, "Updated email longer than 150 characters can log in");
        await Login("0912345678", password);

        await Db(async db => { (await db.Users.FindAsync(accountId))!.IsLocked = true; await db.SaveChangesAsync(); });
        await Login(longEmail, password, HttpStatusCode.Unauthorized);
        await Login("0912345678", password, HttpStatusCode.Unauthorized);
        await Db(async db => { (await db.Users.FindAsync(accountId))!.IsLocked = false; await db.SaveChangesAsync(); });
        await Login(longEmail, password);
        await Db(async db => { (await db.Customers.FindAsync(customerId))!.IsActive = false; await db.SaveChangesAsync(); });
        await Login(longEmail, password, HttpStatusCode.Unauthorized);
        await Db(async db => { (await db.Customers.FindAsync(customerId))!.IsActive = true; await db.SaveChangesAsync(); });
        await Login(longEmail, password);

        // Five failures across phone/email aliases lock the account, including the correct password.
        foreach (var identifier in new[] { "0912345678", longEmail, "+84912345678", longEmail.ToUpperInvariant(), "091 234 5678" })
            await Login(identifier, "WrongPassword", HttpStatusCode.Unauthorized);
        await Login(longEmail, password, HttpStatusCode.TooManyRequests);
        await Login("0912345678", password, HttpStatusCode.TooManyRequests);
        var unaffected = await Login("other@example.com", password);
        Check(unaffected.GetProperty("customer").GetProperty("phone").GetString() == "0987654321" && otherId != accountId,
            "One customer's lockout does not block a different customer");
        Console.WriteLine($"PASS: {checks} customer phone/email login checks.");

        User NewCustomer(string phone, string email, Role role) => new()
        {
            Username = phone, Email = email, FullName = "Email login customer", RoleEntity = role,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password, 4), IsActive = true,
            CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
            Customer = new Customer { FullName = "Email login customer", Phone = phone, Email = email,
                IsActive = true, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow }
        };
        async Task<JsonElement> Login(string identifier, string secret, HttpStatusCode expected = HttpStatusCode.OK)
        {
            using var response = await client.PostAsJsonAsync("/api/storefront/login", new { username = identifier, password = secret });
            var text = await response.Content.ReadAsStringAsync();
            Check(response.StatusCode == expected, $"Login {identifier}: expected {expected}, got {response.StatusCode}: {text}");
            using var document = JsonDocument.Parse(text);
            return document.RootElement.Clone();
        }
        async Task Db(Func<AppDbContext, Task> action)
        {
            await using var scope = services.CreateAsyncScope();
            await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
        }
        void Check(bool condition, string message)
        {
            if (!condition) throw new Exception(message);
            checks++;
        }
    }
}
