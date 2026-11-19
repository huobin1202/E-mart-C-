import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "scripts/data/product-content.json");
const folder = path.join(root, "backend/wwwroot/assets/images/products/catalog");
const products = JSON.parse(await fs.readFile(manifestPath, "utf8"));
await fs.mkdir(folder, { recursive: true });
const failures = [];
let cursor = 0;
let completed = 0;

function imageType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (/^GIF8[79]a$/.test(bytes.toString("ascii", 0, 6))) return "gif";
  throw new Error("Response is not a supported raster image");
}

await Promise.all(Array.from({ length: 6 }, async () => {
  while (cursor < products.length) {
    const product = products[cursor++];
    try {
      if (product.sha256 && product.imageUrl && product.downloadedFrom === product.sourceImage) {
        const cached = await fs.readFile(path.join(root, "backend/wwwroot", product.imageUrl));
        if (createHash("sha256").update(cached).digest("hex") === product.sha256) { completed++; continue; }
      }
      const response = await fetch(product.sourceImage, { signal: AbortSignal.timeout(25000), headers: { Accept: "image/*" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (Number(response.headers.get("content-length")) > 5 * 1024 * 1024) throw new Error("Image exceeds 5 MB");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 500 || bytes.length > 5 * 1024 * 1024) throw new Error(`Unexpected image size: ${bytes.length}`);
      const extension = imageType(bytes);
      const filename = `${product.sku}.${extension}`;
      await fs.writeFile(path.join(folder, filename), bytes);
      product.imageUrl = `/assets/images/products/catalog/${filename}`;
      product.sha256 = createHash("sha256").update(bytes).digest("hex");
      product.bytes = bytes.length;
      product.retrievedOn = "2026-11-20";
      product.downloadedFrom = product.sourceImage;
      completed++;
      process.stdout.write(`Downloaded ${product.index}: ${product.name}\n`);
    } catch (error) {
      failures.push({ index: product.index, name: product.name, error: error.message });
      process.stdout.write(`FAILED ${product.index}: ${error.message}\n`);
    }
  }
}));
await fs.writeFile(manifestPath, JSON.stringify(products, null, 2) + "\n");
process.stdout.write(JSON.stringify({ completed, total: products.length, failures }, null, 2) + "\n");
if (failures.length) process.exitCode = 1;
