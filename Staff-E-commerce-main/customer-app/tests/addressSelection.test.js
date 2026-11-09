import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterAddressUnits, findAddressUnit, formatSelectedDeliveryAddress, parseDeliveryAddress, selectAddressProvince } from "../src/utils/addressSelection.js";

const { provinces } = JSON.parse(readFileSync(new URL("../src/data/vietnamAdministrativeUnits.json", import.meta.url), "utf8"));

test("bundled provinces have complete wards, unique codes and names", () => {
  assert.equal(provinces.length, 34);
  assert.equal(new Set(provinces.map(p => p.code)).size, provinces.length);
  const wards = provinces.flatMap(p => p.wards);
  assert.equal(wards.length, 3321);
  assert.equal(new Set(wards.map(w => w.code)).size, wards.length);
  assert.ok(provinces.every(p => p.name && p.wards.length && p.wards.every(w => w.name)));
});

test("search handles Vietnamese accents, uppercase and extra spaces", () => {
  for (const query of ["ĐÀ NẴNG", "da nang", "  Da   Nang  "]) {
    assert.equal(filterAddressUnits(provinces, query)[0].name, "Thành phố Đà Nẵng");
  }
  const hanoi = findAddressUnit(provinces, "Hà Nội");
  assert.ok(filterAddressUnits(hanoi.wards, "dong da").some(w => w.name === "Phường Đống Đa"));
  assert.deepEqual(filterAddressUnits(provinces, "khong-co-dia-phuong-nay"), []);
  assert.equal(filterAddressUnits(provinces, "").length, provinces.length);
});

test("existing address names can resolve without an administrative prefix", () => {
  assert.equal(findAddressUnit(provinces, "TP. Hồ Chí Minh").name, "Thành phố Hồ Chí Minh");
  assert.equal(findAddressUnit(provinces, "ha noi").name, "Thành phố Hà Nội");
  assert.equal(findAddressUnit(provinces, ""), null);
  assert.equal(findAddressUnit(provinces, "Địa phương cũ chưa xác định"), null);
});

test("wards with the same name retain their administrative type", () => {
  const wards = [{ code: "1", name: "Phường Tân Phú" }, { code: "2", name: "Xã Tân Phú" }];
  assert.equal(findAddressUnit(wards, "Xã Tân Phú").code, "2");
  assert.equal(findAddressUnit(wards, "Phường Tân Phú").code, "1");
  assert.equal(findAddressUnit(wards, "Tân Phú"), null);
});

test("changing provinces clears even identically named wards and preserves street", () => {
  const hanoi = findAddressUnit(provinces, "Hà Nội");
  const danang = findAddressUnit(provinces, "Đà Nẵng");
  const address = { city: hanoi.name, ward: "Phường Hải Châu", street: "12 Đường A", otherReceiver: true };
  const next = selectAddressProvince(address, danang);
  assert.deepEqual(next, { ...address, city: danang.name, ward: "" });
  assert.equal(address.city, hanoi.name);
});

test("reselecting a province preserves only a ward that belongs to it", () => {
  const hanoi = findAddressUnit(provinces, "Hà Nội");
  const address = { city: "Hà Nội", ward: "Đống Đa", street: "12 Đường A" };
  assert.equal(selectAddressProvince(address, hanoi).ward, "Phường Đống Đa");
  assert.equal(selectAddressProvince({ ...address, ward: "Phường không còn tồn tại" }, hanoi).ward, "");
});

test("saved address prefills checkout and preserves commas in the street", () => {
  const saved = "C5/10B, hẻm 12, Phường Đống Đa, Thành phố Hà Nội";
  const address = parseDeliveryAddress(saved);
  assert.equal(address.street, "C5/10B, hẻm 12");
  assert.equal(address.ward, "Phường Đống Đa");
  assert.equal(address.city, "Thành phố Hà Nội");
  assert.equal(formatSelectedDeliveryAddress(provinces, address), saved);
});

test("checkout requires a selected province, its own ward and a street", () => {
  const hanoi = findAddressUnit(provinces, "Hà Nội");
  const address = { city: hanoi.name, ward: "Phường Đống Đa", street: "  12 Đường A  " };
  assert.equal(formatSelectedDeliveryAddress(provinces, address), "12 Đường A, Phường Đống Đa, Thành phố Hà Nội");
  for (const incomplete of [
    { ...address, city: "" },
    { ...address, ward: "" },
    { ...address, street: "  " },
    { ...address, ward: "Phường Hải Châu" },
  ]) assert.equal(formatSelectedDeliveryAddress(provinces, incomplete), "");
});

test("selecting another checkout address leaves the saved default unchanged", () => {
  const saved = "12 Đường A, Phường Đống Đa, Thành phố Hà Nội";
  const defaultAddress = parseDeliveryAddress(saved);
  const danang = findAddressUnit(provinces, "Đà Nẵng");
  const checkout = selectAddressProvince({ ...defaultAddress }, danang);
  checkout.ward = "Phường Hải Châu";
  checkout.street = "34 Đường B";
  assert.equal(formatSelectedDeliveryAddress(provinces, checkout), "34 Đường B, Phường Hải Châu, Thành phố Đà Nẵng");
  assert.equal(formatSelectedDeliveryAddress(provinces, defaultAddress), saved);
});
