import { request } from "./apiClient";

// Lấy danh sách inventory với phân trang
export async function getInventoryPaginated(
  page = 1,
  pageSize = 10,
  search = "",
  sortBy = "",
  stockStatus = ""
) {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    ...(search && { search }),
    ...(sortBy && { sortBy }),
    ...(stockStatus && { stockStatus }),
  });
  return request(`/inventory/paginated?${params}`);
}

// Điều chỉnh số lượng tồn kho
export async function adjustInventory(inventoryId, newQuantity, reason = "") {
  return request("/inventory/adjust", {
    method: "PUT",
    body: JSON.stringify({
      inventoryId,
      newQuantity,
      reason,
    }),
  });
}

// Lấy thống kê tồn kho
export async function getInventoryStats() {
  return request("/inventory/stats");
}

// Lấy lịch sử điều chỉnh kho
export async function getInventoryAdjustmentHistory(page = 1, pageSize = 20, productId = null, search = '') {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    ...(productId && { productId: productId.toString() }),
    ...(search && { search }),
  });
  return request(`/inventory/adjustments?${params}`);
}

export default {
  getInventoryPaginated,
  adjustInventory,
  getInventoryStats,
  getInventoryAdjustmentHistory,
};
