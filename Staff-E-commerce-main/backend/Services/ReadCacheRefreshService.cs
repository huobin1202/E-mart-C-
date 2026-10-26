using backend.Controllers;
using backend.DTO;
using backend.Models;
using backend.Repository;

namespace backend.Services;

public sealed class ReadCacheRefreshGate { public SemaphoreSlim Gate { get; } = new(1, 1); }

// Refresh only already-used read models, during a write request and after its transaction.
// A fresh scope prevents EF's identity map from publishing stale tracked entities.
public sealed class ReadCacheRefreshService(IServiceScopeFactory scopes, ReadCacheRefreshGate gate)
{
    public async Task RefreshAsync()
    {
        await gate.Gate.WaitAsync();
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var services = scope.ServiceProvider;
            var failures = new List<Exception>();
            T Get<T>() where T : notnull => services.GetRequiredService<T>();
            async Task Refresh<T>(Func<Task<List<T>>> load)
            {
                var cache = Get<BusMemoryCache<T>>();
                if (!cache.HasSnapshot) return;
                try { cache.Replace(await load()); }
                catch (Exception ex) { cache.Clear(); failures.Add(ex); }
            }
            await Refresh(() => Get<ProductService>().LoadCacheAsync());
            await Refresh(() => Get<StorefrontService>().LoadProductsAsync());
            await Refresh(async () => (await Get<StorefrontRepository>().GetActiveCategoriesAsync()).Select(c => new StorefrontCategoryResponse { Id = c.Id, Name = c.Name }).ToList());
            await Refresh(() => Get<InventoryRepository>().GetAllForCacheAsync());
            await Refresh(() => Get<InventoryRepository>().GetAdjustmentHistoryAsync());
            await Refresh(() => Get<OrderRepository>().GetAllForCacheAsync());
            await Refresh(() => Get<OrderService>().LoadOnlineCacheAsync());
            await Refresh(() => Get<InvoiceRepository>().GetCompletedInvoiceDtosAsync());
            await Refresh(async () => (await Get<CustomerRepository>().GetAllAsync()).Select(CustomerService.MapToCustomerResponseDto).ToList());
            await Refresh(async () => (await Get<PromotionRepository>().GetAllAsync()).Select(PromotionService.MapToDTO).ToList());
            await Refresh(async () => (await Get<UserRepository>().GetAllAsync()).Select(UserService.MapToUserDto).ToList());
            await Refresh(async () => (await Get<EmployeeRepository>().GetAllAsync()).Select(EmployeeService.Map).ToList());
            await Refresh(async () => (await Get<CategoryRepository>().GetAllAsync()).Select(CategoryService.MapToDto).ToList());
            await Refresh(async () => (await Get<SupplierRepository>().GetAllAsync()).Select(SupplierService.MapToDto).ToList());
            await Refresh(async () => {
                var units = await Get<UnitRepository>().GetAllAsync();
                var counts = await Get<UnitRepository>().GetProductCountByUnitAsync();
                return units.Select(u => UnitService.Map(u, counts.GetValueOrDefault(u.Id, 0))).ToList();
            });
            await Refresh(() => Get<PurchaseOrderRepository>().GetAllForCacheAsync());
            await Refresh(async () => (await Get<RoleRepository>().GetAllAsync()).Select(RoleService.Map).ToList());
            await Refresh(() => Get<RoleRepository>().GetPermissionsAsync());
            if (failures.Count > 0) throw new AggregateException("Some read models could not be refreshed.", failures);
        }
        finally { gate.Gate.Release(); }
    }
}
