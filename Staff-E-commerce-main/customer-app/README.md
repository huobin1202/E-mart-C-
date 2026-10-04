# E-Mart Android app

This is the native React Native customer app. It is a separate Expo project; the staff/admin web app remains in `../frontend` and is unchanged.

## Run on Android

Start the backend in one PowerShell terminal:

```powershell
cd D:\E-mart-C-\Staff-E-commerce-main\backend
dotnet run --launch-profile http
```

Start Expo in another terminal:

```powershell
cd D:\E-mart-C-\Staff-E-commerce-main\customer-app
npm.cmd install
npm.cmd start
```

Install Expo Go on an Android phone and scan the QR code. Keep the phone and computer on the same Wi-Fi. The Expo Go app connects to the backend using the computer's LAN address; create a local `.env` file with:

```text
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:5099/api
```

For the Android emulator, use `http://10.0.2.2:5099/api` instead. Restart Expo after changing `.env`. The backend listens on `0.0.0.0:5099` for development, so Windows Firewall may ask whether to allow local network access.

To build and install a native debug APK with `npm.cmd run build:android`, install Android Studio and its Android SDK first. Expo Go is the quickest way to preview the app on a phone.

The app loads active, in-stock products and categories from `GET /api/storefront/products` and `GET /api/storefront/categories`. Checkout sends cart product IDs and quantities to `POST /api/storefront/orders`; the backend recalculates prices and checks stock before saving the order and reducing inventory. Cart contents are stored on-device. Payment is currently cash on delivery; payment gateway and delivery integrations are not configured.
