import React, { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, Receipt, FileText, Package, Users,
  UserRound, Shield, FolderTree, Truck, PackagePlus, Ruler, Tags,
  ChartNoAxesCombined, History, ChevronDown, LogOut, X, Settings, Store,
} from "lucide-react";
import { logout } from "../../api/apiClient";
import { useAuth } from "../../hook/useAuth";

const navigationGroups = [
  {
    id: "sales", label: "Bán hàng", icon: ShoppingCart,
    items: [
      { to: "/pos", label: "Bán hàng (POS)", icon: ShoppingCart },
      { to: "/orders", label: "Lịch sử đơn hàng", icon: Receipt },
      { to: "/invoices", label: "Quản lý hóa đơn", icon: FileText },
      { to: "/customers", label: "Khách hàng", icon: UserRound },
      { to: "/promotions", label: "Giảm giá", icon: Tags },
    ],
  },
  {
    id: "products", label: "Sản phẩm", icon: Package,
    items: [
      { to: "/products", label: "Danh sách sản phẩm", icon: Package },
      { to: "/categories", label: "Danh mục sản phẩm", icon: FolderTree },
      { to: "/units", label: "Đơn vị tính", icon: Ruler },
    ],
  },
  {
    id: "purchasing", label: "Nhập hàng", icon: Truck,
    items: [
      { to: "/suppliers", label: "Nhà cung cấp", icon: Truck },
      { to: "/purchase-orders", label: "Phiếu nhập hàng", icon: PackagePlus },
    ],
  },
  {
    id: "system", label: "Hệ thống", icon: Settings,
    items: [
      { to: "/employees", label: "Nhân viên", icon: Users },
      { to: "/users", label: "Tài khoản", icon: UserRound },
      { to: "/roles", label: "Phân quyền role", icon: Shield },
      { to: "/audit", label: "Nhật ký hệ thống", icon: History },
    ],
  },
];

const pagePermissions = {
  "/pos": "orders.read", "/orders": "orders.read", "/invoices": "invoices.read",
  "/customers": "customers.read", "/promotions": "promotions.read", "/products": "products.read",
  "/categories": "categories.read", "/units": "units.read", "/suppliers": "suppliers.read",
  "/purchase-orders": "purchaseorders.read", "/employees": "employees.read",
  "/users": "users.read", "/roles": "roles.read", "/audit": "audit.read",
};

export default function Sidebar({ collapsed, onClose }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { permissions } = useAuth();
  const visibleGroups = navigationGroups.map((group) => ({
    ...group, items: group.items.filter((item) => permissions.includes(pagePermissions[item.to])),
  })).filter((group) => group.items.length > 0);
  const matchesPath = (path) => pathname === path || pathname.startsWith(`${path}/`);
  const activeGroupId = navigationGroups.find((group) => group.items.some((item) => matchesPath(item.to)))?.id;
  // Groups the user opened stay open; navigating only adds the active group. The old version
  // re-keyed every <details> by pathname, remounting the whole menu (and collapsing it) on each click.
  const [openGroups, setOpenGroups] = useState(() => new Set(activeGroupId ? [activeGroupId] : []));
  useEffect(() => {
    if (!activeGroupId) return;
    setOpenGroups((current) => (current.has(activeGroupId) ? current : new Set(current).add(activeGroupId)));
  }, [activeGroupId]);
  const toggleGroup = (groupId, open) => setOpenGroups((current) => {
    if (current.has(groupId) === open) return current;
    const next = new Set(current);
    if (open) next.add(groupId); else next.delete(groupId);
    return next;
  });
  const handleLogout = () => {
    if (confirm("Bạn có chắc muốn đăng xuất?")) {
      logout();
      navigate("/login");
    }
  };
  const linkClass = ({ isActive }) =>
    `flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
      isActive ? "bg-primary-50 text-primary-700 font-semibold" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
    }`;

  return (
    <aside aria-label="Thanh điều hướng quản trị"
      className={`fixed inset-y-0 left-0 z-999 w-64 flex-col overflow-hidden border-r border-gray-200 bg-white ${collapsed ? "hidden md:flex" : "flex"}`}
      style={{ height: "100dvh" }}>
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-100 px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white">
          <Store size={20} />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-sm font-bold tracking-wide text-gray-900">STORE MANAGER</p>
          <p className="text-xs text-gray-500">Trang quản trị</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Đóng menu" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 md:hidden"><X size={18} /></button>
      </div>

      <nav aria-label="Menu quản trị" className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable]">
        <NavLink to="/dashboard" className={linkClass} onClick={onClose}>
          <LayoutDashboard size={18} className="shrink-0" /><span>Tổng quan</span>
        </NavLink>
        {visibleGroups.map((group) => {
          const GroupIcon = group.icon;
          const isGroupActive = group.items.some((item) => matchesPath(item.to));
          return (
            <details key={group.id} open={openGroups.has(group.id)} onToggle={(event) => toggleGroup(group.id, event.currentTarget.open)} className="group/menu">
              <summary className={`flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors hover:bg-gray-100 [&::-webkit-details-marker]:hidden ${isGroupActive ? "text-primary-600" : "text-gray-700"}`}>
                <GroupIcon size={18} className="shrink-0" /><span className="flex-1">{group.label}</span>
                <ChevronDown size={16} className="shrink-0 text-gray-400 transition-transform group-open/menu:rotate-180" />
              </summary>
              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-gray-200 pl-2">
                {group.items.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <NavLink key={item.to} to={item.to} className={linkClass} onClick={onClose}>
                      <ItemIcon size={16} className="shrink-0" /><span className="truncate">{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </details>
          );
        })}
        {permissions.includes("reports.read") && (
          <NavLink to="/reports" className={linkClass} onClick={onClose}>
            <ChartNoAxesCombined size={18} className="shrink-0" /><span>Báo cáo / Thống kê</span>
          </NavLink>
        )}
      </nav>
      <div className="shrink-0 border-t border-gray-200 bg-white p-3">
        <button type="button" className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-red-50 hover:text-red-600" onClick={handleLogout}>
          <LogOut size={18} className="shrink-0" /><span>Đăng xuất</span>
        </button>
      </div>
    </aside>
  );
}
