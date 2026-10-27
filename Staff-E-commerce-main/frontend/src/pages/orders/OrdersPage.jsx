import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import OrdersForm from "../../components/orders/OrderForm";
import OrderTable from "../../components/orders/OrderTable";
import { useOrders } from "../../hook/useOrders";
import { useDebouncedSearch } from "../../hook/useDebouncedSearch";
import { orderStatusLabels } from "../../utils/orderStatus";
import { useRealtimeNotifications } from "../../hooks/useRealtimeNotifications";

export default function OrdersPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const openedOrderRef = useRef(null);
  const [searchInput, setSearchInput] = useState("");
  const {
    currentOrder, closeOrderModal, listOrders, currentPage, totalPages, setCurrentPage,
    selectedStatus, setSelectedStatus, selectedStartDate, setSelectedStartDate,
    selectedOrderType, setSelectedOrderType,
    selectedEndDate, setSelectedEndDate, searchKeyword, setSearchKeyword,
    loading, opening, error, loadOrdersAdvanced, showOrderById,
  } = useOrders();
  useRealtimeNotifications({
    NewOrderPlaced: () => loadOrdersAdvanced({ silent: true }),
    OrderStatusChanged: () => loadOrdersAdvanced({ silent: true }),
  });
  useEffect(() => {
    const refreshVisibleOrders = () => {
      if (document.visibilityState === "visible") loadOrdersAdvanced({ silent: true });
    };
    const timer = window.setInterval(refreshVisibleOrders, 3000);
    window.addEventListener("focus", refreshVisibleOrders);
    document.addEventListener("visibilitychange", refreshVisibleOrders);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisibleOrders);
      document.removeEventListener("visibilitychange", refreshVisibleOrders);
    };
  }, [loadOrdersAdvanced]);
  useDebouncedSearch(searchInput, searchKeyword, (keyword) => { setSearchKeyword(keyword); setCurrentPage(1); });
  useEffect(() => {
    const orderId = location.state?.orderId;
    if (!orderId || openedOrderRef.current === orderId) return;
    openedOrderRef.current = orderId;
    showOrderById(orderId);
    navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate, showOrderById]);
  return <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
    <h1 className="text-2xl font-bold">Lịch sử đơn hàng</h1>
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
      <label className="min-w-48 flex-1 text-sm">Tìm đơn hàng<input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Mã đơn, khách hàng hoặc nhân viên" className="mt-1 block w-full rounded-lg border px-3 py-2" /></label>
      <label className="text-sm">Trạng thái đơn<select value={selectedStatus} onChange={(e) => { setSelectedStatus(e.target.value); setCurrentPage(1); }} className="mt-1 block rounded-lg border px-3 py-2"><option value="">Tất cả</option>{Object.entries(orderStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm">Kênh bán<select value={selectedOrderType} onChange={(e) => { setSelectedOrderType(e.target.value); setCurrentPage(1); }} className="mt-1 block rounded-lg border px-3 py-2"><option value="">Tất cả</option><option value="mobile">Online</option><option value="pos">Tại quầy</option></select></label>
      <label className="text-sm">Từ ngày<input type="date" value={selectedStartDate} onChange={(e) => { setSelectedStartDate(e.target.value); setCurrentPage(1); }} className="mt-1 block rounded-lg border px-3 py-2" /></label>
      <label className="text-sm">Đến ngày<input type="date" value={selectedEndDate} onChange={(e) => { setSelectedEndDate(e.target.value); setCurrentPage(1); }} className="mt-1 block rounded-lg border px-3 py-2" /></label>
      <button disabled={loading} onClick={loadOrdersAdvanced} className="rounded-lg border px-4 py-2 disabled:opacity-50">Làm mới</button>
    </div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    {opening && <p role="status" className="text-sm text-gray-500">Đang mở chi tiết đơn…</p>}
    <OrderTable listOrders={listOrders} showOrder={showOrderById} loading={loading} currentPage={currentPage} totalPages={totalPages} onPrev={() => setCurrentPage((p) => Math.max(1, p - 1))} onNext={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} />
    {currentOrder && <OrdersForm currentOrder={currentOrder} onClose={closeOrderModal} />}
  </main>;
}
