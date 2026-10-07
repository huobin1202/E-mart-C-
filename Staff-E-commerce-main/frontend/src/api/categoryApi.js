import { request } from "./apiClient";

// Lấy danh sách categories với phân trang
export async function getCategories(
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
  return request(`/categories?${params}`);
}

// Lấy chi tiết category
export async function getCategoryById(categoryId) {
  return request(`/categories/${categoryId}`);
}

// Tạo category mới
export async function createCategory(categoryData) {
  return request("/categories", {
    method: "POST",
    body: JSON.stringify(categoryData),
  });
}

// Cập nhật thông tin category
export async function updateCategory(categoryId, categoryData) {
  return request(`/categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify(categoryData),
  });
}

// Kích hoạt/Ngừng hoạt động category
export async function toggleCategoryStatus(categoryId, isActive) {
  return request(`/categories/${categoryId}`, {
    method: "PUT",
    body: JSON.stringify({ IsActive: isActive }),
  });
}

// Xóa category
export async function deleteCategory(categoryId) {
  return request(`/categories/${categoryId}`, {
    method: "DELETE",
  });
}

// Lấy tất cả categories (không phân trang)
export async function getAllCategories() {
  const data = await request("/categories/all");
  return Array.isArray(data) ? data : (data?.items || data?.value || []);
}

export default {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  toggleCategoryStatus,
  deleteCategory,
  getAllCategories,
};
