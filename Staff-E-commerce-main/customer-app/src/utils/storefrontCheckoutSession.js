export const checkoutStorageKey = (customerId) => {
  if (!Number.isSafeInteger(customerId) || customerId <= 0) throw new Error("Không xác định được khách hàng của yêu cầu đặt đơn.");
  return `emart_pending_checkout_v1_${customerId}`;
};

export function createCheckoutRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const value = Math.floor(Math.random() * 16);
    return (c === "x" ? value : (value & 3) | 8).toString(16);
  });
}

export function parsePendingCheckout(raw, customerId) {
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (value.owner !== customerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.payload?.requestId || "") ||
      !Array.isArray(value.payload?.items) || !value.payload.items.length || !Array.isArray(value.cart))
    throw new Error("Không đọc được yêu cầu đặt hàng đã lưu. Vui lòng liên hệ cửa hàng để kiểm tra trước khi đặt đơn khác.");
  return value;
}

export async function preparePendingCheckout(storage, customerId, create) {
  const key = checkoutStorageKey(customerId);
  const existing = parsePendingCheckout(await storage.getItem(key), customerId);
  if (existing) return existing;
  const pending = create();
  parsePendingCheckout(JSON.stringify(pending), customerId);
  await storage.setItem(key, JSON.stringify(pending));
  return pending;
}

export function checkoutDefinitelyRejected(status, body) {
  return status === 400 || (status === 409 && body?.checkoutNotCreated === true);
}
