import test from "node:test";
import assert from "node:assert/strict";
import { productSearchPath, resolvePosProduct, canAddPosProduct, nextSuggestionIndex } from "../src/utils/posProductLookup.js";

const missing = () => { throw Object.assign(new Error("Missing"), { status: 404 }); };
const available = (id, quantity = 3) => ({ id, isActive: true, inventory: { quantity } });

test("suggestion search encodes the query and asks for just five products", () => {
  const params = new URLSearchParams(productSearchPath("  Cà phê & sữa  ").split("?")[1]);
  assert.equal(params.get("keyword"), "Cà phê & sữa");
  assert.equal(params.get("maxResults"), "5");
});

test("scanned exact codes add directly without a suggestion request", async () => {
  const calls = [];
  const product = available(8);
  const result = await resolvePosProduct({ query: " 890001 ", request: async (path) => { calls.push(path); return product; } });
  assert.equal(result.product, product);
  assert.deepEqual(calls, ["/products/barcode/890001"]);
});

test("selected and unique name matches reload current product before adding", async () => {
  const calls = [];
  const fresh = { ...available(8, 1), price: 12000 };
  const request = async (path) => {
    calls.push(path);
    if (path.includes("/barcode/")) missing();
    return path.includes("/search?") ? [{ ...available(8, 50), price: 10000 }] : fresh;
  };
  assert.equal((await resolvePosProduct({ query: "coffee", request })).product, fresh);
  assert.equal(calls.at(-1), "/products/8");
  calls.length = 0;
  assert.equal((await resolvePosProduct({ query: "coffee", selected: available(8, 50), request })).product, fresh);
  assert.deepEqual(calls, ["/products/8"]);
});

test("ambiguous names require an explicit selection and never silently pick the first", async () => {
  const result = await resolvePosProduct({ query: "coffee", request: async (path) => path.includes("/barcode/") ? missing() : [available(1), available(2)] });
  assert.equal(result.product, undefined);
  assert.equal(result.matches.length, 2);
});

test("server and network failures never fall back to another product", async () => {
  let calls = 0;
  await assert.rejects(resolvePosProduct({ query: "890001", request: async () => { calls++; throw Object.assign(new Error("Server"), { status: 500 }); } }), /Server/);
  assert.equal(calls, 1);
});

test("aborted requests cannot continue to refresh or select a stale match", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(resolvePosProduct({ query: "coffee", signal: controller.signal, request: async () => { calls++; controller.abort(); return available(8); } }), { name: "AbortError" });
  assert.equal(calls, 1);
});

test("keyboard skips sold out, inactive and cart-at-stock products", () => {
  const products = [available(1, 0), { ...available(2), isActive: false }, available(3, 1), available(4), available(5)];
  const cart = [{ id: 3, quantity: 1 }];
  assert.equal(canAddPosProduct(products[2], cart), false);
  assert.equal(nextSuggestionIndex(products, cart, -1, 1), 3);
  assert.equal(nextSuggestionIndex(products, cart, 3, 1), 4);
  assert.equal(nextSuggestionIndex(products, cart, 4, 1), 3);
  assert.equal(nextSuggestionIndex(products, cart, 3, -1), 4);
  assert.equal(nextSuggestionIndex([available(1, 0)], [], -1, 1), -1);
});
