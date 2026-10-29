using backend.DTO;
using backend.Models;

namespace backend.Services;

public sealed class ReadCacheInvalidationService(
    BusMemoryCache<CategoryDTO> categories,
    BusMemoryCache<CustomerResponseDTO> customers,
    BusMemoryCache<InventoryAdjustmentDTO> inventoryAdjustments,
    BusMemoryCache<Product> inventory,
    BusMemoryCache<InvoiceDTO> invoices,
    BusMemoryCache<ProductDTO> products,
    BusMemoryCache<PromotionDTO> promotions,
    BusMemoryCache<PurchaseOrderListDTO> purchaseOrders,
    BusMemoryCache<Permission> permissions,
    BusMemoryCache<RoleDTO> roles,
    BusMemoryCache<StorefrontCategoryDTO> storefrontCategories,
    BusMemoryCache<SupplierDTO> suppliers,
    BusMemoryCache<UnitDTO> units,
    BusMemoryCache<UserDTO> users)
{
    public void ClearAll()
    {
        categories.Clear();
        customers.Clear();
        inventoryAdjustments.Clear();
        inventory.Clear();
        invoices.Clear();
        products.Clear();
        promotions.Clear();
        purchaseOrders.Clear();
        permissions.Clear();
        roles.Clear();
        storefrontCategories.Clear();
        suppliers.Clear();
        units.Clear();
        users.Clear();
    }
}
