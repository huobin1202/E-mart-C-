import { useEffect, useSyncExternalStore } from "react";
import { jwtDecode } from "jwt-decode";
import { request } from "../api/apiClient";

/*
 * Access is shared by every component on the page (sidebar, topbar, route guard, page buttons).
 * It used to be per-component state, so each route change re-fetched /me/access and the
 * route guard showed "Đang kiểm tra quyền truy cập..." for a moment before the page —
 * the whole content area flashed and the page buttons popped in after the table.
 * Now it is loaded once per token and refreshed in the background on focus / permissions-changed.
 */
const TOKEN_KEY = "auth_token";
const EMPTY = Object.freeze([]);
let accessState = { token: null, permissions: EMPTY, loaded: false };
let inflight = null;
const listeners = new Set();
let windowListenersAttached = false;

const readToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};

const sameList = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

function setAccess(next) {
  if (accessState.token === next.token && accessState.loaded === next.loaded && sameList(accessState.permissions, next.permissions)) return;
  accessState = next;
  listeners.forEach((listener) => listener());
}

function loadAccess() {
  const token = readToken();
  if (!token) { setAccess({ token: null, permissions: EMPTY, loaded: false }); return Promise.resolve(); }
  if (inflight?.token === token) return inflight.promise;
  const promise = request("/me/access")
    .then((access) => {
      if (readToken() === token) setAccess({ token, permissions: access?.permissions ?? EMPTY, loaded: true });
    })
    .catch(() => {
      if (readToken() !== token) return;
      // A failed background refresh keeps the permissions already shown (the API still enforces them);
      // only a failed first load falls back to "no permission".
      if (accessState.token === token && accessState.loaded) return;
      setAccess({ token, permissions: EMPTY, loaded: true });
    })
    .finally(() => { if (inflight?.promise === promise) inflight = null; });
  inflight = { token, promise };
  return promise;
}

function subscribe(listener) {
  listeners.add(listener);
  if (!windowListenersAttached && typeof window !== "undefined") {
    windowListenersAttached = true;
    window.addEventListener("focus", loadAccess);
    window.addEventListener("permissions-changed", loadAccess);
  }
  return () => listeners.delete(listener);
}

const getSnapshot = () => accessState;

let userCache = { token: undefined, user: null };
function decodeUser(token) {
  if (userCache.token === token) return userCache.user;
  let user = null;
  if (token) {
    try {
      const decoded = jwtDecode(token);
      user = {
        id: decoded.uid || decoded.sub,
        username: decoded["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"] || decoded.unique_name || decoded.sub,
        email: decoded["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"] || decoded.email || null,
        role: decoded["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] || decoded.role,
        fullName:
          decoded["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"] ||
          decoded.fullname ||
          decoded["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"] ||
          decoded.sub,
      };
    } catch (error) {
      console.error("Invalid token:", error);
      user = null;
    }
  }
  userCache = { token, user };
  return user;
}

export const useAuth = () => {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const token = readToken();
  const current = snapshot.token === token && !!token;

  const user = decodeUser(token);

  useEffect(() => {
    if (token && !user) { try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } }
  }, [token, user]);

  useEffect(() => {
    if (!current || !snapshot.loaded) loadAccess();
  }, [current, snapshot.loaded]);

  return {
    user,
    loading: false,
    permissions: current ? snapshot.permissions : EMPTY,
    permissionsLoaded: current && snapshot.loaded,
  };
};
