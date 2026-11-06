// Supplier "Miền". Values must match backend Helpers/SupplierRegion.cs; null/empty = chưa phân loại.
export const SUPPLIER_REGIONS = ["Bắc", "Trung", "Nam"];
export const UNCLASSIFIED_REGION = "none";

export const supplierRegionLabel = (region) => (region ? `Miền ${region}` : "Chưa phân loại");

/** filter: "all" | "Bắc" | "Trung" | "Nam" | "none" */
export const matchesSupplierRegion = (supplier, filter) => {
  if (!filter || filter === "all") return true;
  if (filter === UNCLASSIFIED_REGION) return !supplier?.region;
  return supplier?.region === filter;
};
