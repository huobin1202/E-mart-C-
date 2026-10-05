@echo off
setlocal
echo ====================================================
echo Starting E-Mart Customer Mobile/Web App (Expo)
echo ====================================================
echo.
echo Options:
echo   - Web preview: opens automatically in browser
echo   - Phone: Scan QR code with Expo Go app
echo   - Android Emulator: press 'a'
echo.
cd /d "%~dp0Staff-E-commerce-main\customer-app"
npx expo start --web
