@echo off
echo ====================================================
echo Starting Store Management System (Backend + Frontend)
echo ====================================================

start "Store Management Backend (:5099)" cmd /k "%~dp0run-backend.bat"
timeout /t 3 /nobreak >nul
start "Store Management Frontend (:5173)" cmd /k "%~dp0run-frontend.bat"

echo.
echo Backend is starting at: http://localhost:5099 (Swagger: http://localhost:5099/swagger)
echo Frontend is starting at: http://localhost:5173
echo.
echo Customer App (Mobile/Web):
echo   Run "f:\CNPM\run-customer-app.bat" to start Expo/Web preview at: http://localhost:8081
echo.
echo Login credentials:
echo   - Admin:   admin / admin123
echo   - Staff:   staff01 / admin123
echo.
