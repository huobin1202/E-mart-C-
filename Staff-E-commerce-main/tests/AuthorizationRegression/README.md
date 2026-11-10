# Authorization regression checks

This console test starts an HTTP API using the application's controllers, JWT validation and authorization filters. It creates a uniquely named SQL Server database (`AuthorizationRegression_<guid>`), runs the checks, and deletes that database in `finally`. It never changes the configured application database. The SQL login in the backend configuration must be allowed to create and drop the temporary database.

From the repository root:

```powershell
dotnet restore Staff-E-commerce-main/tests/AuthorizationRegression/AuthorizationRegression.csproj --configfile Staff-E-commerce-main/NuGet.Config
dotnet build Staff-E-commerce-main/tests/AuthorizationRegression/AuthorizationRegression.csproj --no-restore -o Staff-E-commerce-main/.tmp/auth-regression -p:UseAppHost=false
dotnet Staff-E-commerce-main/.tmp/auth-regression/AuthorizationRegression.dll D:/E-mart-C-/Staff-E-commerce-main/backend
```

Pass your backend configuration directory as the last argument if the checkout is elsewhere. Isolated build output avoids overwriting an application already running from `backend/bin`.

Run only the customer phone/email login regression with the canonical temporary schema:

```powershell
dotnet Staff-E-commerce-main/.tmp/auth-regression/AuthorizationRegression.dll D:/E-mart-C-/Staff-E-commerce-main/backend --customer-login-only
```

This checks phone normalization, case-insensitive email login, long emails, profile email changes, locked/inactive accounts, staff exclusion, and shared lockout across phone/email aliases. No application accounts are changed.

Coverage includes granting/revoking permissions with an existing token, customer isolation from internal APIs, seed idempotence, last-admin protection (including concurrent requests), employee/account synchronization, staff departure and reactivation, inactive roles, password/role changes, shared account creation validation, deleting unused accounts while keeping profile records, and blocking deletion after login or recorded activity.

Login sessions no longer expire automatically after 60 minutes. New signed tokens omit `exp`, and `expiresIn` is nullable. JWT validation permits tokens without an expiry while preserving signature/issuer/audience checks and database session-version/account checks. Legacy tokens with an existing expiry still require one new login when they expire. Manual sign-out clears local credentials. This policy does not change BUS cache TTL or invalidation. The suite checks no-expiry tokens, anonymous and tampered-token rejection, and existing account/session revocation. Frontend coverage: `node --test tests/loginSession.test.mjs` verifies that a new session survives a simulated future clock and manual sign-out clears it.

POS coverage additionally exercises upgrading the previous order schema, server pricing, cash/change, points, expired/capped/product promotions, rollback on insufficient stock, competing buyers for the final unit, duplicate checkout retries, identical consecutive sales, pending card settlement, duplicate transaction references, cancellation/payment races, signed MoMo callbacks and API bypass protection. MoMo callbacks use test keys and fixture payment attempts; these checks never contact or charge the live provider.

History/POS coverage includes opening one exact app order, sale-channel metadata, looking up a lost checkout response by request key restricted to its creator, settling an existing legacy cash bill without creating an order/debiting inventory twice, cash permission checks, rejecting incomplete historical data, and blocking delivery of an unpaid non-cash order.

Invoice management checks exclude paid-but-unfulfilled orders, retain completed POS invoices, apply the fulfillment filter before counting/pagination, and preserve access to historical invoice details.

Delivery checks exercise adding the recipient columns to the previous schema, migrating recognized legacy notes once, preserving multiline addresses/instructions/rejection text, leaving ambiguous/counter notes and existing snapshots untouched, creating an order for a recipient different from the account owner, preserving delivery data after profile changes, exposing separate fields in admin/POS/customer history/invoices, and denying anonymous point redemption. These checks also run only in the temporary database.

Frontend recovery and cart-state checks: run `node --test tests/posWorkflow.test.js` from `frontend`. They verify the exact persisted request survives reload, employee isolation, storage errors, preserving unresolved requests after network/authorization failures, and refreshing prices/stock without silently altering quantities.

See [POS_CHECKOUT.md](../../POS_CHECKOUT.md) for the new checkout workflow and deployment notes.

On the first application start after this change, the initializer adds `users.session_version` and seeds the permission catalog once. Existing tokens must sign in again. Default `staff` permissions preserve operational access; review them in the role page. Subsequent starts preserve permission changes. The four administrator account/role management permissions are mandatory to avoid losing access to administration.
