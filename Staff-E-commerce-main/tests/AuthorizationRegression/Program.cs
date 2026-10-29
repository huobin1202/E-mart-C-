using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using backend.Controllers;
using backend.Data;
using backend.DTO;
using backend.Models;
using backend.Repository;
using backend.Security;
using backend.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

// Runs against an isolated temporary database; never modifies the application database.
var backendPath = args.FirstOrDefault() ?? Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../backend"));
var config = new ConfigurationBuilder().SetBasePath(backendPath).AddJsonFile("appsettings.json")
    .AddJsonFile("appsettings.Development.json", optional: true).AddEnvironmentVariables().Build();
var connection = new SqlConnectionStringBuilder(config.GetConnectionString("DefaultConnection"))
{
    InitialCatalog = "AuthorizationRegression_" + Guid.NewGuid().ToString("N"),
    ConnectTimeout = 8
};
var builder = WebApplication.CreateBuilder();
builder.Logging.ClearProviders();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
{
    ["Jwt:Key"] = "authorization-regression-test-key-at-least-32-bytes",
    ["Jwt:Issuer"] = "test", ["Jwt:Audience"] = "test"
});
builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlServer(connection.ConnectionString));
builder.Services.AddSingleton(typeof(BusMemoryCache<>));
builder.Services.AddSignalR();
builder.Services.AddScoped<UserRepository>();
builder.Services.AddScoped<UserService>();
builder.Services.AddScoped<JwtService>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<OrderRepository>();
builder.Services.AddScoped<CustomerRepository>();
builder.Services.AddScoped<CustomerService>();
builder.Services.AddScoped<PaymentRepository>();
builder.Services.AddScoped<ActivityLogRepository>();
builder.Services.AddScoped<ActivityLogService>();
builder.Services.AddScoped<InvoiceService>();
builder.Services.AddScoped<InvoiceRepository>();
builder.Services.AddScoped<PosCheckoutRepository>();
builder.Services.AddScoped<StorefrontRepository>();
builder.Services.AddScoped<PosCheckoutService>();
builder.Services.AddScoped<StorefrontService>();
builder.Services.AddScoped<StorefrontAccountService>();
builder.Services.AddScoped<StorefrontCheckoutService>();
builder.Services.AddScoped<BankTransferService>();
builder.Services.AddScoped<RealtimeNotificationService>();
builder.Services.AddScoped<OrderService>();
builder.Services.AddScoped<PaymentService>();
builder.Services.AddScoped<OrderItemRepository>();
builder.Services.AddScoped<OrderItemService>();
builder.Services.AddScoped<PromotionRepository>();
builder.Services.AddScoped<PromotionService>();
builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["Momo:AccessKey"] = "test-access", ["Momo:SecretKey"] = "test-secret" });
builder.Services.AddScoped<PermissionFilter>();
builder.Services.AddScoped<AccountMutationFilter>();
builder.Services.AddScoped<ReadCacheInvalidationService>();
builder.Services.AddScoped<ReadCacheInvalidationFilter>();
builder.Services.AddControllers(o =>
{
    o.Filters.AddService<PermissionFilter>();
    o.Filters.AddService<AccountMutationFilter>();
    o.Filters.AddService<ReadCacheInvalidationFilter>();
}).AddApplicationPart(typeof(UsersController).Assembly);
builder.Services.AddAuthorization(o => o.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true, ValidateAudience = true, ValidIssuer = "test", ValidAudience = "test",
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!))
    };
    o.Events = new JwtBearerEvents { OnTokenValidated = SessionValidator.ValidateAsync };
});
await using var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
var databaseCreated = false;
var assertions = 0;
try
{
    await WithDb(async db => { await db.Database.EnsureCreatedAsync(); databaseCreated = true; });
    // Exercise upgrading the previous order schema, not only a freshly generated model.
    await WithDb(async db => await db.Database.ExecuteSqlRawAsync("""
        DROP INDEX ux_orders_checkout_key ON orders;
        ALTER TABLE orders DROP COLUMN checkout_key, checkout_hash, points_used, points_earned, cash_received, recipient_name, recipient_phone, shipping_address;
        """));
    await AuthorizationSchemaInitializer.InitializeAsync(app.Services);
    int adminId = 0, staffId = 0, employeeId = 0, customerId = 0, adminEmployeeId = 0;
    await WithDb(async db =>
    {
        var roles = await db.Roles.ToDictionaryAsync(r => r.Name);
        var employee = new Employee { FullName = "Staff Original", Email = "staff@test.local", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        var customer = new Customer { FullName = "Customer", Phone = "0900000000", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        var admin = NewUser("admin_test", roles["admin"]);
        admin.Employee = new Employee { FullName = "Administrator", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        var staff = NewUser("staff_test", roles["staff"]);
        staff.Employee = employee;
        staff.Email = employee.Email;
        var buyer = NewUser("customer_test", roles["customer"]);
        buyer.Customer = customer;
        db.Users.AddRange(admin, staff, buyer);
        await db.SaveChangesAsync();
        (adminId, staffId, employeeId, customerId) = (admin.Id, staff.Id, employee.Id, buyer.Id);
        adminEmployeeId = admin.Employee.Id;
    });
    await app.StartAsync();
    using var client = new HttpClient { BaseAddress = new Uri(app.Urls.Single()) };
    var adminToken = await Token(adminId);
    var staffToken = await Token(staffId);
    var customerToken = await Token(customerId);

    await CheckUserFilter("role=staff&isActive=true&search=staff_test", 1, staffId);
    await CheckUserFilter("search=Staff%20Original", 1, staffId);
    await CheckUserFilter("search=staff%40test.local", 1, staffId);
    await CheckUserFilter("role=customer&search=staff_test", 0);
    await CheckUserFilter("role=staff&page=99&pageSize=1", 1, staffId, 1);
    await CheckUserFilter("search=not_found&page=99", 0, expectedPage: 1);
    await CheckUserFilter("page=2&pageSize=1", 3, expectedPage: 2);
    await WithDb(async db =>
    {
        var user = await db.Users.FindAsync(staffId);
        user!.IsLocked = true;
        await db.SaveChangesAsync();
    });
    app.Services.GetRequiredService<BusMemoryCache<UserDTO>>().Clear();
    await CheckUserFilter("role=staff&isActive=false", 1, staffId);
    await CheckUserFilter("role=staff&isActive=true", 0);
    await WithDb(async db =>
    {
        var user = await db.Users.FindAsync(staffId);
        user!.IsLocked = false;
        await db.SaveChangesAsync();
    });
    app.Services.GetRequiredService<BusMemoryCache<UserDTO>>().Clear();

    await Expect(HttpMethod.Get, "/api/users/getalluser", staffToken, null, HttpStatusCode.Forbidden);
    await Expect(HttpMethod.Get, "/api/users/getalluser", customerToken, null, HttpStatusCode.Forbidden);
    await Expect(HttpMethod.Get, "/api/customers", customerToken, null, HttpStatusCode.Forbidden);
    var customerRole = await Role("customer");
    await Expect(HttpMethod.Put, $"/api/roles/{customerRole.Id}", adminToken,
        new { name = "customer", isActive = true, permissionIds = new[] { await Permission("users.write") } }, HttpStatusCode.Conflict);
    var staffRole = await Role("staff");
    var usersRead = await Permission("users.read");
    await Expect(HttpMethod.Put, $"/api/roles/{staffRole.Id}", adminToken,
        new { name = "staff", isActive = true, permissionIds = staffRole.PermissionIds.Append(usersRead) }, HttpStatusCode.OK);
    await Expect(HttpMethod.Get, "/api/users/getalluser", staffToken, null, HttpStatusCode.OK);
    await Expect(HttpMethod.Post, "/api/users", staffToken,
        new { username = "should_not_create", password = "Password123", role = "admin", isActive = true }, HttpStatusCode.Forbidden);
    await Expect(HttpMethod.Put, $"/api/roles/{staffRole.Id}", adminToken,
        new { name = "staff", isActive = true, permissionIds = staffRole.PermissionIds }, HttpStatusCode.OK);
    await Expect(HttpMethod.Get, "/api/users/getalluser", staffToken, null, HttpStatusCode.Forbidden);
    // Restarting schema initialization must not restore revoked permissions.
    await AuthorizationSchemaInitializer.InitializeAsync(app.Services);
    await Expect(HttpMethod.Get, "/api/users/getalluser", staffToken, null, HttpStatusCode.Forbidden);

    await Expect(HttpMethod.Patch, $"/api/users/{adminId}/status?isActive=false", adminToken, null, HttpStatusCode.Conflict);
    await Expect(HttpMethod.Delete, $"/api/users/{adminId}", adminToken, null, HttpStatusCode.Conflict);
    await Expect(HttpMethod.Put, $"/api/users/{adminId}", adminToken,
        new { username = "admin_test", role = "staff", employeeId = adminEmployeeId, isActive = true }, HttpStatusCode.Conflict);
    await Expect(HttpMethod.Get, "/api/users/getalluser", adminToken, null, HttpStatusCode.OK);
    var adminRole = await Role("admin");
    var productsWrite = await Permission("products.write");
    await Expect(HttpMethod.Put, $"/api/roles/{adminRole.Id}", adminToken,
        new { name = "admin", isActive = true, permissionIds = adminRole.PermissionIds.Where(id => id != productsWrite) }, HttpStatusCode.OK);
    await AuthorizationSchemaInitializer.InitializeAsync(app.Services);
    await Expect(HttpMethod.Post, "/api/products", adminToken, new { }, HttpStatusCode.Forbidden);
    await Expect(HttpMethod.Put, $"/api/roles/{adminRole.Id}", adminToken,
        new { name = "admin", isActive = true, permissionIds = adminRole.PermissionIds }, HttpStatusCode.OK);
    await Expect(HttpMethod.Put, $"/api/roles/{adminRole.Id}", adminToken,
        new { name = "admin", isActive = false, permissionIds = adminRole.PermissionIds }, HttpStatusCode.Conflict);
    await Expect(HttpMethod.Put, $"/api/roles/{adminRole.Id}", adminToken,
        new { name = "admin", isActive = true, permissionIds = Array.Empty<int>() }, HttpStatusCode.Conflict);

    await Expect(HttpMethod.Post, "/api/auth/register", adminToken,
        new { username = "orphan", password = "Password123", role = "staff", isActive = true }, HttpStatusCode.BadRequest);
    await Expect(HttpMethod.Put, $"/api/employees/{employeeId}", adminToken,
        new { fullName = "Staff Updated", email = "staff_updated@test.local", isActive = true }, HttpStatusCode.OK);
    await WithDb(async db =>
    {
        var user = await db.Users.FindAsync(staffId);
        Check(user!.FullName == "Staff Updated" && user.Email == "staff_updated@test.local", "Employee/account synchronization");
    });
    await Expect(HttpMethod.Put, "/api/me", staffToken,
        new { username = "staff_test", fullName = "Self Updated", email = "self@test.local" }, HttpStatusCode.OK);
    await WithDb(async db => Check((await db.Employees.FindAsync(employeeId))!.FullName == "Self Updated", "Self profile synchronization"));

    await Expect(HttpMethod.Put, $"/api/employees/{employeeId}", adminToken,
        new { fullName = "Self Updated", email = "self@test.local", isActive = false }, HttpStatusCode.OK);
    await Expect(HttpMethod.Get, "/api/me", staffToken, null, HttpStatusCode.Unauthorized);
    await Expect(HttpMethod.Post, "/api/auth/login", null,
        new { username = "staff_test", password = "Password123" }, HttpStatusCode.Unauthorized);
    await Expect(HttpMethod.Put, $"/api/employees/{employeeId}", adminToken,
        new { fullName = "Self Updated", email = "self@test.local", isActive = true }, HttpStatusCode.OK);
    await Expect(HttpMethod.Get, "/api/me", staffToken, null, HttpStatusCode.Unauthorized);
    await Expect(HttpMethod.Patch, $"/api/users/{staffId}/status?isActive=true", adminToken, null, HttpStatusCode.OK);
    staffToken = await Token(staffId);

    await Expect(HttpMethod.Put, "/api/me/change-password", staffToken,
        new { currentPassword = "Password123", newPassword = "Password456", confirmNewPassword = "Password456" }, HttpStatusCode.NoContent);
    await Expect(HttpMethod.Get, "/api/me", staffToken, null, HttpStatusCode.Unauthorized);
    staffToken = await Token(staffId);

    await Expect(HttpMethod.Put, $"/api/roles/{staffRole.Id}", adminToken,
        new { name = "staff", isActive = false, permissionIds = staffRole.PermissionIds }, HttpStatusCode.OK);
    await Expect(HttpMethod.Post, "/api/auth/login", null,
        new { username = "staff_test", password = "Password456" }, HttpStatusCode.Unauthorized);
    await Expect(HttpMethod.Get, "/api/me", staffToken, null, HttpStatusCode.Unauthorized);
    await Expect(HttpMethod.Put, $"/api/roles/{staffRole.Id}", adminToken,
        new { name = "staff", isActive = true, permissionIds = staffRole.PermissionIds }, HttpStatusCode.OK);
    await Expect(HttpMethod.Get, "/api/me", staffToken, null, HttpStatusCode.Unauthorized);
    staffToken = await Token(staffId);
    await Expect(HttpMethod.Put, $"/api/users/{staffId}", adminToken,
        new { username = "staff_test", role = "admin", isActive = true }, HttpStatusCode.OK);
    await Expect(HttpMethod.Get, "/api/me", staffToken, null, HttpStatusCode.Unauthorized);
    // Two concurrent removals must never eliminate both active administrators.
    var removals = await Task.WhenAll(new[] { adminId, staffId }.Select(async id =>
    {
        using var request = new HttpRequestMessage(HttpMethod.Patch, $"/api/users/{id}/status?isActive=false");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);
        using var response = await client.SendAsync(request);
        if (response.StatusCode is not (HttpStatusCode.OK or HttpStatusCode.Conflict or HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden))
            Console.WriteLine($"Concurrent response: {(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");
        return response.StatusCode;
    }));
    Check(removals.Count(status => status == HttpStatusCode.OK) == 1 &&
        removals.All(status => status is HttpStatusCode.OK or HttpStatusCode.Conflict or HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden), "Concurrent last-admin protection: " + string.Join(",", removals));
    await WithDb(async db => Check(await db.Users.CountAsync(u => u.RoleEntity.Name == "admin" && u.IsActive && !u.IsLocked) == 1, "Exactly one administrator survives"));
    // Restore the primary administrator directly inside this isolated test fixture.
    await WithDb(async db =>
    {
        var user = await db.Users.FindAsync(adminId);
        user!.IsActive = true;
        user.IsLocked = false;
        await db.SaveChangesAsync();
    });
    adminToken = await Token(adminId);
    await WithDb(async db =>
    {
        db.ActivityLogs.Add(new ActivityLog { UserId = staffId, Action = "test_activity", CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();
    });
    await Expect(HttpMethod.Delete, $"/api/users/{staffId}", adminToken, null, HttpStatusCode.Conflict);
    await WithDb(async db => Check(await db.Users.AnyAsync(u => u.Id == staffId), "Account with history cannot be deleted"));

    int unusedId = 0, unusedEmployeeId = 0, loggedInId = 0;
    await WithDb(async db =>
    {
        var role = await db.Roles.SingleAsync(r => r.Name == "staff");
        var unused = NewUser("unused_account", role);
        unused.Employee = new Employee { FullName = "Unused", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        var loggedIn = NewUser("logged_in_account", role);
        loggedIn.Employee = new Employee { FullName = "Logged in", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        db.Users.AddRange(unused, loggedIn);
        await db.SaveChangesAsync();
        (unusedId, unusedEmployeeId, loggedInId) = (unused.Id, unused.Employee.Id, loggedIn.Id);
    });
    var unusedToken = await Token(unusedId);
    await Expect(HttpMethod.Delete, $"/api/users/{unusedId}", adminToken, null, HttpStatusCode.NoContent);
    await WithDb(async db =>
    {
        Check(!await db.Users.AnyAsync(u => u.Id == unusedId), "Unused account is physically deleted");
        Check(await db.Employees.AnyAsync(e => e.Id == unusedEmployeeId), "Deleting account preserves employee profile");
    });
    await Expect(HttpMethod.Get, "/api/me", unusedToken, null, HttpStatusCode.Unauthorized);
    await Expect(HttpMethod.Post, "/api/auth/login", null,
        new { username = "logged_in_account", password = "Password123" }, HttpStatusCode.OK);
    await Expect(HttpMethod.Delete, $"/api/users/{loggedInId}", adminToken, null, HttpStatusCode.Conflict);
    Console.WriteLine($"PASS: {assertions} authorization and account lifecycle assertions.");
    await PosCheckoutRegression.RunAsync(app.Services, client, adminToken);
    await OrderDeliveryRegression.RunAsync(app.Services, client, adminToken);

    async Task CheckUserFilter(string query, int expectedTotal, int? expectedId = null, int? expectedPage = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/users/paginated?" + query);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);
        using var response = await client.SendAsync(request);
        var responseText = await response.Content.ReadAsStringAsync();
        Check(response.IsSuccessStatusCode, $"Filtered users endpoint succeeds: {(int)response.StatusCode} {responseText}");
        using var data = JsonDocument.Parse(responseText);
        var root = data.RootElement;
        Check(root.GetProperty("totalItems").GetInt32() == expectedTotal, "Filtered count: " + query);
        if (expectedId.HasValue)
            Check(root.GetProperty("items").EnumerateArray().Single().GetProperty("id").GetInt32() == expectedId.Value, "Filtered account: " + query);
        if (expectedPage.HasValue)
            Check(root.GetProperty("currentPage").GetInt32() == expectedPage.Value, "Filtered page: " + query);
    }

    async Task Expect(HttpMethod method, string path, string? token, object? body, HttpStatusCode expected)
    {
        using var request = new HttpRequestMessage(method, path);
        if (token != null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body != null) request.Content = JsonContent.Create(body);
        using var response = await client.SendAsync(request);
        if (response.StatusCode != expected)
            throw new Exception($"{method} {path}: expected {(int)expected}, got {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        assertions++;
    }
}
finally
{
    await app.StopAsync();
    if (databaseCreated) await WithDb(db => db.Database.EnsureDeletedAsync());
}

async Task WithDb(Func<AppDbContext, Task> action)
{
    await using var scope = app.Services.CreateAsyncScope();
    await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
}
async Task<string> Token(int id)
{
    await using var scope = app.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var user = await db.Users.Include(u => u.RoleEntity).SingleAsync(u => u.Id == id);
    return scope.ServiceProvider.GetRequiredService<JwtService>().GenerateToken(user).token;
}
async Task<RoleDTO> Role(string name)
{
    RoleDTO result = null!;
    await WithDb(async db => result = await db.Roles.Where(r => r.Name == name).Select(r => new RoleDTO
    { Id = r.Id, Name = r.Name, PermissionIds = r.RolePermissions.Select(rp => rp.PermissionId).ToList() }).SingleAsync());
    return result;
}
async Task<int> Permission(string code)
{
    int id = 0;
    await WithDb(async db => id = await db.Permissions.Where(p => p.Code == code).Select(p => p.Id).SingleAsync());
    return id;
}
void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
    assertions++;
}
User NewUser(string username, Role role) => new()
{
    Username = username, FullName = username, RoleEntity = role, IsActive = true,
    CreatedAt = DateTime.UtcNow, PasswordHash = BCrypt.Net.BCrypt.HashPassword("Password123", 4)
};
