# Store Management Audit

Scope: source review of `backend/Data/store_management_full.sql`, ASP.NET Core backend, and React frontend. The live SQL Server was not queried, so this report treats the checked-in SQL script as the database contract.

## System overview

- Stack: SQL Server, ASP.NET Core 9, Entity Framework Core, JWT authentication, React/Vite.
- Existing UI modules: dashboard, POS/orders, products, inventory, customers, categories, suppliers, units, promotions, users, reports, audit, profile, and AI chat.
- Global authentication is enabled. User management is restricted to `admin`.

## Database and module map

| Module | Tables | Current coverage |
| --- | --- | --- |
| Users and access | users, activity_logs | Backend and UI exist; admin manages staff. |
| Customers | customers | CRUD and UI exist; password_hash and reward_points are not mapped. |
| Catalog | categories, units, suppliers, products | CRUD and UI exist; products.barcode is not mapped. |
| Inventory | inventory, inventory_adjustments | List and manual adjustment UI exist; adjustment history has no UI/API. |
| Sales | orders, order_items, payments | POS exists, but checkout is split across several API calls. |
| Promotions | promotions, product_promotions, event_promotions, voucher_promotions, promotion_redemptions | UI/API exist, but the EF model targets an older promotion schema. |
| Procurement | purchase_orders, po_details | List, create, detail, complete, and cancel workflows are implemented. |
| AI | ai_conversations, ai_messages | Backend API and UI widget exist. |

## Function matrix

| Main module | Database | Backend/API | Frontend | Status |
| --- | --- | --- | --- | --- |
| Employee management | Yes | Yes | Yes | Partial: no reset-password workflow or activity view by employee. |
| Customer management | Yes | Yes | Yes | Partial: account and reward fields are unused. |
| Product management | Yes | Yes | Yes | Partial: barcode is unused. |
| Inventory | Yes | Yes | Yes | Partial: adjustment audit is not exposed. |
| POS/order creation | Yes | Yes | Yes | High risk: separate writes are not one transaction. |
| Order search/cancel | Yes | Yes | Yes | Partial: status/payment state are mixed in the UI. |
| Payments | Yes | Yes | POS integration | Partial: state changes need one server-side workflow. |
| Promotions | Yes | Incompatible model | Yes | Broken against the checked-in SQL schema. |
| Purchase orders | Yes | Yes | Yes | Complete: pending, completed, and cancelled states. |
| Reports and audit | Yes | Yes | Yes | Needs runtime data verification. |

## Findings

### Critical

1. The promotions entity maps `value`, `min_order_amount`, and `active`, while the SQL table has `name`, `status`, and promotion-detail tables. Promotion queries will fail or use an incompatible contract after the supplied SQL script is installed.
2. POS creates an order, order items, inventory reduction, promotion redemption, and payment through separate endpoints. A failure midway can leave partial data; prices and totals also originate in the browser.

### High

1. `orders.employee_id` in SQL did not match the EF mapping to `user_id`; fixed in this pass.
2. Purchase-order workflow was missing; it is implemented in this pass with a transactional inventory receipt.
3. The public registration endpoint created staff accounts. It is now restricted to administrators.
4. Inventory reduction accepted negative, duplicate, missing, and over-stock quantities. It is now validated and committed atomically.

### Medium

1. customers.password_hash, customers.reward_points, products.barcode, and inventory_adjustments have no end-to-end coverage.
2. The order filter UI presents `paid` as an order status although the SQL schema separates `orders.status` and `orders.payment_status`.
3. API error handling remains inconsistent in several legacy controllers; some return raw exception text.
4. Frontend bundle is about 1.16 MB before gzip and should be code-split when performance work is scheduled.

## Changes made in this pass

1. Restricted `POST /api/auth/register` to `admin`; only login remains anonymous. Locked accounts can no longer log in.
2. Removed the client-controlled `X-User-Id` fallback. Order ownership now comes from the JWT claim.
3. Mapped orders to `employee_id`, mapped SQL order type/payment fields, normalized order creation, and reject negative monetary values.
4. Made inventory reduction validate aggregated quantities and use a serializable transaction.
5. Replaced direct POS fetch calls with the shared API client so JWT headers and the configured backend URL are used consistently.
6. Added purchase-order UI and API. Completing a receipt updates inventory, writes adjustment rows and activity logs in one transaction.
7. Supplier contact names now round-trip through the API; deleting a supplier now deactivates it to preserve purchase and product history.

## Recommended next implementation order

1. Replace the split POS checkout with one backend checkout command that calculates product prices, validates promotion rules, creates order/items/payment, updates inventory, writes audit data, and commits one transaction.
2. Choose the supplied promotion schema as the contract and align the promotion model, DTOs, service, API, and UI with product/event/voucher detail tables.
3. Add supplier purchase history and inventory-adjustment history to their respective detail views.
4. Add inventory-adjustment history, customer reward/account support, and product barcode support.
5. Add integration tests for authorization, checkout, insufficient stock, cancellation, promotion limits, and payment callbacks.
