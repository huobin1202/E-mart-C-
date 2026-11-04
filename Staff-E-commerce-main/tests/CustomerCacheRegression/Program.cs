using backend.DTO;
using backend.Models;
using backend.Services;
using Microsoft.Extensions.Logging.Abstractions;

var cache = new BusMemoryCache<CustomerResponseDTO>(NullLogger<BusMemoryCache<CustomerResponseDTO>>.Instance);
cache.Replace(new[] {
    new CustomerResponseDTO { Id = 1, FullName = "An", Phone = "0909000001", IsActive = true, CreatedAt = new(2026,1,1) },
    new CustomerResponseDTO { Id = 2, FullName = "Binh", Phone = "0909000002", IsActive = false, CreatedAt = new(2026,2,1) }
});
// Deliberately omit the DAO: every warm-cache read must succeed without touching SQL.
var service = new CustomerService(null!, cache);
var checks = 0;
void Check(bool result) { if (!result) throw new Exception("Customer BUS cache regression"); checks++; }
var page = await service.GetFilteredAndPaginatedAsync(1, 1);
Check(page.TotalItems == 2 && page.Items.Single().Id == 2);
Check((await service.GetFilteredAndPaginatedAsync(2, 1)).Items.Single().Id == 1);
Check((await service.GetFilteredAndPaginatedAsync(1, 25, "AN", "active")).Items.Single().Id == 1);
Check((await service.GetFilteredAndPaginatedAsync(1, 1, status: "inactive")).TotalItems == 1);
service.SyncRegisteredCustomer(new Customer { Id = 3, FullName = "Chi", Phone = "0909000003", IsActive = true, CreatedAt = new(2026,3,1) });
Check((await service.GetFilteredAndPaginatedAsync(1, 25)).Items.First().Id == 3);
service.SyncRegisteredCustomer(new Customer { Id = 1, FullName = "An updated", Phone = "0909000001", IsActive = false, CreatedAt = new(2026,1,1) });
Check((await service.GetFilteredAndPaginatedAsync(1, 25, "updated", "inactive")).Items.Single().Id == 1);
cache.RemoveWhere(customer => customer.Id == 2);
Check((await service.GetFilteredAndPaginatedAsync(1, 25)).TotalItems == 2);
Console.WriteLine($"PASS: {checks} customer cache checks, no database access.");
