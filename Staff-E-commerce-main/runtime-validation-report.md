# Runtime validation report

Date: 2026-10-24

## Scope

- Backend started on `http://127.0.0.1:5099` using the existing SQL Server connection string.
- Read-only GET endpoint smoke tests were executed with the seeded `admin` account.
- POST/PUT/DELETE business endpoints were intentionally not invoked to avoid mutating the user's database during validation.

## Results

- Login: PASS (`POST /api/auth/login`, HTTP 200).
- Valid authenticated GET requests: PASS (54 requests across categories, customers, products, inventory, activity logs, users, roles, employees, invoices, promotions, orders, payments, statistics, suppliers, units, purchase orders, reports, and secret endpoints).
- Public storefront GET endpoints: PASS (`/api/storefront/products`, `/api/storefront/categories`, `/api/storefront/promotions`).
- Missing JWT: PASS as security behavior (HTTP 401).
- Invalid JWT: PASS as security behavior (HTTP 401).
- Corrected route validation: Activity Log uses `/api/activitylog/...`, not `/api/activitylogs/...`.
- Corrected parameter validation: `/api/reports/period-comparison` succeeds with `from` and `to` query parameters.
- Backend build: PASS, 0 warnings and 0 errors in the isolated runtime build output.
- Docker capability: unavailable on this machine; container validation was not applicable.

## Review items

- Empty `keyword` requests to customer/product search return HTTP 400, which is expected input validation.
- Calling period comparison without `from`/`to` currently returns HTTP 500 with a validation message. With valid parameters it returns HTTP 200. This is an API status-code quality issue, not a failure of the valid endpoint path.
- The existing authorization regression runner could not complete its build while the live backend executable was locked by running processes. The backend itself built successfully through an isolated output path, and endpoint runtime validation completed.

## Architecture check

- Controllers do not directly reference `AppDbContext`, SQL APIs, or repositories.
- Services contain the BUS orchestration and call repositories/DAO classes.
- SQL/data access remains in repository/DAO classes.
- No UI designer files, connection strings, database schema, or binding property names were changed by this validation.
