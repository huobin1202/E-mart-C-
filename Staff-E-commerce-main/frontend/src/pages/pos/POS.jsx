// src/pages/pos/POS.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  getOnlineOrders,
  confirmOnlineOrder,
  rejectOnlineOrder,
  deliverOnlineOrder,
} from "../../api/onlineOrderApi";
import { formatPrice } from "../../utils/formatPrice";

const STATUS_CONFIG = {
  pending:    { label: "Chờ xác nhận", color: "bg-amber-100 text-amber-800",    dot: "bg-amber-500"  },
  processing: { label: "Đang xử lý",   color: "bg-blue-100 text-blue-800",      dot: "bg-blue-500"   },
  completed:  { label: "Hoàn thành",   color: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500"},
  cancelled:  { label: "Đã huỷ",       color: "bg-red-100 text-red-800",         dot: "bg-red-500"    },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "bg-gray-100 text-gray-700", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function formatDate(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function POS() {
  const [activeTab, setActiveTab] = useState("online");
  const [orders, setOrders] = useState([]);
  const [meta, setMeta] = useState({ totalItems: 0, totalPages: 1, pageNumber: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState(null);

  // Detail modal
  const [detailOrder, setDetailOrder] = useState(null);

  // Reject modal
  const [rejectModal, setRejectModal] = useState({ open: false, orderId: null });
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Auto-refresh interval ref
  const intervalRef = useRef(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 450);
    return () => clearTimeout(t);
  }, [search]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchOrders = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const data = await getOnlineOrders(p, 20, filterStatus, debouncedSearch);
      setOrders(data.items || []);
      setMeta({
        totalItems: data.totalItems || 0,
        totalPages: data.totalPages || 1,
        pageNumber: data.pageNumber || p,
        pageSize: data.pageSize || 20,
      });
    } catch (err) {
      showToast(err.message || "Không thể tải đơn hàng", "error");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, debouncedSearch]);

  useEffect(() => {
    fetchOrders(page);
  }, [page, fetchOrders]);

  // Auto-refresh every 30s
  useEffect(() => {
    intervalRef.current = setInterval(() => fetchOrders(page), 30000);
    return () => clearInterval(intervalRef.current);
  }, [page, fetchOrders]);

  const handleConfirm = async (orderId) => {
    setActionLoading(true);
    try {
      await confirmOnlineOrder(orderId);
      showToast("Đã xác nhận đơn hàng thành công!");
      fetchOrders(page);
    } catch (err) {
      showToast(err.message || "Lỗi xác nhận đơn", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeliver = async (orderId) => {
    setActionLoading(true);
    try {
      await deliverOnlineOrder(orderId);
      showToast("Đã hoàn thành giao hàng!");
      fetchOrders(page);
    } catch (err) {
      showToast(err.message || "Lỗi giao hàng", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const openReject = (orderId) => {
    setRejectModal({ open: true, orderId });
    setRejectReason("");
  };

  const handleReject = async () => {
    setActionLoading(true);
    try {
      await rejectOnlineOrder(rejectModal.orderId, rejectReason);
      showToast("Đã từ chối đơn hàng.");
      setRejectModal({ open: false, orderId: null });
      fetchOrders(page);
    } catch (err) {
      showToast(err.message || "Lỗi từ chối đơn", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const pendingCount = orders.filter(o => o.status === "pending").length;
  const processingCount = orders.filter(o => o.status === "processing").length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[9999] px-5 py-3 rounded-xl shadow-xl text-white text-sm font-medium transition-all
          ${toast.type === "error" ? "bg-red-500" : "bg-emerald-500"}`}>
          {toast.type === "error" ? "❌ " : "✅ "}{toast.msg}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">🖥️ Bán hàng (POS)</h1>
          <p className="text-gray-500 mt-1">Quản lý đơn hàng tại quầy và đơn hàng online từ mobile app</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 bg-white rounded-2xl shadow-sm border p-1.5 w-fit">
          <button
            onClick={() => setActiveTab("online")}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2
              ${activeTab === "online"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                : "text-gray-600 hover:bg-gray-100"}`}
          >
            📱 Đơn hàng Online
            {(pendingCount + processingCount) > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                {pendingCount + processingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("pos")}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
              ${activeTab === "pos"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                : "text-gray-600 hover:bg-gray-100"}`}
          >
            🧾 Bán tại quầy
          </button>
        </div>

        {/* Tab: Online Orders */}
        {activeTab === "online" && (
          <div>
            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: "Tổng đơn",        value: meta.totalItems,  color: "border-indigo-500",  text: "text-indigo-700"  },
                { label: "Chờ xác nhận",    value: pendingCount,     color: "border-amber-500",   text: "text-amber-700"   },
                { label: "Đang xử lý",      value: processingCount,  color: "border-blue-500",    text: "text-blue-700"    },
                { label: "Cần chú ý",        value: pendingCount,     color: "border-red-500",     text: "text-red-700"     },
              ].map(s => (
                <div key={s.label} className={`bg-white rounded-2xl p-4 shadow-sm border-l-4 ${s.color}`}>
                  <div className="text-xs text-gray-500 font-medium">{s.label}</div>
                  <div className={`text-2xl font-bold mt-1 ${s.text}`}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Filter bar */}
            <div className="bg-white rounded-2xl shadow-sm border p-4 mb-5 flex flex-wrap gap-3 items-center">
              <input
                type="text"
                placeholder="🔍 Tìm theo tên, SĐT, mã đơn..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 min-w-[220px] px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <select
                value={filterStatus}
                onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
                className="px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="pending">Chờ xác nhận</option>
                <option value="processing">Đang xử lý</option>
                <option value="completed">Hoàn thành</option>
                <option value="cancelled">Đã huỷ</option>
              </select>
              <button
                onClick={() => fetchOrders(page)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium transition"
              >
                🔄 Làm mới
              </button>
              <span className="text-xs text-gray-400 ml-auto">Tự động cập nhật mỗi 30s</span>
            </div>

            {/* Orders list */}
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : orders.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border p-12 text-center">
                <div className="text-5xl mb-3">📭</div>
                <p className="text-gray-500 font-medium">Không có đơn hàng online nào</p>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map(order => (
                  <div key={order.id}
                    className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all hover:shadow-md
                      ${order.status === "pending" ? "border-l-4 border-l-amber-400" : ""}
                      ${order.status === "processing" ? "border-l-4 border-l-blue-400" : ""}`}
                  >
                    <div className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        {/* Order info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-bold text-gray-900 text-base">#{order.orderNumber}</span>
                            <StatusBadge status={order.status} />
                            {order.paymentMethod && (
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                {order.paymentMethod === "cod" ? "💵 COD" : "💳 " + order.paymentMethod}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 space-y-1">
                            <div>👤 <strong>{order.customerName || "Khách ẩn danh"}</strong>
                              {order.customerPhone && <span className="text-gray-400 ml-2">· {order.customerPhone}</span>}
                            </div>
                            {order.customerAddress && (
                              <div className="text-xs text-gray-500">📍 {order.customerAddress}</div>
                            )}
                            {order.note && (
                              <div className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-lg">
                                📝 {order.note}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Amount + time */}
                        <div className="text-right">
                          <div className="text-xl font-bold text-indigo-600">{formatPrice(order.totalAmount)}</div>
                          {order.discount > 0 && (
                            <div className="text-xs text-gray-400 line-through">{formatPrice(order.subtotal)}</div>
                          )}
                          <div className="text-xs text-gray-400 mt-1">{formatDate(order.createdAt)}</div>
                        </div>
                      </div>

                      {/* Items preview */}
                      {order.items && order.items.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <div className="flex flex-wrap gap-2">
                            {order.items.slice(0, 4).map(item => (
                              <span key={item.id} className="text-xs bg-gray-50 border rounded-lg px-2 py-1">
                                {item.productName} ×{item.quantity}
                              </span>
                            ))}
                            {order.items.length > 4 && (
                              <span className="text-xs text-gray-400 py-1">+{order.items.length - 4} sản phẩm</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-4 flex flex-wrap gap-2 items-center">
                        <button
                          onClick={() => setDetailOrder(order)}
                          className="px-3 py-1.5 text-xs font-medium text-gray-600 border rounded-lg hover:bg-gray-50 transition"
                        >
                          📋 Chi tiết
                        </button>

                        {order.status === "pending" && (
                          <>
                            <button
                              onClick={() => handleConfirm(order.id)}
                              disabled={actionLoading}
                              className="px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                            >
                              ✅ Xác nhận đơn
                            </button>
                            <button
                              onClick={() => openReject(order.id)}
                              disabled={actionLoading}
                              className="px-4 py-1.5 text-xs font-semibold bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 transition"
                            >
                              ❌ Từ chối
                            </button>
                          </>
                        )}

                        {order.status === "processing" && (
                          <>
                            <button
                              onClick={() => handleDeliver(order.id)}
                              disabled={actionLoading}
                              className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
                            >
                              🚚 Đã giao hàng
                            </button>
                            <button
                              onClick={() => openReject(order.id)}
                              disabled={actionLoading}
                              className="px-4 py-1.5 text-xs font-semibold bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 transition"
                            >
                              ❌ Huỷ đơn
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {meta.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  {meta.totalItems} đơn hàng · Trang {meta.pageNumber}/{meta.totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-sm border rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40"
                  >Trước</button>
                  <button
                    onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                    disabled={page === meta.totalPages}
                    className="px-3 py-1.5 text-sm border rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40"
                  >Sau</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: POS tại quầy (placeholder gợi ý) */}
        {activeTab === "pos" && (
          <div className="bg-white rounded-2xl shadow-sm border p-12 text-center">
            <div className="text-6xl mb-4">🛒</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Bán hàng tại quầy</h2>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              Chức năng tạo đơn tại quầy hiện đang được phát triển. 
              Bạn có thể tạo đơn hàng từ màn hình <strong>Lịch sử đơn hàng</strong>.
            </p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detailOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDetailOrder(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="font-bold text-lg">Chi tiết đơn #{detailOrder.orderNumber}</h2>
              <button onClick={() => setDetailOrder(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <StatusBadge status={detailOrder.status} />
                <span className="text-xs text-gray-400">{formatDate(detailOrder.createdAt)}</span>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div><span className="text-gray-500">Khách hàng:</span> <strong>{detailOrder.customerName || "—"}</strong></div>
                <div><span className="text-gray-500">SĐT:</span> {detailOrder.customerPhone || "—"}</div>
                <div><span className="text-gray-500">Địa chỉ:</span> {detailOrder.customerAddress || "—"}</div>
                <div><span className="text-gray-500">Thanh toán:</span> {detailOrder.paymentMethod?.toUpperCase() || "—"}</div>
                {detailOrder.note && <div><span className="text-gray-500">Ghi chú:</span> {detailOrder.note}</div>}
              </div>

              {detailOrder.items && detailOrder.items.length > 0 && (
                <div>
                  <div className="font-semibold text-sm text-gray-700 mb-2">Sản phẩm đặt hàng:</div>
                  <div className="space-y-2">
                    {detailOrder.items.map(item => (
                      <div key={item.id} className="flex justify-between items-center py-2 border-b border-gray-100 text-sm">
                        <div>
                          <div className="font-medium">{item.productName}</div>
                          <div className="text-xs text-gray-400">{item.sku || "—"} · x{item.quantity}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{formatPrice(item.totalPrice)}</div>
                          <div className="text-xs text-gray-400">{formatPrice(item.unitPrice)}/sp</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Tạm tính:</span><span>{formatPrice(detailOrder.subtotal)}</span></div>
                {detailOrder.discount > 0 && (
                  <div className="flex justify-between text-emerald-600"><span>Giảm giá:</span><span>-{formatPrice(detailOrder.discount)}</span></div>
                )}
                <div className="flex justify-between font-bold text-base pt-1 border-t">
                  <span>Tổng cộng:</span>
                  <span className="text-indigo-600">{formatPrice(detailOrder.totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal.open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="font-bold text-lg mb-4">Từ chối / Huỷ đơn hàng</h2>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Lý do từ chối (tùy chọn)..."
              rows={3}
              className="w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-300 mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRejectModal({ open: false, orderId: null })}
                className="px-4 py-2 border rounded-xl text-sm hover:bg-gray-50"
              >Hủy bỏ</button>
              <button
                onClick={handleReject}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading ? "Đang xử lý..." : "Xác nhận từ chối"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
