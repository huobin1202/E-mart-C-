# E-Mart customer app

The customer shopping app is kept separate from the staff/admin frontend. It uses React and Vite and reads the public product catalog from the existing backend.

## Run locally

In one terminal, start the backend using the ASP.NET Core 9 runtime:

```powershell
cd .\backend
dotnet run
```

In another terminal, install this app's dependencies once and start Vite:

```powershell
cd .\customer-app
npm install
npm run dev
```

Open `http://localhost:5174`. The Vite server proxies `/api` calls to `http://localhost:5099`.

The catalog and category list are public read-only endpoints. Cart contents are saved in this browser. Checkout posts customer contact details and product IDs to `POST /api/storefront/orders`; the backend checks current prices and stock, creates a pending order, and deducts inventory in the same database transaction. Payment gateway and delivery-provider integrations are not configured; checkout currently uses payment on delivery.
