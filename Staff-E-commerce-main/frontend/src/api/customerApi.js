import { request } from "./apiClient";

// Lấy danh sách khách hàng với phân trang
export async function getCustomers(
  page = 1,
  pageSize = 5,
  search = "",
  status = "all"
) {
  const params = new URLSearchParams({
    page,
    pageSize,
    keyword: search,
    status: status === "all" ? "" : status,
  });
  return request(`/customers?${params}`);
}

// Lấy chi tiết khách hàng
export async function getCustomerById(customerId) {
  return request(`/customers/${customerId}`);
}


// Tạo khách hàng mới
export async function createCustomer(customerData) {
  return request("/customers", {
    method: "POST",
    body: JSON.stringify(customerData),
  });
}

// Cập nhật thông tin khách hàng
export async function updateCustomer(customerId, customerData) {
  return request(`/customers/${customerId}`, {
    method: "PATCH",
    body: JSON.stringify(customerData),
  });
}

// Kích hoạt/Ngừng hoạt động khách hàng
export async function toggleCustomerStatus(customerId, isActive) {
  return request(`/customers/${customerId}`, {
    method: "PUT",
    body: JSON.stringify({ IsActive: isActive }),
  });
}

// Xóa khách hàng
export async function deleteCustomer(customerId) {
  return request(`/customers/${customerId}`, {
    method: "DELETE",
  });
}

// Lấy thống kê khách hàng
export async function getCustomerStats() {
  return request("/customers/stats");
}

// Lấy lịch sử điểm của khách hàng
export async function getCustomerPointHistory(
  customerId,
  page = 1,
  pageSize = 10
) {
  const params = new URLSearchParams({ page, pageSize });
  return request(`/customers/${customerId}/point-history?${params}`);
}

// Lấy lịch sử mua hàng của khách hàng
export async function getCustomerOrderHistory(
  customerId,
  page = 1,
  pageSize = 10
) {
  const params = new URLSearchParams({ page, pageSize });
  return request(`/customers/${customerId}/orders?${params}`);
}

export default {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  toggleCustomerStatus,
  deleteCustomer,
  getCustomerStats,
  getCustomerPointHistory,
  getCustomerOrderHistory,
};
