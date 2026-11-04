import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import Dashboard from "./pages/dashboard/Dashboard";
import ProductList from "./pages/products/ProductList";
import OrdersPage from "./pages/orders/OrdersPage";
import AuditPage from "./pages/audits/AuditPage";
import UserManagement from "./pages/users/UserManagement";
import RoleManagement from "./pages/users/RoleManagement";
import EmployeeManagement from "./pages/employees/EmployeeManagement";
import ProfilePage from "./pages/profile/ProfilePage";
import PromotionList from "./pages/promotions/PromotionList";
import LoginPage from "./pages/login/Login";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import RequirePermission from "./components/auth/RequirePermission";
import "./App.css";
import CustomerList from "./pages/customers/CustomerList";
import CategoryList from "./pages/categories/CategoryList";
import ReportsPage from "./pages/reports/InvoiceReports";
import UnitList from "./pages/units/UnitList";
import SupplierList from "./pages/suppliers/SupplierList";
import PurchaseOrderList from "./pages/purchaseOrders/PurchaseOrderList";
import POS from "./pages/pos/POS";
import InvoicePage from "./pages/invoices/InvoicePage";

// Component để xử lý redirect từ root
function RootRedirect() {
  const token = localStorage.getItem("auth_token");
  return token ? (
    <Navigate to="/dashboard" replace />
  ) : (
    <Navigate to="/login" replace />
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route path="/" element={<RootRedirect />} />

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/products" element={<RequirePermission permission="products.read"><ProductList /></RequirePermission>} />
          <Route path="/inventory" element={<Navigate to="/products" replace />} />
          <Route path="/orders" element={<RequirePermission permission="orders.read"><OrdersPage /></RequirePermission>} />
          <Route path="/invoices" element={<RequirePermission permission="invoices.read"><InvoicePage /></RequirePermission>} />
          <Route path="/pos" element={<RequirePermission permission="orders.read"><POS /></RequirePermission>} />
          <Route path="/audit" element={<RequirePermission permission="audit.read"><AuditPage /></RequirePermission>} />
          <Route path="/users" element={<RequirePermission permission="users.read"><UserManagement /></RequirePermission>} />
          <Route path="/employees" element={<RequirePermission permission="employees.read"><EmployeeManagement /></RequirePermission>} />
          <Route path="/roles" element={<RequirePermission permission="roles.read"><RoleManagement /></RequirePermission>} />
          <Route path="/profile" element={<ProfilePage />} />

          {/* Promotion Routes: create/detail/edit are modals inside the list page, old links go back to it. */}
          <Route path="/promotions" element={<RequirePermission permission="promotions.read"><PromotionList /></RequirePermission>} />
          <Route path="/promotions/*" element={<Navigate to="/promotions" replace />} />

          {/*Customer Routes */}
          <Route path="/customers" element={<RequirePermission permission="customers.read"><CustomerList /></RequirePermission>} />

          {/*Category Routes */}
          <Route path="/categories" element={<RequirePermission permission="categories.read"><CategoryList /></RequirePermission>} />

          <Route path="/suppliers" element={<RequirePermission permission="suppliers.read"><SupplierList /></RequirePermission>} />
          <Route path="/purchase-orders" element={<RequirePermission permission="purchaseorders.read"><PurchaseOrderList /></RequirePermission>} />

          <Route path="/units" element={<RequirePermission permission="units.read"><UnitList /></RequirePermission>} />

          {/*Reports Routes */}
          <Route path="/reports" element={<RequirePermission permission="reports.read"><ReportsPage /></RequirePermission>} />

          <Route path="*" element={<h1>404 - Page not found</h1>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
