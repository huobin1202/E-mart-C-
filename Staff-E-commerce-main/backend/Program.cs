using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Authorization;
using backend.Data;
using backend.Repository;
using backend.Services;
using backend.Security;

using backend.Middlewares;
using backend.Hubs;
using Microsoft.Extensions.FileProviders;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.DataProtection;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

var dataProtectionKeysPath = Path.Combine(builder.Environment.ContentRootPath, ".aspnet-keys");
Directory.CreateDirectory(dataProtectionKeysPath);
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(dataProtectionKeysPath));

// -------------------------
// Configure Services
// -------------------------
builder.Services.AddScoped<PermissionFilter>();
builder.Services.AddScoped<ActorPermissionService>();
builder.Services.AddScoped<PaymentSimulator>();
builder.Services.AddSingleton<LoginThrottle>();
builder.Services.AddScoped<AccountMutationFilter>();
builder.Services.AddScoped<ReadCacheInvalidationFilter>();
builder.Services.AddScoped<ReadCacheInvalidationService>();
builder.Services.AddControllers(options =>
    {
        options.Filters.AddService<PermissionFilter>();
        options.Filters.AddService<AccountMutationFilter>();
        options.Filters.AddService<ReadCacheInvalidationFilter>();
    })
    .AddJsonOptions(options =>
    {
        // Giữ cả ReferenceHandler.IgnoreCycles (bạn bè) và PropertyNamingPolicy (cả 2)
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
        options.JsonSerializerOptions.Converters.Add(new backend.Helpers.UtcDateTimeJsonConverter());

        // Nếu muốn, có thể dùng ReferenceHandler.Preserve
        // options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.Preserve;
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSignalR().AddJsonProtocol(options =>
    options.PayloadSerializerOptions.Converters.Add(new backend.Helpers.UtcDateTimeJsonConverter()));
builder.Services.AddAuthorization(options =>
{
    // Yêu cầu đăng nhập cho tất cả endpoint trừ khi đánh dấu [AllowAnonymous]
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});

// Database
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(connectionString)
// .EnableSensitiveDataLogging() // Dev only
);
// -------------------------
// Register Repositories
// -------------------------
builder.Services.AddScoped<ProductRepository>();
builder.Services.AddScoped<OrderRepository>();
builder.Services.AddScoped<UserRepository>();
builder.Services.AddScoped<CustomerRepository>();
builder.Services.AddScoped<ActivityLogRepository>();
builder.Services.AddScoped<PromotionRepository>();
builder.Services.AddScoped<StatisticsRepository>();
builder.Services.AddScoped<OrderItemRepository>();
builder.Services.AddScoped<InventoryRepository>();
builder.Services.AddScoped<PaymentRepository>();
builder.Services.AddScoped<CategoryRepository>();
builder.Services.AddScoped<SupplierRepository>();
builder.Services.AddScoped<ReportsRepository>();
builder.Services.AddScoped<RevenueAnalyticsRepository>();
builder.Services.AddScoped<UnitRepository>();
builder.Services.AddScoped<PurchaseOrderRepository>();
builder.Services.AddScoped<EmployeeRepository>();
builder.Services.AddScoped<RoleRepository>();
builder.Services.AddScoped<InvoiceRepository>();
builder.Services.AddScoped<PosCheckoutRepository>();
builder.Services.AddScoped<StorefrontRepository>();
builder.Services.AddScoped<ImportRepository>();

builder.Services.AddHttpContextAccessor();




// -------------------------
// Register Services
// -------------------------
builder.Services.AddScoped<ProductService>();
builder.Services.AddScoped<OrderService>();
builder.Services.AddScoped<InvoiceService>();
builder.Services.AddSingleton<InvoiceDetailCache>();
builder.Services.AddScoped<PosCheckoutService>();
builder.Services.AddScoped<StorefrontService>();
builder.Services.AddScoped<StorefrontAccountService>();
builder.Services.AddScoped<StorefrontCheckoutService>();
builder.Services.AddScoped<BankTransferService>();
builder.Services.AddScoped<RealtimeNotificationService>();
builder.Services.AddScoped<ActivityLogService>();
builder.Services.AddScoped<CustomerService>();
builder.Services.AddScoped<CategoryService>();
builder.Services.AddSingleton(typeof(BusMemoryCache<>));
builder.Services.AddScoped<UserService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<PromotionService>();
builder.Services.AddScoped<VoucherWalletService>();
builder.Services.AddScoped<StatisticsService>();
builder.Services.AddScoped<OrderItemService>();
builder.Services.AddScoped<InventoryService>();
builder.Services.AddScoped<PaymentService>();
builder.Services.AddScoped<ImportService>();
builder.Services.AddScoped<SupplierService>();
builder.Services.AddScoped<ReportsService>();
builder.Services.AddScoped<RevenueAnalyticsService>();
builder.Services.AddScoped<InvoiceStatisticsService>();
builder.Services.AddScoped<JwtService>();
builder.Services.AddScoped<UnitService>();
builder.Services.AddScoped<PurchaseOrderService>();
builder.Services.AddScoped<EmployeeService>();
builder.Services.AddScoped<RoleService>();

builder.Services.AddHttpClient();

// Configure file upload size limit
builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 10485760; // 10MB
});

// Authentication JWT
var key = JwtKeyStore.Resolve(builder.Configuration, builder.Environment.ContentRootPath);
builder.Configuration["Jwt:Key"] = key; // JwtService signs with the same resolved key.
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false; // true in production
    options.SaveToken = true;
    options.Events = new JwtBearerEvents
    {
        OnTokenValidated = SessionValidator.ValidateAsync,
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            if (!string.IsNullOrEmpty(accessToken) && context.HttpContext.Request.Path.StartsWithSegments("/hub/notifications"))
                context.Token = accessToken;
            return Task.CompletedTask;
        }
    };
    options.TokenValidationParameters = new TokenValidationParameters
    {
        RequireExpirationTime = false,
        ValidateLifetime = true,
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"],
        ValidAudience = builder.Configuration["Jwt:Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key))
    };
});

// -------------------------
// Configure CORS for React
// -------------------------
// Cors:AllowedOrigins (exact origins) is used when configured, e.g. for a deployed site. Without it only this
// machine and private LAN addresses are accepted, so the admin site/Expo web still work from another PC on the LAN.
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()?
    .Where(origin => !string.IsNullOrWhiteSpace(origin))
    .Select(origin => origin.Trim().TrimEnd('/'))
    .ToHashSet(StringComparer.OrdinalIgnoreCase) ?? new HashSet<string>(StringComparer.OrdinalIgnoreCase);

static bool IsLocalOrLanOrigin(string origin)
{
    if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri) || (uri.Scheme != "http" && uri.Scheme != "https"))
        return false;
    if (uri.IsLoopback) return true;
    if (!System.Net.IPAddress.TryParse(uri.Host, out var ip) ||
        ip.AddressFamily != System.Net.Sockets.AddressFamily.InterNetwork) return false;
    var b = ip.GetAddressBytes();
    return b[0] == 10 || (b[0] == 172 && b[1] >= 16 && b[1] <= 31) || (b[0] == 192 && b[1] == 168);
}

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReact", policy =>
    {
        policy.SetIsOriginAllowed(origin => allowedOrigins.Count > 0
                ? allowedOrigins.Contains(origin.TrimEnd('/'))
                : IsLocalOrLanOrigin(origin))
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

try
{
    await AuthorizationSchemaInitializer.InitializeAsync(app.Services);
}
catch (Exception ex)
{
    app.Logger.LogCritical(ex, "Database schema initialization failed.");
    throw;
}

// -------------------------
// Middleware pipeline
// -------------------------
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseRouting();

app.UseCors("AllowReact");

// Product images are public files and cannot send the API's bearer token via <img>.
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(
        Path.Combine(Directory.GetCurrentDirectory(), "wwwroot")),
    RequestPath = "", // Serve /assets/... directly.
    ServeUnknownFileTypes = false
});

// -------------------------
// Serve the built admin SPA (frontend/dist) when present. Public files, so this runs before authentication;
// otherwise the authorization fallback policy answers 401 for index.html and the JS bundle.
// -------------------------
var frontendDist = Path.Combine(Directory.GetCurrentDirectory(), "../frontend/dist");
if (Directory.Exists(frontendDist))
{
    var spaFiles = new PhysicalFileProvider(Path.GetFullPath(frontendDist));
    // Client-side routes (/dashboard, /pos...) have no file extension: answer them with index.html.
    app.Use(async (context, next) =>
    {
        var path = context.Request.Path;
        if (HttpMethods.IsGet(context.Request.Method) && context.GetEndpoint() == null &&
            !Path.HasExtension(path.Value) &&
            !path.StartsWithSegments("/api") && !path.StartsWithSegments("/hub") && !path.StartsWithSegments("/swagger"))
            context.Request.Path = "/index.html";
        await next();
    });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = spaFiles, RequestPath = "" });
}

// A missing image or bundle file is a 404, not a 401 from the authorization fallback policy.
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/assets") && context.GetEndpoint() == null)
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }
    await next();
});

// Xác thực JWT
app.UseAuthentication();
app.UseAuthorization();

// Middleware logging bây giờ sẽ đọc context.User chính xác
app.UseMiddleware<RequestLoggingMiddleware>();
app.UseHttpsRedirection();

app.MapControllers();
app.MapHub<NotificationHub>("/hub/notifications");

app.Run();
