# Realtime synchronization

The live notification transport is `GET /hub/notifications` (SignalR negotiate/WebSocket). It requires the same JWT as the API. The hub assigns `admin` and `staff` connections to `staff-admin`, and customer connections to `storefront`; clients cannot choose or join arbitrary groups.

| Event | Producer | Recipients | Consumer action |
| --- | --- | --- | --- |
| `CustomerCreated` | Storefront registration after SQL save | Admin/staff | Refresh customer rows and summary counts |
| `CustomerUpdated` | Storefront profile/address update after SQL save | Admin/staff | Refresh customer rows and summary counts |
| `NewOrderPlaced` | Mobile order and POS checkout after successful persistence | Admin/staff | Refresh order list, invoice list, and alert POS |
| `OrderStatusChanged` | Admin/staff order transition after SQL update | Admin/staff | Refresh order list |
| `StockUpdated` | Mobile order and POS checkout after inventory commit | Admin/staff and storefront | Refresh inventory/product displays |

`RealtimeNotificationService` catches and logs transport errors. A SignalR disconnect therefore cannot turn a committed database operation into a failed API response. SQL Server is authoritative for stock and orders; broadcasts are notifications, not the transaction log. For guaranteed delivery across server restarts, add an SQL outbox and background dispatcher.

Admin customer list and detail reads query SQL Server directly instead of depending on the process-local customer cache. This prevents an older cached profile from being returned after an update from another API instance.

## Redis inventory reservation gap

This repository currently stores the customer cart in the mobile app and has no Redis client package, Redis connection setting, reservation endpoint, or server-side cart. As a result, `StockReserved` is declared as a client event but no reservation is currently created or broadcast. The reservation section in [realtime-sync.puml](./realtime-sync.puml) is the intended contract, not an implemented endpoint. Do not advertise stock as held until an atomic Redis reservation service is added and checkout validates/releases those holds in coordination with the SQL inventory transaction.

The existing mobile checkout and POS checkout reduce `Inventory.Quantity` in SQL transactions. On commit they emit `NewOrderPlaced` and `StockUpdated`, which refresh Admin and POS immediately.

## Client setup

The React hook in `frontend/src/hooks/useRealtimeNotifications.js` obtains the current API token and connects to the API origin's `/hub/notifications`. To use it, install/register a handler, for example:

```jsx
useRealtimeNotifications({
  CustomerCreated: refreshCustomersAndStats,
  CustomerUpdated: refreshCustomersAndStats,
});
```

The web Admin and POS require authenticated `admin`/`staff` tokens. `CustomerList` refreshes the active page and summary totals; Orders, Invoices, Products, and POS refresh their own views in response to their events.
