# E-Mart Android app

This is the native React Native customer app. It is a separate Expo project; the staff/admin web app remains in `../frontend` and is unchanged.

## Run on Android

On Windows, double-click `Start-Customer.cmd` at the repository root (or run `.\Start-Customer.cmd` in PowerShell there). It selects this project and starts Expo Go with an ngrok tunnel without requiring Expo login. Keep the terminal open and scan its QR code. From this directory, the equivalent command is `npm.cmd run start:tunnel`.

Start the backend in one PowerShell terminal:

```powershell
cd D:\E-mart-C-\Staff-E-commerce-main\backend
dotnet run --launch-profile http
```

Start Expo in another terminal:

```powershell
cd D:\E-mart-C-\Staff-E-commerce-main\customer-app
npm.cmd install
npm.cmd start -- --android --clear
```

This opens the app in the running Android emulator using Expo Go. If the emulator does not open automatically, start it in Android Studio, run `npm.cmd start -- --go --clear`, then press `a` in the Expo terminal. This project uses Expo SDK 58, so the installed Expo Go version must support SDK 58. Stop any old Expo server before starting this command.

If your network blocks the QR connection, run `npm.cmd run start:tunnel`. The tunnel exposes the Expo development server; your phone still needs network access to the backend URL below.

The Expo Go app connects to the backend using the computer's LAN address; create a local `.env` file with:

```text
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:5099/api
```

For the Android emulator, use `http://10.0.2.2:5099/api` instead. Restart Expo after changing `.env`. The backend listens on `0.0.0.0:5099` for development, so Windows Firewall may ask whether to allow local network access.

`EXPO_PUBLIC_API_URL` takes precedence on Android and web. For a hosted web build, set it to the public HTTPS API URL before exporting (for example, `https://api.example.com/api`). Without an explicit URL, an HTTPS website uses its own origin plus `/api`; local HTTP web development uses port 5099 on the browser's host.

To build and install a native debug APK with `npm.cmd run build:android`, install Android Studio and its Android SDK first. Expo Go is the quickest way to preview the app on a phone.

The app loads products and categories from `GET /api/storefront/products` and `GET /api/storefront/categories`. Out-of-stock products remain visible but cannot be added. Cart contents are stored on-device. Anyone can browse and add products; checkout offers **Đăng nhập** or **Tiếp tục không đăng nhập**. Both paths require the recipient's name, Vietnamese phone number and delivery address.

Signed-in checkout uses `POST /api/storefront/orders` and retains product discounts, eligible vouchers and reward points. Guest checkout obtains an opaque token from `POST /api/storefront/guest/session`, persists the exact pending request, and submits to `POST /api/storefront/guest/orders`. Guests receive only event promotions: the public catalogue shows regular prices and the backend rejects every voucher code and nonzero point redemption. The backend recalculates prices and validates stock and promotion limits; shipping remains free under the existing policy.

Guest orders have no customer profile or account association, even when the recipient phone matches an existing account. They appear in normal admin/POS handling. The confirmation shows the order number and recipient details; guests have no account order-history tab. COD, MoMo and bank transfer follow the configured payment options. The confirmation uses a private, seven-day receipt token for payment status and retrying a failed MoMo link; an order ID or phone number alone grants no access. Keep data-protection keys persistent across backend restarts. This does not create guest login accounts or expose a public guest-history endpoint.

Run `node --test tests/*.test.js` for app regression tests. The backend's isolated `AuthorizationRegression` runner supports `--guest-only` for guest pricing, validation, replay protection, recipient privacy, stock restoration, admin fulfillment and simulated MoMo/bank payment checks. No schema migration is needed for guest checkout itself. Restart the backend and reload Expo after applying the code.
