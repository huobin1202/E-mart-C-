import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const products = JSON.parse(await fs.readFile(path.join(root, "scripts/data/product-content.json"), "utf8"));
assert.equal(products.length, 80, "The current catalog contains 80 products");
assert.equal(new Set(products.map((product) => product.sku)).size, products.length, "Unique SKU per product");
assert.equal(new Set(products.map((product) => product.description)).size, products.length, "Descriptions are product-specific");
let bytes = 0;
for (const product of products) {
  assert.match(product.sku, /^\d{13}$/);
  assert.ok(product.description.length > 50, `${product.sku}: missing description`);
  assert.ok(!product.description.includes("?") && !product.description.includes("\ufffd"), `${product.sku}: broken Vietnamese text`);
  assert.match(product.description, /[^\x00-\x7f]/, `${product.sku}: Vietnamese text missing`);
  assert.match(product.sourcePage, /^https:\/\//);
  assert.match(product.sourceImage, /^https:\/\//);
  assert.match(product.imageUrl, new RegExp(`^/assets/images/products/catalog/${product.sku}\\.(jpg|png|webp|gif)$`));
  const asset = await fs.readFile(path.join(root, "backend/wwwroot", product.imageUrl));
  assert.equal(createHash("sha256").update(asset).digest("hex"), product.sha256, `${product.sku}: asset integrity`);
  assert.equal(asset.length, product.bytes, `${product.sku}: asset length`);
  assert.ok(asset.length >= 500 && asset.length <= 5 * 1024 * 1024, `${product.sku}: image size`);
  const signature = asset.subarray(0, 12);
  const supported = (signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff) ||
    signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (signature.toString("ascii", 0, 4) === "RIFF" && signature.toString("ascii", 8, 12) === "WEBP") ||
    /^GIF8[79]a$/.test(signature.toString("ascii", 0, 6));
  assert.ok(supported, `${product.sku}: unsupported image content`);
  bytes += asset.length;
}
console.log(`PASS: ${products.length} unique product descriptions and local photos verified (${(bytes / 1024 / 1024).toFixed(2)} MB).`);
