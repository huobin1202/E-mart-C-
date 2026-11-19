using backend.Controllers;
using backend.DTO;
using backend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;

// Seed only the search cache. No connection to the application database is made.
var products = Enumerable.Range(1, 205).Select(id => new ProductDTO { Id = id, ProductName = $"Coffee {id:D3}", Sku = $"SKU-{id}" }).ToList();
products.Add(new ProductDTO { Id = 900, ProductName = "Exact code", Sku = "coffee", Barcode = "893-CODE" });
var cache = new BusMemoryCache<ProductDTO>(NullLogger<BusMemoryCache<ProductDTO>>.Instance);
await cache.GetOrCreateAsync(() => Task.FromResult(products), TimeSpan.FromMinutes(12));
var service = new ProductService(null!, null!, null!, cache, new BusMemoryCache<SupplierDTO>(NullLogger<BusMemoryCache<SupplierDTO>>.Instance));
var checks = 0;
void Check(bool condition, string label) { if (!condition) throw new Exception(label); checks++; }
Check((await service.SearchProductsAsync("coffee", 5)).Count == 5, "Only five suggestions");
Check((await service.SearchProductsAsync("coffee", 1)).Single().Id == 900, "Exact SKU precedes partial name matches");
Check((await service.SearchProductsAsync(" 893-code ", 5)).Single().Id == 900, "Case-insensitive barcode and whitespace");
Check((await service.SearchProductsAsync("SKU-205", 5)).Single().Id == 205, "Search by product code");
Check((await service.SearchProductsAsync("coffee")).Count == 50, "Existing callers retain their default result limit");
Check((await service.SearchProductsAsync("coffee", 5000)).Count == 200, "Server limits large requested result counts");
Check((await service.SearchProductsAsync("coffee", 0)).Count == 1, "Nonpositive requested limit is bounded");
Check((await service.SearchProductsAsync(" ", 5)).Count == 0, "Blank query does not enumerate products");
var controller = new ProductsController(service);
var response = await controller.SearchProducts("coffee", 5);
Check(response.Result is OkObjectResult { Value: List<ProductDTO> result } && result.Count == 5, "API forwards the requested suggestion limit");
Console.WriteLine($"PASS: {checks} product lookup regression checks (no application database used).");
