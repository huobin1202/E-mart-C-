// src/api/apiClient.js
import { trackRequestStart, trackRequestEnd } from "../utils/requestTracker";

const BASE_URL = "http://localhost:5099/api";
const USER_ID_STORAGE_KEY = "currentUserId";
const AUTH_TOKEN_KEY = "auth_token";
const AUTH_REFRESH_KEY = "auth_refresh_token";

let cachedAuthToken = null;
let onUnauthorizedCallback = null;
let cachedUserId = null;

function getCurrentUserId() {
  if (cachedUserId) return cachedUserId;

  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(USER_ID_STORAGE_KEY);
    if (stored) {
      cachedUserId = stored;
      return cachedUserId;
    }
  }

  return null;
}

function setCurrentUserId(id) {
  cachedUserId = String(id);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(USER_ID_STORAGE_KEY, cachedUserId);
  }
}

/** ---------- Auth token helpers ---------- */
function setAuthToken(token, { persist = true } = {}) {
  cachedAuthToken = token;
  if (persist && typeof window !== "undefined") {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  }
}

function getAuthToken() {
  if (cachedAuthToken) {
    if (isTokenExpired(cachedAuthToken)) {
      clearAuthToken();
      return null;
    }
    return cachedAuthToken;
  }

  if (typeof window !== "undefined") {
    const t = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (t) {
      if (isTokenExpired(t)) {
        clearAuthToken();
        return null;
      }
      cachedAuthToken = t;
      return t;
    }
  }
  return null;
}

function clearAuthToken() {
  cachedAuthToken = null;
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_REFRESH_KEY);
  }
}

function isTokenExpired(token) {
  if (!token) return true;

  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const decoded = JSON.parse(jsonPayload);

    // exp is in seconds, Date.now() is in milliseconds
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      console.log("⏰ Token expired");
      return true;
    }
    return false;
  } catch (error) {
    console.error("❌ Token decode error:", error);
    return true;
  }
}

/** optional: register a callback when server returns 401 (unauthorized) */
function onUnauthorized(cb) {
  onUnauthorizedCallback = cb;
}

/** optional helper to get refresh token (if implemented) */
export function getRefreshToken() {
  if (typeof window !== "undefined") {
    return window.localStorage.getItem(AUTH_REFRESH_KEY);
  }
  return null;
}

export function setRefreshToken(token) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(AUTH_REFRESH_KEY, token);
  }
}

/** ---------- core request helper ---------- */
export async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const isLoginPath = path.toLowerCase().startsWith("/auth/login");

  // Build headers
  const defaultHeaders = {
    "Content-Type": "application/json",
  };

  const token = getAuthToken();
  if (token && !options.skipAuth) {
    defaultHeaders["Authorization"] = `Bearer ${token}`;
  }

  const currentUserId = getCurrentUserId();
  if (currentUserId) {
    defaultHeaders["X-User-Id"] = currentUserId;
  }

  const headers = {
    ...defaultHeaders,
    ...(options.headers || {}),
  };

  const fetchOptions = {
    ...options,
    headers,
  };

  if (
    fetchOptions.body &&
    typeof fetchOptions.body === "object" &&
    !(fetchOptions.body instanceof FormData)
  ) {
    fetchOptions.body = JSON.stringify(fetchOptions.body);
  }

  trackRequestStart();
  try {
    const res = await fetch(url, fetchOptions);

    // Handle 401 explicitly (optionally attempt refresh)
    if (res.status === 401) {
      let displayMessage = isLoginPath
        ? "Sai tài khoản hoặc mật khẩu, vui lòng đăng nhập lại."
        : "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.";
      try {
        const errText = await res.text();
        const parsed = errText ? JSON.parse(errText) : null;
        if (parsed) {
          if (typeof parsed === "string") {
            displayMessage = parsed;
          } else if (parsed.message) {
            displayMessage = parsed.message;
          }
        }
      } catch (_) {
        // ignore parse errors, keep default message
      }

      // call optional callback (e.g. redirect to login)

      if (path === "/auth/login" || options.skipAuth) {
        // Parse error message từ backend
        const errText = await res.text();
        let errorMessage = "Invalid username or password";

        try {
          const parsed = JSON.parse(errText);
          if (parsed?.message) {
            errorMessage = parsed.message;
          }
        } catch (_) {
          errorMessage = errText || errorMessage;
        }

        throw new Error(errorMessage);
      }

      clearAuthToken();

      if (typeof onUnauthorizedCallback === "function") {
        onUnauthorizedCallback();
      } else {
        // default behaviour: clear token + local user info
        logout();
      }

      // throw descriptive error
      throw new Error(displayMessage);
    }

    if (!res.ok) {
      const errText = await res.text();
      let displayMessage = errText;
      try {
        const parsed = errText ? JSON.parse(errText) : null;
        if (parsed) {
          if (typeof parsed === "string") {
            displayMessage = parsed;
          } else if (parsed.message) {
            displayMessage = parsed.message;
          } else if (parsed.errors && typeof parsed.errors === "object") {
            const firstKey = Object.keys(parsed.errors)[0];
            if (firstKey && Array.isArray(parsed.errors[firstKey])) {
              displayMessage = parsed.errors[firstKey][0];
            }
          }
        }
        // eslint-disable-next-line no-unused-vars
      } catch (_) {
        // ignore JSON parse errors, fall back to raw text
      }
      throw new Error(displayMessage || `${res.status} ${res.statusText}`);
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return res.json();
    }
    return res.text();
  } finally {
    trackRequestEnd();
  }
}

/** ---------- Auth endpoints helpers ---------- */
/**
 * login: calls backend /auth/login
 * On success, setAuthToken(...) is called automatically.
 * Backend expected to return { token, refreshToken?, expiresIn?, userName?, role? }
 */
export async function login(username, password) {
  const data = await request("/auth/login", {
    method: "POST",
    body: { username, password },
    skipAuth: true, // no auth header for login
  });
  // adapt to your backend response shape
  if (data?.token) {
    setAuthToken(data.token, { persist: true });
    if (data.refreshToken) setRefreshToken(data.refreshToken);

    // Prefer explicit userId from backend; fallback to decode token
    if (data.userId) {
      setCurrentUserId(data.userId);
    } else {
      try {
        const base64Url = data.token.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split("")
            .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
            .join("")
        );
        const decoded = JSON.parse(jsonPayload);
        if (decoded?.uid) setCurrentUserId(decoded.uid);
      } catch (_) {
        // ignore decode errors
      }
    }
  }
  return data;
}

export async function register(username, password, extra = {}) {
  const body = { username, password, ...extra };
  return request("/auth/register", {
    method: "POST",
    body,
    skipAuth: true,
  });
}

export function logout() {
  clearAuthToken();

  // Xóa refresh token
  if (typeof window !== "undefined") {
    localStorage.removeItem(AUTH_REFRESH_KEY);
  }

  // Xóa user info
  cachedUserId = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem(USER_ID_STORAGE_KEY);
    localStorage.removeItem("user_role");
    localStorage.removeItem("user_name");
  }
}

// Products -------------------------------------------------------------

// export async function getProductsAll() {
//   return request("/products");
// }

export async function getProductsPaginated(
  page = 1,
  pageSize = 10,
  search = "",
  categoryId = null,
  supplierId = null,
  minPrice = null,
  maxPrice = null,
  sortBy = "",
  status = null
) {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    ...(search && { search }),
    ...(categoryId && { categoryId: categoryId.toString() }),
    ...(supplierId && { supplierId: supplierId.toString() }),
    ...(minPrice && { minPrice: minPrice.toString() }),
    ...(maxPrice && { maxPrice: maxPrice.toString() }),
    ...(sortBy && { sortBy }),
    ...(status && { status: status.toString() }),
  });
  return request(`/products/paginated?${params}`);
}

export async function getProductByBarcode(barcode) {
  return request(`/products/barcode/${encodeURIComponent(barcode)}`);
}

export const getPaginatedProducts = getProductsPaginated;

// Users -------------------------------------------------------------

export async function getUsersPaginated(page = 1, pageSize = 10) {
  const q = `?page=${page}&pageSize=${pageSize}`;
  return request(`/users/paginated${q}`);
}

export async function getUserById(id) {
  return request(`/users/${id}`);
}

export async function createUser(payload) {
  return request("/users", {
    method: "POST",
    body: payload,
  });
}

export async function updateUser(id, payload) {
  return request(`/users/${id}`, {
    method: "PUT",
    body: payload,
  });
}

export async function deleteUser(id) {
  return request(`/users/${id}`, {
    method: "DELETE",
  });
}

export async function updateUserStatus(id, isActive) {
  return request(`/users/${id}/status?isActive=${isActive}`, {
    method: "PATCH",
  });
}

// Profile -------------------------------------------------------------

export async function getMyProfile() {
  return request("/me");
}

export async function updateMyProfile(payload) {
  return request("/me", {
    method: "PUT",
    body: payload,
  });
}

export async function changeMyPassword(payload) {
  return request("/me/change-password", {
    method: "PUT",
    body: payload,
  });
}

// export { BASE_URL, request, getCurrentUserId };
// export { BASE_URL, getCurrentUserId };
export {
  BASE_URL,
  getCurrentUserId,
  setCurrentUserId,
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  isTokenExpired,
  onUnauthorized,
};
