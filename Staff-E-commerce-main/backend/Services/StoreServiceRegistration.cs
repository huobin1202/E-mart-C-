using backend.Repository;
using backend.Security;
using backend.Hubs;
using Microsoft.AspNetCore.Authorization;

namespace backend.Services;

public static class StoreServiceRegistration
{
    public static IServiceCollection AddStoreServices(this IServiceCollection services)
    {
        services.AddScoped<PermissionFilter>();
        services.AddScoped<AccountMutationFilter>();
        services.AddSingleton<ReadCacheRefreshGate>();
        services.AddScoped<ReadCacheRefreshService>();
        services.AddScoped<ReadCacheRefreshFilter>();
        services.AddSingleton<OrderConnectionRegistry>();
        services.AddScoped<OrderNotifications>();
        services.AddScoped<ProductRepository>();
        services.AddScoped<OrderRepository>();
        services.AddScoped<UserRepository>();
        services.AddScoped<CustomerRepository>();
        services.AddScoped<ActivityLogRepository>();
        services.AddScoped<PromotionRepository>();
        services.AddScoped<StatisticsRepository>();
        services.AddScoped<OrderItemRepository>();
        services.AddScoped<InventoryRepository>();
        services.AddScoped<PaymentRepository>();
        services.AddScoped<CategoryRepository>();
        services.AddScoped<SupplierRepository>();
        services.AddScoped<ReportsRepository>();
        services.AddScoped<RevenueAnalyticsRepository>();
        services.AddScoped<UnitRepository>();
        services.AddScoped<PurchaseOrderRepository>();
        services.AddScoped<EmployeeRepository>();
        services.AddScoped<RoleRepository>();
        services.AddScoped<InvoiceRepository>();
        services.AddScoped<PosCheckoutRepository>();
        services.AddScoped<StorefrontRepository>();
        services.AddScoped<ImportRepository>();
        services.AddScoped<ProductService>();
        services.AddScoped<OrderService>();
        services.AddScoped<InvoiceService>();
        services.AddScoped<PosCheckoutService>();
        services.AddScoped<StorefrontService>();
        services.AddScoped<StorefrontCheckoutService>();
        services.AddScoped<BankTransferService>();
        services.AddScoped<ActivityLogService>();
        services.AddScoped<CustomerService>();
        services.AddScoped<CategoryService>();
        services.AddScoped<UserService>();
        services.AddScoped<AuthService>();
        services.AddScoped<PromotionService>();
        services.AddScoped<StatisticsService>();
        services.AddScoped<OrderItemService>();
        services.AddScoped<InventoryService>();
        services.AddScoped<PaymentService>();
        services.AddScoped<OnlinePaymentService>();
        services.AddScoped<ImportService>();
        services.AddScoped<SupplierService>();
        services.AddScoped<ReportsService>();
        services.AddScoped<RevenueAnalyticsService>();
        services.AddScoped<JwtService>();
        services.AddScoped<UnitService>();
        services.AddScoped<PurchaseOrderService>();
        services.AddScoped<EmployeeService>();
        services.AddScoped<RoleService>();
        services.AddSingleton(typeof(BusMemoryCache<>));
        services.AddHttpContextAccessor();
        services.AddHttpClient();
        services.AddSignalR();
        services.AddScoped<IAuthorizationHandler, OrdersReadAuthorizationHandler>();
        services.AddAuthorization(options => options.AddPolicy("orders.realtime", policy =>
            policy.RequireAuthenticatedUser().AddRequirements(new OrdersReadRequirement())));
        return services;
    }
}
