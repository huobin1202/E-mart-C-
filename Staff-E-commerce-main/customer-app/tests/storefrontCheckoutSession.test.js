import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkoutDefinitelyRejected,
  checkoutStorageKey,
  parsePendingCheckout,
  preparePendingCheckout,
} from "../src/utils/storefrontCheckoutSession.js";

function memoryStorage() {
  const records = new Map();
  return {
    getItem: async (key) => records.get(key) ?? null,
    setItem: async (key, value) => records.set(key, value),
    removeItem: async (key) => records.delete(key),
  };
}

const firstRequest = {
  owner: 7,
  cart: [{ id: 11, name: "Sản phẩm", price: 20_000, quantity: 2 }],
  voucher: { code: "SAVE10", discountAmount: 4_000 },
  payload: {
    requestId: "635ba6b5-3746-4cd9-afd7-0a216c2356ce",
    expectedTotal: 36_000,
    items: [{ productId: 11, quantity: 2 }],
  },
};

test("a retry restores the exact customer checkout instead of creating a second request", async () => {
  const storage = memoryStorage();
  const created = await preparePendingCheckout(storage, 7, () => firstRequest);
  const retried = await preparePendingCheckout(storage, 7, () => ({
    ...firstRequest,
    payload: { ...firstRequest.payload, requestId: "e731e887-c27a-47a7-aac7-cb0298d2234e" },
  }));

  assert.deepEqual(created, firstRequest);
  assert.deepEqual(retried, firstRequest);
  assert.deepEqual(
    parsePendingCheckout(await storage.getItem(checkoutStorageKey(7)), 7),
    firstRequest,
  );
  assert.throws(() => parsePendingCheckout(JSON.stringify(firstRequest), 8));
});

test("only a definitive validation/conflict response releases the pending checkout", () => {
  assert.equal(checkoutDefinitelyRejected(400, {}), true);
  assert.equal(checkoutDefinitelyRejected(409, { checkoutNotCreated: true }), true);
  assert.equal(checkoutDefinitelyRejected(409, {}), false);
  assert.equal(checkoutDefinitelyRejected(500, {}), false);
});
