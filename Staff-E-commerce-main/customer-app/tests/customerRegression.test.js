import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { createCustomerSession, deliveryRecipient, loadCustomerProfile, normalizeVietnamesePhone } from "../src/utils/customerSession.js";
import { resolveApiUrl } from "../src/utils/apiConfig.js";
import { repriceVoucher } from "../src/utils/checkoutPricing.js";
import { parseDeliveryAddress, formatSelectedDeliveryAddress } from "../src/utils/addressSelection.js";
import * as checkout from "../src/utils/storefrontCheckoutSession.js";

const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");
const source = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
const declarations = new Map();
function visit(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === "VariableDeclarator" && node.id.name && node.init) declarations.set(node.id.name, source.slice(node.init.start, node.init.end));
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "start", "end"].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") visit(value);
  }
}
visit(ast);
const evaluate = (name, context) => vm.runInNewContext(`(${declarations.get(name)})`, context);
const action = (name, context) => evaluate(name, context)();
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function harness(overrides = {}) {
  const records = new Map([["token", "token-A"], ["profile", '{"id":1}']]);
  const scope = createCustomerSession();
  scope.begin("token-A");
  const administrativeUnits = require("../src/data/vietnamAdministrativeUnits.json");
  const province = administrativeUnits.provinces[0];
  const address = { city: province.name, ward: province.wards[0].name, street: "12 Default Street", otherReceiver: false };
  const context = {
    ...checkout,
    repriceVoucher, parseDeliveryAddress, formatSelectedDeliveryAddress, deliveryRecipient, loadCustomerProfile, normalizeVietnamesePhone,
    administrativeUnits, records,
    CUSTOMER_KEY: "profile", CUSTOMER_TOKEN_KEY: "token", ADDRESS_KEY: "address", CART_KEY: "cart",
    API_URL: "http://mock/api", customer: { id: 1, fullName: "Customer A", phone: "0912345678", rewardPoints: 0 }, customerToken: "token-A",
    customerSession: { current: scope }, pendingCheckoutRef: { current: null }, phoneCheckSequence: { current: 0 }, cartSnapshot: {}, checkoutRequestLock: { current: false },
    accountReady: true, accountBusy: false, addressBusy: false, accountName: "Updated A", accountEmail: "", accountAddress: "", accountDateOfBirth: "",
    checkoutForm: { fullName: "Customer A", phone: "0912345678", note: "Keep this note" },
    deliveryAddress: address, checkoutAddress: { ...address }, pendingCheckout: null,
    cart: [{ id: 11, name: "Product", price: 100000, quantity: 1 }], appliedVoucher: null, activeVoucher: null, useRewardPoints: false, paymentMethod: "cod", voucherBusy: false,
    selectedOrder: { id: 101 }, customerOrders: [{ id: 101 }], invoiceOrder: { id: 101 }, completedOrder: { id: 101 }, voucherHistory: [{ id: 2 }], voucherList: [{ id: 2 }],
    Alert: { alert() {} }, requireAuthenticatedCustomer: () => true, loadStore: async () => {}, readError: async () => "API error",
    AsyncStorage: {
      getItem: async key => records.get(key) ?? null,
      setItem: async (key, value) => { records.set(key, value); },
      removeItem: async key => { records.delete(key); },
      multiGet: async keys => keys.map(key => [key, records.get(key) ?? null]),
      multiSet: async entries => { entries.forEach(([key, value]) => records.set(key, value)); },
      multiRemove: async keys => { keys.forEach(key => records.delete(key)); },
    },
  };
  for (const name of new Set(source.match(/\bset[A-Z]\w*/g))) {
    const field = name[3].toLowerCase() + name.slice(4);
    context[name] = value => { context[field] = typeof value === "function" ? value(context[field]) : value; };
  }
  Object.assign(context, overrides);
  context.session = scope.capture();
  context.clearCustomerSession = evaluate("clearCustomerSession", context);
  return context;
}

test("logout clears private views immediately, even before device cleanup finishes", async () => {
  const gate = deferred();
  const context = harness();
  context.AsyncStorage.multiRemove = async () => gate.promise;
  const previous = context.customerSession.current.capture();
  const clearing = context.clearCustomerSession();
  assert.equal(context.customer, null);
  assert.equal(context.selectedOrder, null);
  assert.equal(context.invoiceOrder, null);
  assert.equal(context.completedOrder, null);
  assert.equal(context.customerOrders.length, 0);
  assert.equal(context.voucherList.length, 0);
  assert.equal(context.voucherHistory.length, 0);
  assert.equal(context.customerSession.current.isCurrent(previous), false);
  gate.resolve();
  await clearing;
});

test("delayed profile save cannot restore customer A or overwrite customer B", async () => {
  const gate = deferred();
  const context = harness({ fetch: async () => gate.promise });
  const saving = action("saveAccountName", context);
  await context.clearCustomerSession();
  context.customer = { id: 2, fullName: "Customer B" };
  context.customerToken = "token-B";
  context.customerSession.current.begin("token-B");
  context.records.set("profile", JSON.stringify(context.customer));
  gate.resolve({ ok: true, json: async () => ({ id: 1, fullName: "Updated A" }) });
  await saving;
  assert.equal(context.customer.id, 2);
  assert.equal(JSON.parse(context.records.get("profile")).id, 2);
  assert.equal(context.accountMessage, "");
});

test("storage queue puts logout after an in-flight write and before the next login", async () => {
  const scope = createCustomerSession();
  const old = scope.begin("A");
  const started = deferred();
  const gate = deferred();
  let stored = "A";
  const saving = scope.write(old, async () => { started.resolve(); await gate.promise; stored = "old-A"; });
  await started.promise;
  scope.begin();
  const logout = scope.run(async () => { stored = ""; });
  const next = scope.begin("B");
  const login = scope.write(next, async () => { stored = "B"; });
  gate.resolve();
  assert.equal(await saving, false);
  await logout;
  assert.equal(await login, true);
  assert.equal(stored, "B");
  assert.equal(await scope.write(old, async () => { stored = "A"; }), false);
  assert.equal(stored, "B");
});

test("session generations reject old callbacks even when the token is reused", async () => {
  const scope = createCustomerSession();
  const old = scope.begin("same-token");
  scope.begin();
  const current = scope.begin("same-token");
  assert.equal(scope.isCurrent(old), false);
  await assert.rejects(scope.run(async () => { throw new Error("device failure"); }));
  assert.equal(await scope.write(current, async () => {}), true);
});

test("delayed voucher wallet cannot repopulate private data after logout", async () => {
  const gate = deferred();
  const context = harness({ fetch: async () => gate.promise });
  const loading = evaluate("openVouchers", context)("account");
  await context.clearCustomerSession();
  gate.resolve({ ok: true, json: async () => [{ id: 999, walletStatus: "available" }] });
  await loading;
  assert.equal(context.voucherList.length, 0);
  assert.equal(context.voucherOpen, false);
});

test("transient network and server failures keep the cached profile and credentials", async () => {
  for (const fetcher of [async () => { throw new Error("offline"); }, async () => ({ ok: false, status: 503 })]) {
    const context = harness({ active: true, fetch: fetcher });
    await action("restoreAccount", context);
    assert.equal(context.customer.id, 1);
    assert.equal(context.customerToken, "token-A");
    assert.equal(context.records.get("token"), "token-A");
    assert.equal(context.accountReady, true);
  }
});

test("only an invalid session removes login credentials during restoration", async () => {
  for (const status of [401, 403]) {
    const context = harness({ active: true, fetch: async () => ({ ok: false, status }) });
    await action("restoreAccount", context);
    assert.equal(context.customer, null);
    assert.equal(context.records.has("token"), false);
  }
  const profile = { id: 1, fullName: "Fresh name" };
  const result = await loadCustomerProfile(async () => ({ ok: true, json: async () => profile }), "url", "token", { id: 1 });
  assert.equal(result.profile.fullName, "Fresh name");
  assert.equal(result.offline, false);
});

const voucher = { code: "SAVE10", discountAmount: 10000, promotion: { discountType: "percent", value: 10, minOrderAmount: 100000, maxDiscount: 50000 } };

test("voucher follows the cart subtotal, minimum, ceiling and fixed-discount bounds", () => {
  assert.equal(repriceVoucher(voucher, 200000).discountAmount, 20000);
  assert.equal(repriceVoucher(voucher, 1000000).discountAmount, 50000);
  assert.equal(repriceVoucher(voucher, 99999), null);
  assert.equal(repriceVoucher(voucher, 0), null);
  const fixed = { promotion: { discountType: "fixed", value: 50000, minOrderAmount: 0 } };
  assert.equal(repriceVoucher(fixed, 20000).discountAmount, 20000);
  assert.equal(repriceVoucher({ promotion: { discountType: "percent", value: 12.5 } }, 10001).discountAmount, 1250);
});

function refreshTotals(context) {
  for (const name of ["subtotal", "activeVoucher", "voucherDiscount", "afterVoucher", "maxPointsUsable", "pointsDiscount", "payable"]) context[name] = evaluate(name, context);
}

test("checkout sends the recalculated voucher total and preserves it on a retry", async () => {
  const requests = [];
  const context = harness({ appliedVoucher: voucher, fetch: async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: false, status: 500, json: async () => ({}) };
  } });
  context.cart[0].quantity = 2;
  refreshTotals(context);
  await action("submitOrder", context);
  assert.equal(requests[0].expectedTotal, 180000);
  assert.equal(requests[0].promotionCode, "SAVE10");
  context.customer.rewardPoints = 100;
  refreshTotals(context);
  await action("submitOrder", context);
  assert.deepEqual(requests[1], requests[0]);
});

test("retired alternate-recipient data does not override the account recipient", async () => {
  const context = harness();
  context.deliveryAddress = { ...context.deliveryAddress, otherReceiver: true, receiverName: "  Receiver B  ", receiverPhone: "+84 912 345 679" };
  context.fetch = async () => ({ ok: true, json: async () => ({ ...context.customer, address: [context.deliveryAddress.street, context.deliveryAddress.ward, context.deliveryAddress.city].join(", ") }) });
  await action("saveDeliveryAddress", context);
  const stored = JSON.parse(context.records.get("address:1"));
  assert.equal(stored.receiverName, undefined);
  assert.equal(stored.receiverPhone, undefined);
  assert.equal(stored.otherReceiver, undefined);
  assert.equal(deliveryRecipient(context.customer).phone, "0912345678");
  assert.equal(context.checkoutForm.fullName, "Customer A");
  assert.equal(context.checkoutForm.note, "Keep this note");
  refreshTotals(context);
  let sent;
  context.fetch = async (_url, options) => { sent = JSON.parse(options.body); return { ok: false, status: 500, json: async () => ({}) }; };
  await action("submitOrder", context);
  assert.equal(sent.fullName, "Customer A");
  assert.equal(sent.phone, "0912345678");
  assert.equal(sent.note, "Keep this note");
  const owner = deliveryRecipient(context.customer);
  assert.equal(owner.fullName, "Customer A");
});

test("incomplete retired recipient fields cannot block saving an address", async () => {
  let called = false;
  const context = harness({ accountReady: true, fetch: async () => { called = true; return { ok: true, json: async () => ({ id: 1 }) }; } });
  context.deliveryAddress.otherReceiver = true;
  await action("saveDeliveryAddress", context);
  assert.equal(called, true);
  assert.equal(context.checkoutForm.fullName, "Customer A");
  assert.ok(context.addressMessage);
});

test("API config honors explicit endpoints on web and keeps HTTPS without configuration", () => {
  const location = { hostname: "shop.example", protocol: "https:", origin: "https://shop.example" };
  assert.equal(resolveApiUrl(" https://api.example/api/ ", location), "https://api.example/api");
  assert.equal(resolveApiUrl("", location), "https://shop.example/api");
  assert.equal(resolveApiUrl("", { hostname: "localhost", protocol: "http:" }), "http://localhost:5099/api");
  assert.equal(resolveApiUrl("", { hostname: "[::1]", protocol: "http:" }), "http://[::1]:5099/api");
  assert.equal(resolveApiUrl("http://192.168.1.5:5099/api", undefined), "http://192.168.1.5:5099/api");
  assert.equal(resolveApiUrl("", undefined), "http://10.0.2.2:5099/api");
});
