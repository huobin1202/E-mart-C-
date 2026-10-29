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
npm.cmd start -- --go --clear
```

This project uses Expo SDK 58. Install an Expo Go version that supports SDK 58 on your Android phone and scan the QR code. Keep the phone and computer on the same Wi-Fi. The `--go` option targets Expo Go, and `--clear` clears the Metro cache after the SDK upgrade. Stop any old Expo server before starting this command.

If your network blocks the QR connection, try `npm.cmd start -- --go --tunnel ngrok --clear`. SDK 58 defaults to an Expo tunnel that requires Expo login; explicitly selecting `ngrok` avoids that Expo login requirement. The tunnel exposes the Expo development server; your phone still needs network access to the backend URL below.

The Expo Go app connects to the backend using the computer's LAN address; create a local `.env` file with:

```text
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:5099/api
```

For the Android emulator, use `http://10.0.2.2:5099/api` instead. Restart Expo after changing `.env`. The backend listens on `0.0.0.0:5099` for development, so Windows Firewall may ask whether to allow local network access.

To build and install a native debug APK with `npm.cmd run build:android`, install Android Studio and its Android SDK first. Expo Go is the quickest way to preview the app on a phone.

The app loads active, in-stock products and categories from `GET /api/storefront/products` and `GET /api/storefront/categories`. Checkout sends cart product IDs and quantities to `POST /api/storefront/orders`; the backend recalculates prices and checks stock before saving the order and reducing inventory. Cart contents are stored on-device. Payment is currently cash on delivery; payment gateway and delivery integrations are not configured.
