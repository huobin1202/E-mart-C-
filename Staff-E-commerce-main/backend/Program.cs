using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Authorization;
using backend.Data;
using backend.Repository;
using backend.Services;
using backend.Services.AI;
using backend.Services.AI.Chat;
using backend.Services.AI.Embeddings;
using backend.Services.AI.SemanticSearch;
using backend.Services.AI.VectorStore;

using backend.Middlewares;
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
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        // Giữ cả ReferenceHandler.IgnoreCycles (bạn bè) và PropertyNamingPolicy (cả 2)
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;

        // Nếu muốn, có thể dùng ReferenceHandler.Preserve
        // options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.Preserve;
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
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
    options.UseSqlServer(connectionString, sqlOptions =>
    {
        sqlOptions.EnableRetryOnFailure();
    })
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
builder.Services.AddScoped<UnitRepository>();
builder.Services.AddScoped<AiRepository>();

builder.Services.AddHttpContextAccessor();




// -------------------------
// Register Services
// -------------------------
builder.Services.AddScoped<ProductService>();
builder.Services.AddScoped<OrderService>();
builder.Services.AddScoped<ActivityLogService>();
builder.Services.AddScoped<CustomerService>();
builder.Services.AddScoped<CategoryService>();
builder.Services.AddScoped<UserService>();
builder.Services.AddScoped<PromotionService>();
builder.Services.AddScoped<StatisticsService>();
builder.Services.AddScoped<OrderItemService>();
builder.Services.AddScoped<InventoryService>();
builder.Services.AddScoped<PaymentService>();
builder.Services.AddScoped<ImportService>();
builder.Services.AddScoped<CategoryService>();
builder.Services.AddScoped<SupplierService>();
builder.Services.AddScoped<ReportsService>();
builder.Services.AddScoped<JwtService>();
builder.Services.AddScoped<UnitService>();

// AI Service - Semantic Kernel + Chat
builder.Services.AddSingleton<TokenizerService>();
builder.Services.AddSingleton<RateLimitService>();
builder.Services.AddScoped<ContextManager>();
builder.Services.AddScoped<SemanticKernelService>();

// AI Services - Embeddings, VectorStore, SemanticSearch
builder.Services.AddScoped<IEmbeddingService, EmbeddingService>();
builder.Services.AddSingleton<IVectorStoreService, QdrantVectorStoreService>();
builder.Services.AddScoped<ISemanticSearchService, ProductSemanticSearchService>();

// AI Indexing Services
builder.Services.AddScoped<IProductIndexingService, ProductIndexingService>();

// [AUTO-INDEX] Tự động index Products khi server khởi động 
// builder.Services.AddHostedService<SemanticIndexingHostedService>();

builder.Services.AddHttpClient();

// Configure file upload size limit
builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 10485760; // 10MB
});

// Authentication JWT
var key = builder.Configuration["Jwt:Key"];
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false; // true in production
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
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
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReact", policy =>
    {
        policy.WithOrigins(
                "http://localhost:5173",
                "https://localhost:5173",
                "http://localhost:3000",
                "https://localhost:3000"
            )
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

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

// Xác thực JWT
app.UseAuthentication();
app.UseAuthorization();

// Middleware logging bây giờ sẽ đọc context.User chính xác
app.UseMiddleware<RequestLoggingMiddleware>();
app.UseHttpsRedirection();

app.MapControllers();

// -------------------------
// Serve frontend SPA (Vite)
// -------------------------
var frontendDist = Path.Combine(Directory.GetCurrentDirectory(), "../frontend/dist");
if (Directory.Exists(frontendDist))
{
    var fileProvider = new PhysicalFileProvider(frontendDist);

    app.UseDefaultFiles(new DefaultFilesOptions
    {
        FileProvider = fileProvider,
        RequestPath = ""
    });
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = fileProvider,
        RequestPath = ""
    });

    // Fallback SPA routing (cho các route không phải API và không có file extension)
    app.Use(async (context, next) =>
    {
        await next();

        if (context.Response.StatusCode == 404 &&
            !Path.HasExtension(context.Request.Path.Value) &&
            !context.Request.Path.Value.StartsWith("/api"))
        {
            context.Request.Path = "/index.html";
            context.Response.StatusCode = 200;
            await next();
        }
    });

    // Serve fallback file
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = fileProvider,
        RequestPath = ""
    });
}

app.Run();
