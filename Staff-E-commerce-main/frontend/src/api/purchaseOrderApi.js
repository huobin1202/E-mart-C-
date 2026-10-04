import { request } from "./apiClient";

export function getPurchaseOrders({ page = 1, pageSize = 10, search = "", status = "", supplierId = "" } = {}) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  if (supplierId) params.set("supplierId", String(supplierId));
  return request(`/purchase-orders?${params}`);
}

export const getPurchaseOrderById = (id) => request(`/purchase-orders/${id}`);
export const createPurchaseOrder = (payload) => request("/purchase-orders", { method: "POST", body: payload });
export const completePurchaseOrder = (id) => request(`/purchase-orders/${id}/complete`, { method: "POST" });
export const cancelPurchaseOrder = (id) => request(`/purchase-orders/${id}/cancel`, { method: "POST" });
