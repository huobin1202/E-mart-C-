// src/api/importApi.js
import { BASE_URL, getCurrentUserId, getAuthToken } from "./apiClient";

export async function exportMasterExcel(type) {
  const response = await fetch(`${BASE_URL}/import/export/${type}`, { headers: { Authorization: `Bearer ${getAuthToken() || ''}` } });
  if (!response.ok) throw new Error('Không thể xuất Excel. Vui lòng kiểm tra quyền truy cập.');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href = url; link.download = `${type}.xlsx`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Import sản phẩm từ file
 * @param {File} file - File CSV hoặc Excel
 * @returns {Promise<Object>} Kết quả import
 */
export async function importProducts(file) {
  const formData = new FormData();
  formData.append("file", file);

  const currentUserId = getCurrentUserId();
  const headers = { Authorization: `Bearer ${getAuthToken() || ""}` };
  if (currentUserId) {
    headers["X-User-Id"] = currentUserId;
  }

  const response = await fetch(`${BASE_URL}/import/products`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = errorText;
    try {
      const parsed = JSON.parse(errorText);
      errorMessage = parsed.message || errorText;
    } catch {
      // Ignore JSON parse errors
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

/**
 * Import khách hàng từ file
 * @param {File} file - File CSV hoặc Excel
 * @returns {Promise<Object>} Kết quả import
 */
export async function importCustomers(file) {
  const formData = new FormData();
  formData.append("file", file);

  const currentUserId = getCurrentUserId();
  const headers = { Authorization: `Bearer ${getAuthToken() || ""}` };
  if (currentUserId) {
    headers["X-User-Id"] = currentUserId;
  }

  const response = await fetch(`${BASE_URL}/import/customers`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = errorText;
    try {
      const parsed = JSON.parse(errorText);
      errorMessage = parsed.message || errorText;
    } catch {
      // Ignore JSON parse errors
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

/**
 * Download template file cho sản phẩm
 * @param {string} format - 'csv' hoặc 'excel'
 */
export async function downloadProductTemplate(format = "excel") {
  try {
    const currentUserId = getCurrentUserId();
    const headers = { Authorization: `Bearer ${getAuthToken() || ""}` };
    if (currentUserId) {
      headers["X-User-Id"] = currentUserId;
    }

    const response = await fetch(
      `${BASE_URL}/import/template/products?format=${format}`,
      {
        headers,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = "Không thể tải template";
      try {
        const parsed = JSON.parse(errorText);
        errorMessage = parsed.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const blob = await response.blob();
    
    // Kiểm tra nếu response là JSON error thay vì file
    if (blob.type && blob.type.includes("application/json")) {
      const text = await blob.text();
      const parsed = JSON.parse(text);
      throw new Error(parsed.message || "Lỗi khi tải template");
    }

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      format === "csv" ? "product_template.csv" : "product_template.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Error downloading template:", error);
    throw error;
  }
}

/**
 * Download template file cho khách hàng
 * @param {string} format - 'csv' hoặc 'excel'
 */
export async function downloadCustomerTemplate(format = "excel") {
  const currentUserId = getCurrentUserId();
  const headers = { Authorization: `Bearer ${getAuthToken() || ""}` };
  if (currentUserId) {
    headers["X-User-Id"] = currentUserId;
  }

  const response = await fetch(
    `${BASE_URL}/import/template/customers?format=${format}`,
    {
      headers,
    }
  );

  if (!response.ok) {
    throw new Error("Không thể tải template");
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    format === "csv" ? "customer_template.csv" : "customer_template.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

