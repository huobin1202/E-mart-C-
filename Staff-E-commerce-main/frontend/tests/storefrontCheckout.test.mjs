import test from "node:test";
import assert from "node:assert/strict";
import { checkoutStorageKey, createCheckoutRequestId, parsePendingCheckout, preparePendingCheckout, checkoutDefinitelyRejected } from "../../customer-app/src/utils/storefrontCheckoutSession.js";

const fixture = () => ({ owner: 41, cart: [{ id: 7, price: 20000, quantity: 1 }], payload: {
  requestId: createCheckoutRequestId(), fullName: "Người nhận", phone: "0901000041", address: "Địa chỉ gốc", expectedTotal: 20000,
  paymentMethod: "cod", pointsUsed: 0, items: [{ productId: 7, quantity: 1 }],
} });

test("storefront recovery reuses the exact persisted request after a lost response", async () => {
  const entries = new Map(); let builds = 0;
  const storage = { getItem: async key => entries.get(key), setItem: async (key, value) => entries.set(key, value) };
  const original = await preparePendingCheckout(storage, 41, () => { builds++; return fixture(); });
  const replay = await preparePendingCheckout(storage, 41, () => { throw new Error("must not create another order"); });
  assert.deepEqual(replay, original); assert.equal(builds, 1);
  assert.notEqual(checkoutStorageKey(41), checkoutStorageKey(42));
  assert.throws(() => parsePendingCheckout(JSON.stringify(original), 42));
});

test("unreadable or unavailable storage blocks preparing a new storefront request", async () => {
  let builds = 0;
  await assert.rejects(preparePendingCheckout({ getItem: async () => { throw new Error("storage unavailable"); } }, 41, () => { builds++; return fixture(); }));
  assert.equal(builds, 0);
  await assert.rejects(preparePendingCheckout({ getItem: async () => null, setItem: async () => { throw new Error("full"); } }, 41, fixture));
  assert.throws(() => parsePendingCheckout("broken", 41));
  assert.throws(() => checkoutStorageKey(null));
});

test("network, authorization and uncertain server responses preserve the request", () => {
  for (const status of [0, 401, 403, 408, 409, 500, 502, 503]) assert.equal(checkoutDefinitelyRejected(status, {}), false);
  assert.equal(checkoutDefinitelyRejected(400, {}), true);
  assert.equal(checkoutDefinitelyRejected(409, { checkoutNotCreated: true }), true);
});

test("fresh storefront sales have distinct valid request keys", () => {
  const keys = new Set(Array.from({ length: 100 }, createCheckoutRequestId));
  assert.equal(keys.size, 100);
  for (const requestId of keys) assert.equal(parsePendingCheckout(JSON.stringify({ ...fixture(), payload: { ...fixture().payload, requestId } }), 41).payload.requestId, requestId);
});
