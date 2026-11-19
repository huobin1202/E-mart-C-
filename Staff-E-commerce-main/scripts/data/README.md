# Product images and descriptions

`product-content.json` contains the content for all 80 products in the current demo catalog, matched by SKU rather than database identity. Each entry includes an original Vietnamese description, a local photo URL, the source product page/image URL, retrieval date and SHA-256 checksum. Photos are stored under `backend/wwwroot/assets/images/products/catalog/` and do not require a third-party connection when displayed.

The source SKUs in this project are demo identifiers. Product names often omit the flavor, package size or model, so photographs show representative real products. Descriptions do not invent model specifications, nutrition values or treatment/dosing claims. The content can be replaced with the exact shop inventory through normal product editing.

Run from the repository root:

```powershell
node Staff-E-commerce-main/scripts/validate-product-content.mjs

# Read-only preview against the configured local application database:
powershell -NoProfile -ExecutionPolicy Bypass -File Staff-E-commerce-main/scripts/seed-product-content.ps1

# Back up existing content, fill missing fields, and record the updates in the audit log:
powershell -NoProfile -ExecutionPolicy Bypass -File Staff-E-commerce-main/scripts/seed-product-content.ps1 -Apply
```

The update preserves every nonempty image/description and does not modify names, prices, stock or order data. Updates and audit rows commit in one transaction; failures roll back. A JSON backup of changed fields is saved under `Staff-E-commerce-main/.tmp/product-content-backups/`. Repeating the command leaves completed records unchanged.

The optional `download-product-images.mjs` command retrieves the source photos. It requires network access, validates raster signatures and file sizes, and reuses verified local files. Source websites can change their image URLs, so the checked-in photos are the stable copy.

Direct SQL updates bypass application memory caches. Refresh the page after applying; restart the backend if an existing cache still serves the old content. No schema migration is needed.
