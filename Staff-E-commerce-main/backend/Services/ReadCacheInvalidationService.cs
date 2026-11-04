using backend.DTO;
using backend.Models;

namespace backend.Services;

public sealed class ReadCacheInvalidationService(
    BusMemoryCache<ReportSnapshot> reportSnapshots,
    BusMemoryCache<CategoryDTO> categories,
    BusMemoryCache<CustomerResponseDTO> customers,
    BusMemoryCache<InventoryAdjustmentDTO> inventoryAdjustments,
    BusMemoryCache<Product> inventory,
    BusMemoryCache<InvoiceDTO> invoices,
    InvoiceDetailCache invoiceDetails,
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
        reportSnapshots.Clear();
        categories.Clear();
        customers.Clear();
        inventoryAdjustments.Clear();
        inventory.Clear();
        invoices.Clear();
        invoiceDetails.Clear();
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
