import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Menu, UserRound } from "lucide-react";
import { logout } from "../../api/apiClient";
import { useAuth } from "../../hook/useAuth";

// Page titles shown in the top bar so users always know where they are.
const pageTitles = {
  "/dashboard": "Tổng quan",
  "/pos": "Bán hàng (POS)",
  "/orders": "Lịch sử đơn hàng",
  "/invoices": "Quản lý hóa đơn",
  "/customers": "Khách hàng",
  "/promotions": "Giảm giá",
  "/products": "Sản phẩm",
  "/categories": "Danh mục sản phẩm",
  "/units": "Đơn vị tính",
  "/suppliers": "Nhà cung cấp",
  "/purchase-orders": "Phiếu nhập hàng",
  "/employees": "Nhân viên",
  "/users": "Tài khoản",
  "/roles": "Phân quyền role",
  "/audit": "Nhật ký hệ thống",
  "/reports": "Báo cáo / Thống kê",
  "/profile": "Thông tin cá nhân",
};

const roleLabels = {
  admin: "Quản trị viên",
  manager: "Quản lý",
  staff: "Nhân viên",
  employee: "Nhân viên",
};

const getInitials = (name) => {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
  return letters.toUpperCase();
};

export default function Topbar({ onToggleSidebar }) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, loading } = useAuth();
  const menuRef = useRef(null);

  useEffect(() => {
    if (!showUserMenu) return undefined;
    const handlePointer = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setShowUserMenu(false);
    };
    const handleKey = (event) => { if (event.key === "Escape") setShowUserMenu(false); };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showUserMenu]);

  useEffect(() => { setShowUserMenu(false); }, [pathname]);

  const handleLogout = () => {
    if (confirm("Bạn có chắc muốn đăng xuất?")) {
      logout();
      navigate("/login");
    }
  };

  const displayName = user?.fullName || user?.username || "Người dùng";
  const roleLabel = roleLabels[String(user?.role || "").toLowerCase()] || user?.role || "";
  const titleKey = Object.keys(pageTitles).find((path) => pathname === path || pathname.startsWith(`${path}/`));
  const today = new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white/95 px-3 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:hidden"
          aria-label="Mở menu"
        >
          <Menu size={20} />
        </button>
        <div className="min-w-0">
          <p className="truncate text-xs text-gray-500">
            <span className="hidden sm:inline">Xin chào, <span className="font-medium text-gray-700">{loading ? "…" : displayName}</span> · </span>
            <span className="first-letter:uppercase">{today}</span>
          </p>
          <p className="truncate text-base font-semibold text-gray-900">
            {pageTitles[titleKey] || "Quản trị cửa hàng"}
          </p>
        </div>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setShowUserMenu((open) => !open)}
          className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-100"
          aria-haspopup="menu"
          aria-expanded={showUserMenu}
        >
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-600 text-sm font-semibold text-white">
            {loading ? "…" : getInitials(displayName)}
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
          </span>
          <span className="hidden flex-col text-left sm:flex">
            <span className="max-w-48 truncate text-sm font-medium text-gray-900">{loading ? "Đang tải..." : displayName}</span>
            <span className="text-xs text-gray-500">{loading ? "" : roleLabel}</span>
          </span>
          <ChevronDown size={16} className={`text-gray-400 transition-transform ${showUserMenu ? "rotate-180" : ""}`} />
        </button>

        {showUserMenu && (
          <div role="menu" className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="truncate text-sm font-semibold text-gray-900">{displayName}</p>
              {user?.email && <p className="truncate text-xs text-gray-500">{user.email}</p>}
            </div>
            <Link role="menuitem" to="/profile" className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
              <UserRound size={16} /> Thông tin cá nhân
            </Link>
            <button role="menuitem" type="button" onClick={handleLogout}
              className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50">
              <LogOut size={16} /> Đăng xuất
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
