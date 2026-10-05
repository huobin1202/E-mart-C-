const defaultHost = typeof window !== "undefined" && window.location?.hostname
  ? `http://${window.location.hostname}:5099/api`
  : "http://10.0.2.2:5099/api";
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || defaultHost).replace(/\/$/, "");
const API_ORIGIN = API_URL.replace(/\/api$/, "");

export const imageUrl = (path) => !path ? null : path.startsWith("http") ? path : `${API_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;

export const money = (value) => new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
}).format(value || 0);

async function readError(response) {
  const body = await response.json().catch(() => ({}));
  return body.message || body.title || "Không kết nối được cửa hàng. Hãy kiểm tra backend và địa chỉ API.";
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function fetchStorefront() {
  const [products, categories] = await Promise.all([
    requestJson(`${API_URL}/storefront/products`),
    requestJson(`${API_URL}/storefront/categories`),
  ]);

  return {
    products: Array.isArray(products) ? products : [],
    categories: Array.isArray(categories) ? categories : [],
  };
}

export function createStorefrontOrder(checkoutForm, cart) {
  return requestJson(`${API_URL}/storefront/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...checkoutForm,
      items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
    }),
  });
}
