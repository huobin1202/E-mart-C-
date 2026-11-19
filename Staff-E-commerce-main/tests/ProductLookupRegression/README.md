# POS product lookup checks

From the repository root:

```powershell
dotnet run --project Staff-E-commerce-main/tests/ProductLookupRegression/ProductLookupRegression.csproj
node --test Staff-E-commerce-main/frontend/tests/posProductLookup.test.mjs Staff-E-commerce-main/frontend/tests/posWorkflow.test.js
```

The backend tests seed the search cache without connecting to the application database. They check the five-result limit, barcode/SKU/name lookup, exact-code ranking, server-side bounds and the existing default API limit. Frontend checks cover direct barcode scans, selection and fresh product reloads, ambiguous matches, failures, cancellation and stock-aware keyboard navigation.

Restart the backend to enable the `maxResults` search parameter and exact SKU lookup. No database migration is required.
