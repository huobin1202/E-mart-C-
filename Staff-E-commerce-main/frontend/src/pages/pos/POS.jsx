// src/pages/pos/POS.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import * as signalR from "@microsoft/signalr";
import {
  getOnlineOrders,
  confirmOnlineOrder,
  rejectOnlineOrder,
  deliverOnlineOrder,
} from "../../api/onlineOrderApi";
import {
  getProductByBarcode,
  getPaginatedProducts,
  getCurrentUserId,
  request,
} from "../../api/apiClient";
import { getCustomers } from "../../api/customerApi";
import { formatPrice } from "../../utils/formatPrice";
import { checkoutPos, getCheckoutRequestId, getPosCheckout, findPosCheckoutByRequest } from "../../api/posCheckoutApi";
import PosPaymentPanel from "../../components/orders/PosPaymentPanel";
import OnlinePaymentPanel from "../../components/orders/OnlinePaymentPanel";
import { useAuth } from "../../hook/useAuth";
import { paymentStatusLabels } from "../../utils/orderStatus";
import { mergeLatestCart, hasUnavailableItems } from "../../utils/posCart";
import { pendingCheckoutKey, readPendingCheckout, savePendingCheckout, isDefiniteCheckoutFailure } from "../../utils/posCheckoutSession";

const STATUS_CONFIG = {
  pending:    { label: "Chờ xác nhận", color: "bg-amber-100 text-amber-800",    dot: "bg-amber-500"  },
  processing: { label: "Đang xử lý",   color: "bg-primary-100 text-primary-800",      dot: "bg-primary-500"   },
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

// Web Audio API: Âm thanh bíp quét mã vạch
function playBarcodeBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1400, ctx.currentTime);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch (e) {
    console.debug("AudioContext error:", e);
  }
}

// Web Audio API: Âm thanh chuông báo có đơn online mới (ding-dong)
function playNewOrderChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    [
      { freq: 587.33, start: now, dur: 0.18 },
      { freq: 880.00, start: now + 0.15, dur: 0.35 },
    ].forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.25, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur);
    });
  } catch (e) {
    console.debug("AudioContext error:", e);
  }
}

export default function POS() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedOrderId = searchParams.get("orderId");
  const { permissions } = useAuth();
  const canWriteOrders = permissions.includes("orders.write");
  const [activeTab, setActiveTab] = useState("online");
  const [orders, setOrders] = useState([]);
  const [meta, setMeta] = useState({ totalItems: 0, totalPages: 1, pageNumber: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState(null);

  // Real-time alert banner
  const [realtimeAlert, setRealtimeAlert] = useState(null);

  // Detail modal
  const [detailOrder, setDetailOrder] = useState(null);

  // Reject modal
  const [rejectModal, setRejectModal] = useState({ open: false, orderId: null });
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Auto-refresh interval ref
  const intervalRef = useRef(null);

  // =========================================================
  // COUNTER POS (BÁN TẠI QUẦY) STATES
  // =========================================================
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const barcodeInputRef = useRef(null);

  const [posProducts, setPosProducts] = useState([]);
  const [posProductSearch, setPosProductSearch] = useState("");
  const [posProductLoading, setPosProductLoading] = useState(false);

  const [posCart, setPosCart] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerOptions, setCustomerOptions] = useState([]);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);

  const [pointsToUse, setPointsToUse] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash"); // "cash" | "other" (MoMo)
  const [cashGiven, setCashGiven] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [openingOrder, setOpeningOrder] = useState(false);
  const [openOrderError, setOpenOrderError] = useState("");
  const [refreshingCart, setRefreshingCart] = useState(false);
  const [sessionKey] = useState(() => pendingCheckoutKey(getCurrentUserId()));
  const [pendingCheckout, setPendingCheckout] = useState(null);
  const [sessionError, setSessionError] = useState("");
  const checkoutKey = useRef(null);
  const checkoutBusy = useRef(false);
  const productRequest = useRef(0);
  const receiptVersion = useRef("");

  useEffect(() => {
    let active = true;
    try {
      if (!getCurrentUserId()) throw new Error("Không xác định được nhân viên. Vui lòng đăng nhập lại trước khi bán hàng.");
      const pending = readPendingCheckout(window.sessionStorage, sessionKey);
      setPendingCheckout(pending);
      if (pending) {
        setActiveTab("pos");
        const payload = pending.payload;
        const restoredLines = payload.items.map((line) => ({ id: line.productId, name: `Sản phẩm #${line.productId}`, quantity: line.quantity, price: 0, stock: 0, isActive: false }));
        setPosCart(restoredLines);
        setOrderNote(payload.note || ""); setPointsToUse(payload.pointsUsed || 0);
        setCashGiven(payload.cashReceived ?? ""); setPaymentMethod(payload.paymentMethod === "e_wallet" ? "other" : payload.paymentMethod);
        setRefreshingCart(true);
        Promise.all([
          Promise.all(payload.items.map((line) => request(`/products/${line.productId}`).catch((error) => { if (error.status === 404) return null; throw error; }))),
          payload.customerId ? request(`/customers/${payload.customerId}`) : Promise.resolve(null),
        ]).then(([products, customer]) => {
          if (!active) return;
          setPosCart(mergeLatestCart(restoredLines, products.filter(Boolean)));
          setSelectedCustomer(customer);
        }).catch(() => { /* Recovery still retries the exact persisted payload, even if catalog refresh fails. */ })
          .finally(() => { if (active) setRefreshingCart(false); });
      }
    } catch (e) { setSessionError(e.message || "Không thể khôi phục yêu cầu POS."); }
    return () => { active = false; };
  }, [sessionKey]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Debounce search online orders
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 450);
    return () => clearTimeout(t);
  }, [search]);

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

  // =========================================================
  // SIGNALR REAL-TIME NOTIFICATIONS
  // =========================================================
  useEffect(() => {
    let connection = null;
    try {
      const hubUrl = "http://localhost:5099/hub/orders";
      connection = new signalR.HubConnectionBuilder()
        .withUrl(hubUrl, {
          accessTokenFactory: () => localStorage.getItem("auth_token") || "",
          skipNegotiation: false,
          transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling,
        })
        .withAutomaticReconnect()
        .build();

      connection.on("NewOrderReceived", (data) => {
        playNewOrderChime();
        setRealtimeAlert({
          id: Date.now(),
          orderNumber: data.orderNumber,
          customerName: data.customerName,
          totalAmount: data.totalAmount,
          itemCount: data.itemCount,
        });
        showToast(`🔔 Đơn hàng online mới: #${data.orderNumber} (${formatPrice(data.totalAmount)})`, "success");
        fetchOrders(1);
      });

      connection.on("OrderStatusChanged", () => {
        fetchOrders(page);
      });

      connection.start().catch((err) => {
        console.debug("SignalR connection error (may retry):", err);
      });
    } catch (err) {
      console.debug("SignalR setup error:", err);
    }

    return () => {
      if (connection) connection.stop();
    };
  }, [fetchOrders, page]);

  // =========================================================
  // COUNTER POS LOGIC
  // =========================================================
  // Tải danh sách sản phẩm mẫu cho POS quầy
  const loadPosProducts = useCallback(async (query = "") => {
    const sequence = ++productRequest.current;
    setPosProductLoading(true);
    try {
      const res = await getPaginatedProducts(1, 24, query, null, null, null, null, "", 1);
      if (sequence === productRequest.current) setPosProducts(res.items || []);
    } catch (err) {
      console.debug("Lỗi tải sản phẩm POS:", err);
    } finally {
      if (sequence === productRequest.current) setPosProductLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "pos") {
      loadPosProducts(posProductSearch);
      setTimeout(() => barcodeInputRef.current?.focus(), 150);
    }
  }, [activeTab, loadPosProducts, posProductSearch]);

  // Thêm sản phẩm vào giỏ hàng POS
  const addToPosCart = (product) => {
    if (checkoutBusy.current || pendingCheckout || refreshingCart || sessionError) return;
    const stock = product.inventory?.quantity ?? 0;
    if (!product.isActive || stock <= (posCart.find((item) => item.id === product.id)?.quantity || 0)) {
      showToast("Sản phẩm ngừng bán hoặc đã đạt số lượng tồn kho.", "error"); return;
    }
    setPosCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.id === product.id ? { ...item, quantity: Math.min(stock, item.quantity + 1), stock } : item
        );
      }
      return [
        ...current,
        {
          id: product.id,
          name: product.productName,
          price: product.discountPrice ?? product.price,
          barcode: product.barcode || product.sku,
          imageUrl: product.imageUrl,
          quantity: 1,
          stock,
          isActive: product.isActive,
        },
      ];
    });
  };

  const updateCartQuantity = (id, delta) => {
    setPosCart((current) =>
      current
        .map((item) => (item.id === id ? { ...item, quantity: delta > 0 ? (item.quantity >= item.stock ? item.quantity : item.quantity + delta) : item.quantity + delta } : item))
        .filter((item) => item.quantity > 0)
    );
  };

  // Quét Barcode trực tiếp từ máy quét
  const handleBarcodeScan = async (e) => {
    if (e.key === "Enter" && barcodeInput.trim()) {
      e.preventDefault();
      const code = barcodeInput.trim();
      setBarcodeLoading(true);
      try {
        const prod = await getProductByBarcode(code);
        if (prod) {
          playBarcodeBeep();
          addToPosCart(prod);
          showToast(`Đã thêm: ${prod.productName}`, "success");
          setBarcodeInput("");
        } else {
          showToast(`Không tìm thấy sản phẩm có mã: ${code}`, "error");
        }
      } catch {
        showToast(`Không tìm thấy mã vạch: ${code}`, "error");
      } finally {
        setBarcodeLoading(false);
      }
    }
  };

  // Tìm kiếm khách hàng để tích điểm
  const handleSearchCustomer = async (keyword) => {
    setCustomerSearch(keyword);
    if (!keyword.trim()) {
      setCustomerOptions([]);
      return;
    }
    try {
      const res = await getCustomers(1, 5, keyword);
      setCustomerOptions(res.items || res.data || []);
      setCustomerSearchOpen(true);
    } catch (err) {
      console.debug("Lỗi tìm khách hàng:", err);
    }
  };

  // Tính toán giỏ hàng POS
  const posSubtotal = posCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const maxRedeemablePoints = selectedCustomer
    ? Math.min(selectedCustomer.rewardPoints || 0, Math.floor(posSubtotal / 1000))
    : 0;
  const effectivePointsUsed = Math.min(pointsToUse, maxRedeemablePoints);
  const pointsDiscount = effectivePointsUsed * 1000;
  const posTotalPayable = Math.max(0, posSubtotal - pointsDiscount);
  const changeDue = Math.max(0, (Number(cashGiven) || 0) - posTotalPayable);
  const pointsToEarn = Math.floor(posTotalPayable / 10000);

  // Thanh toán đơn POS
  const showCheckoutReceipt = useCallback((order) => setReceiptOrder({
    ...order,
    items: order.items.map((item) => ({ id: item.productId, name: item.productName, price: item.unitPrice, quantity: item.quantity })),
    cashGiven: order.cashReceived ?? 0,
    customer: order.customerName ? { fullName: order.customerName } : null,
  }), []);

  const handleReceiptChange = useCallback((order) => {
    showCheckoutReceipt(order);
    const version = `${order.id}:${order.status}:${order.paymentStatus}`;
    if (receiptVersion.current !== version) {
      receiptVersion.current = version;
      loadPosProducts(posProductSearch);
    }
  }, [showCheckoutReceipt, loadPosProducts, posProductSearch]);

  const refreshCart = async () => {
    if (checkoutBusy.current || pendingCheckout) return;
    setRefreshingCart(true);
    try {
      const [products, customer] = await Promise.all([
        Promise.all(posCart.map((item) => request(`/products/${item.id}`).catch((error) => { if (error.status === 404) return null; throw error; }))),
        selectedCustomer ? request(`/customers/${selectedCustomer.id}`) : Promise.resolve(null),
      ]);
      const updated = mergeLatestCart(posCart, products.filter(Boolean));
      setPosCart(updated);
      if (customer) setSelectedCustomer(customer);
      await loadPosProducts(posProductSearch);
      showToast(hasUnavailableItems(updated) ? "Có sản phẩm ngừng bán hoặc không đủ tồn. Hãy giảm số lượng hoặc bỏ sản phẩm." : "Đã cập nhật giá, tồn kho và điểm. Hãy kiểm tra lại tổng tiền.", hasUnavailableItems(updated) ? "error" : "success");
    } catch (e) { showToast(e.message || "Không thể cập nhật giỏ hàng.", "error"); }
    finally { setRefreshingCart(false); }
  };

  const submitCheckout = async (payload, recovering = false) => {
    if (checkoutBusy.current) return;
    checkoutBusy.current = true; setCheckoutSubmitting(true);
    try {
      // Never send if the request could not first be persisted for recovery.
      const pending = savePendingCheckout(window.sessionStorage, sessionKey, payload);
      setPendingCheckout(pending);
      const existing = recovering ? await findPosCheckoutByRequest(payload.requestId) : null;
      const order = existing || await checkoutPos(payload);
      window.sessionStorage.removeItem(sessionKey);
      setPendingCheckout(null); checkoutKey.current = null;
      handleReceiptChange(order);
      showToast(order.status === "cancelled" ? "Đã tìm thấy đơn đã hủy. Yêu cầu cũ đã được xử lý." : order.status === "refunded" ? "Đã tìm thấy đơn đã hoàn tiền." : order.paymentStatus === "paid" ? "Đã thanh toán và xuất hóa đơn." : "Đơn đã lưu, đang chờ xác nhận thanh toán.");
      setPosCart([]); setSelectedCustomer(null); setPointsToUse(0); setCashGiven(""); setOrderNote("");
    } catch (e) {
      if (isDefiniteCheckoutFailure(e)) {
        window.sessionStorage.removeItem(sessionKey); setPendingCheckout(null);
      }
      showToast(e.message || "Chưa rõ kết quả. Dùng nút kiểm tra yêu cầu đang lưu để tránh tạo trùng.", "error");
    } finally { checkoutBusy.current = false; setCheckoutSubmitting(false); }
  };

  const handleCheckoutPOS = async () => {
    if (checkoutBusy.current || pendingCheckout || refreshingCart || sessionError) return;
    if (!posCart.length) { showToast("Giỏ hàng đang trống!", "error"); return; }
    if (hasUnavailableItems(posCart)) { showToast("Giỏ hàng có sản phẩm không đủ tồn hoặc đã ngừng bán.", "error"); return; }
    if (paymentMethod === "cash" && (cashGiven === "" || !Number.isFinite(Number(cashGiven)) || Number(cashGiven) < posTotalPayable)) {
      showToast("Nhập đủ số tiền khách đưa trước khi thanh toán.", "error"); return;
    }
    const payload = {
      customerId: selectedCustomer?.id || null,
      note: orderNote.trim(),
      pointsUsed: effectivePointsUsed,
      paymentMethod: paymentMethod === "other" ? "e_wallet" : paymentMethod,
      expectedTotal: posTotalPayable,
      cashReceived: paymentMethod === "cash" ? Number(cashGiven) : null,
      items: posCart.map((item) => ({ productId: item.id, quantity: item.quantity })),
    };
    checkoutKey.current = getCheckoutRequestId(checkoutKey.current, payload);
    await submitCheckout({ ...payload, requestId: checkoutKey.current.id });
  };

  const handleConfirm = async (orderId) => {
    setActionLoading(true);
    try {
      await confirmOnlineOrder(orderId);
      if (detailOrder?.id === orderId) setDetailOrder(await request(`/orders/online/${orderId}`));
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
      if (detailOrder?.id === orderId) setDetailOrder(await request(`/orders/online/${orderId}`));
      showToast("Đã hoàn thành giao hàng & tích điểm cho khách!");
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
      if (detailOrder?.id === rejectModal.orderId) setDetailOrder(await request(`/orders/online/${rejectModal.orderId}`));
      showToast("Đã từ chối đơn hàng.");
      setRejectModal({ open: false, orderId: null });
      fetchOrders(page);
    } catch (err) {
      showToast(err.message || "Lỗi từ chối đơn", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const processingCount = orders.filter((o) => o.status === "processing").length;

  useEffect(() => {
    if (!selectedOrderId) return;
    let active = true;
    setOpeningOrder(true); setOpenOrderError(""); setReceiptOrder(null); setDetailOrder(null);
    (async () => {
      if (!/^\d+$/.test(selectedOrderId) || Number(selectedOrderId) <= 0) throw new Error("Mã đơn hàng không hợp lệ.");
      const order = await request(`/orders/${selectedOrderId}`);
      if (order.orderType === "mobile") {
        const detail = await request(`/orders/online/${order.id}`);
        if (active) { setActiveTab("online"); setDetailOrder(detail); }
      } else if (order.orderType === "pos") {
        const checkout = await getPosCheckout(order.id);
        if (active) { setActiveTab("pos"); showCheckoutReceipt(checkout); }
      } else {
        throw new Error("Chưa xác định được kênh bán của đơn. Vui lòng tải lại thông tin trước khi xử lý.");
      }
    })().catch((e) => { if (active) setOpenOrderError(e.message || "Không thể mở đơn hàng."); })
      .finally(() => { if (active) setOpeningOrder(false); });
    return () => { active = false; };
  }, [selectedOrderId, showCheckoutReceipt]);

  const closeSavedOrder = () => {
    if (actionLoading) return;
    setReceiptOrder(null); setDetailOrder(null);
    if (selectedOrderId) setSearchParams((previous) => { const next = new URLSearchParams(previous); next.delete("orderId"); return next; }, { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-primary-50">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-[9999] px-5 py-3 rounded-xl shadow-xl text-white text-sm font-medium transition-all ${
            toast.type === "error" ? "bg-red-500" : "bg-emerald-600"
          }`}
        >
          {toast.type === "error" ? "❌ " : "✅ "}
          {toast.msg}
        </div>
      )}

      {/* Real-time Order Popup Banner */}
      {realtimeAlert && (
        <div className="fixed top-20 right-5 z-[9998] max-w-sm bg-primary-900 text-white rounded-2xl shadow-2xl p-4 border border-primary-700 animate-bounce">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔔</span>
              <div>
                <h4 className="font-bold text-sm text-amber-300">Đơn hàng mới từ App!</h4>
                <p className="text-xs text-primary-200">Mã đơn: #{realtimeAlert.orderNumber}</p>
              </div>
            </div>
            <button
              onClick={() => setRealtimeAlert(null)}
              className="text-primary-300 hover:text-white text-lg font-bold"
            >
              ✕
            </button>
          </div>
          <div className="mt-2 text-xs text-primary-100 flex justify-between">
            <span>Khách: <strong>{realtimeAlert.customerName}</strong></span>
            <span className="text-amber-300 font-bold">{formatPrice(realtimeAlert.totalAmount)}</span>
          </div>
          <button
            onClick={() => {
              setActiveTab("online");
              setRealtimeAlert(null);
            }}
            className="mt-3 w-full py-1.5 bg-amber-400 hover:bg-amber-300 text-primary-950 font-bold text-xs rounded-lg transition"
          >
            Xem ngay trong danh sách →
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6">
        {openingOrder && <p role="status" className="mb-4 rounded-lg bg-white p-3 text-sm">Đang mở đơn #{selectedOrderId}…</p>}
        {openOrderError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{openOrderError}</p>}
        {sessionError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{sessionError}</p>}
        {pendingCheckout && <section className="mb-4 space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm" aria-label="Khôi phục yêu cầu POS">
          <p className="font-semibold">Có yêu cầu chốt đơn chưa rõ kết quả.</p>
          <p>Kiểm tra hoặc gửi lại đúng yêu cầu đã lưu trước khi tạo đơn khác. Hệ thống sẽ trả lại đơn cũ nếu đã tạo thành công.</p>
          <button onClick={() => submitCheckout(pendingCheckout.payload, true)} disabled={checkoutSubmitting || !canWriteOrders} className="rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{checkoutSubmitting ? "Đang kiểm tra…" : "Kiểm tra / thử lại yêu cầu đã lưu"}</button>
        </section>}
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">🖥️ Bán hàng (POS)</h1>
            <p className="text-gray-500 text-sm mt-1">
              Quét mã vạch tại quầy, tích điểm khách hàng & xử lý đơn online theo thời gian thực
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-full font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            SignalR Real-time: Đang kết nối
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-2 mb-6 bg-white rounded-2xl shadow-sm border p-1.5 w-fit">
          <button
            onClick={() => setActiveTab("online")}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 flex items-center gap-2 ${
              activeTab === "online"
                ? "bg-primary-600 text-white shadow-md shadow-primary-200"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            📱 Đơn hàng Online
            {pendingCount + processingCount > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 font-bold">
                {pendingCount + processingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("pos")}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 flex items-center gap-2 ${
              activeTab === "pos"
                ? "bg-primary-600 text-white shadow-md shadow-primary-200"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            🧾 Bán tại quầy (POS)
            {posCart.length > 0 && (
              <span className="bg-emerald-500 text-white text-xs rounded-full px-2 py-0.5 font-bold">
                {posCart.reduce((s, i) => s + i.quantity, 0)}
              </span>
            )}
          </button>
        </div>

        {/* ========================================================= */}
        {/* TAB 1: ĐƠN HÀNG ONLINE                                     */}
        {/* ========================================================= */}
        {activeTab === "online" && (
          <div>
            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: "Tổng đơn online", value: meta.totalItems, color: "border-primary-500", text: "text-primary-700" },
                { label: "Chờ xác nhận", value: pendingCount, color: "border-amber-500", text: "text-amber-700" },
                { label: "Đang giao / xử lý", value: processingCount, color: "border-primary-500", text: "text-primary-700" },
                { label: "Cần phục vụ gấp", value: pendingCount, color: "border-red-500", text: "text-red-700" },
              ].map((s) => (
                <div key={s.label} className={`bg-white rounded-2xl p-4 shadow-sm border-l-4 ${s.color}`}>
                  <div className="text-xs text-gray-500 font-medium">{s.label}</div>
                  <div className={`text-2xl font-black mt-1 ${s.text}`}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Filter bar */}
            <div className="bg-white rounded-2xl shadow-sm border p-4 mb-5 flex flex-wrap gap-3 items-center">
              <input
                type="text"
                placeholder="🔍 Tìm theo tên, SĐT, mã đơn..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 min-w-[220px] px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setPage(1);
                }}
                className="px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="pending">Chờ xác nhận</option>
                <option value="processing">Đang xử lý</option>
                <option value="completed">Hoàn thành</option>
                <option value="cancelled">Đã huỷ</option>
              </select>
              <button
                onClick={() => fetchOrders(page)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-semibold transition"
              >
                🔄 Làm mới
              </button>
              <span className="text-xs text-gray-400 ml-auto flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Real-time & Polling 30s
              </span>
            </div>

            {/* Orders list */}
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : orders.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center text-gray-400 border shadow-sm">
                <div className="text-5xl mb-3">📭</div>
                <div className="text-base font-bold text-gray-600">Chưa có đơn hàng online nào</div>
                <div className="text-xs text-gray-400 mt-1">Đơn đặt từ mobile app sẽ hiển thị tự động tại đây</div>
              </div>
            ) : (
              <div className="grid gap-4">
                {orders.map((o) => (
                  <div
                    key={o.id}
                    className="bg-white rounded-2xl p-5 border shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-black text-primary-700">#{o.orderNumber}</span>
                        <StatusBadge status={o.status} />
                        <span className="text-xs text-gray-400">{formatDate(o.createdAt)}</span>
                      </div>
                      <div className="text-sm font-bold text-gray-800">
                        👤 {o.customerName || "Khách lẻ"}
                        {o.customerPhone && (
                          <span className="font-normal text-gray-500 ml-2">📞 {o.customerPhone}</span>
                        )}
                      </div>
                      {o.customerAddress && (
                        <div className="text-xs text-gray-500">📍 {o.customerAddress}</div>
                      )}
                      <div className="flex gap-2 text-xs">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                          {o.paymentMethod === "e_wallet" ? "Ví MoMo" : o.paymentMethod === "card" ? "Chuyển khoản QR" : "COD (Tiền mặt)"}
                        </span>
                        <span className={`px-2 py-0.5 rounded font-medium ${
                          o.paymentStatus === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}>
                          {o.paymentStatus === "paid" ? "Đã thanh toán" : "Chưa thanh toán"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col md:items-end gap-2 w-full md:w-auto">
                      <div className="text-xl font-black text-gray-900">{formatPrice(o.totalAmount)}</div>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => setDetailOrder(o)}
                          className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition"
                        >
                          👁️ Chi tiết
                        </button>
                        {o.status === "pending" && (
                          <>
                            <button
                              onClick={() => handleConfirm(o.id)}
                              disabled={actionLoading || !canWriteOrders}
                              className="px-3 py-1.5 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-bold shadow-sm transition disabled:opacity-50"
                            >
                              ✓ Xác nhận
                            </button>
                            <button
                              onClick={() => openReject(o.id)}
                              disabled={actionLoading || !canWriteOrders}
                              className="px-3 py-1.5 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-semibold transition disabled:opacity-50"
                            >
                              ✕ Huỷ
                            </button>
                          </>
                        )}
                        {o.status === "processing" && (
                          <button
                            onClick={() => handleDeliver(o.id)}
                            disabled={actionLoading || !canWriteOrders || (o.paymentMethod !== "cash" && o.paymentStatus !== "paid")}
                            className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-sm transition disabled:opacity-50"
                          >
                            🚀 Giao thành công
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: BÁN TẠI QUẦY (POS CHUYÊN DỤNG VỚI BARCODE SCANNER)  */}
        {/* ========================================================= */}
        {activeTab === "pos" && (
          <fieldset disabled={checkoutSubmitting || refreshingCart || !!pendingCheckout || !!sessionError || !canWriteOrders} className="min-w-0 grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Cột trái: Máy quét mã vạch + Sản phẩm */}
            <div className="lg:col-span-7 space-y-5">
              {/* Ô Quét Mã Vạch Barcode (Autofocus) */}
              <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-5 shadow-lg text-white">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">📟</span>
                    <h3 className="font-extrabold text-base">MÁY QUÉT MÃ VẠCH (BARCODE)</h3>
                  </div>
                  <span className="text-xs bg-white/20 px-2.5 py-1 rounded-full font-medium">
                    Nhấn Enter sau khi quét
                  </span>
                </div>
                <p className="text-xs text-emerald-100 mb-3">
                  Sử dụng súng quét mã vạch USB/Bluetooth hoặc gõ trực tiếp mã sản phẩm rồi nhấn Enter.
                </p>
                <div className="relative">
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={handleBarcodeScan}
                    placeholder="Quét mã vạch sản phẩm (ví dụ: 8900000000001)..."
                    disabled={barcodeLoading}
                    className="w-full pl-11 pr-24 py-3 bg-white text-gray-900 rounded-xl text-sm font-mono font-bold shadow-inner focus:outline-none focus:ring-4 focus:ring-emerald-300"
                  />
                  <span className="absolute left-3.5 top-3.5 text-gray-400 text-base">🔍</span>
                  <button
                    onClick={() => handleBarcodeScan({ key: "Enter", preventDefault: () => {} })}
                    disabled={barcodeLoading || !barcodeInput.trim()}
                    className="absolute right-2 top-2 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition disabled:opacity-50"
                  >
                    {barcodeLoading ? "Đang quét..." : "Thêm vào giỏ"}
                  </button>
                </div>
              </div>

              {/* Danh sách sản phẩm nhanh */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold text-gray-800 text-sm">Danh mục sản phẩm nhanh</h3>
                  <input
                    type="text"
                    placeholder="Tìm tên sản phẩm..."
                    value={posProductSearch}
                    onChange={(e) => setPosProductSearch(e.target.value)}
                    className="px-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300 w-48"
                  />
                </div>

                {posProductLoading ? (
                  <div className="flex items-center justify-center h-36">
                    <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[380px] overflow-y-auto pr-1">
                    {posProducts.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        disabled={(p.inventory?.quantity ?? 0) <= 0 || !p.isActive}
                        onClick={() => {
                          playBarcodeBeep();
                          addToPosCart(p);
                        }}
                        className="p-3 border rounded-xl text-left enabled:hover:border-emerald-500 enabled:hover:bg-emerald-50/50 enabled:cursor-pointer disabled:cursor-not-allowed disabled:bg-gray-100 disabled:grayscale disabled:opacity-50 transition flex flex-col justify-between"
                      >
                        <div>
                          <div className="text-xs font-mono text-gray-400">{p.barcode || p.sku || "—"}</div>
                          <div className="text-xs font-bold text-gray-800 line-clamp-2 mt-0.5">{p.productName}</div>
                        </div>
                        <div className="mt-2 flex flex-wrap justify-between items-center gap-2">
                          <span className="text-xs font-black text-emerald-700">{formatPrice(p.discountPrice ?? p.price)}</span>
                          <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
                            Còn: {(p.inventory?.quantity ?? 0).toLocaleString("vi-VN")}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Cột phải: Giỏ hàng quầy + Khách hàng & Điểm thưởng + Thanh toán */}
            <div className="lg:col-span-5 space-y-5">
              <div className="bg-white rounded-2xl p-5 shadow-sm border space-y-4">
                <div className="flex justify-between items-center border-b pb-3">
                  <h3 className="font-black text-gray-900 text-base">🛒 Giỏ hàng thanh toán</h3>
                  {posCart.length > 0 && (
                    <button
                      onClick={() => setPosCart([])}
                      className="text-xs text-red-500 hover:underline font-semibold"
                    >
                      Xóa giỏ
                    </button>
                  )}
                </div>

                <button type="button" onClick={refreshCart} className="rounded-lg border px-3 py-2 text-xs font-semibold">{refreshingCart ? "Đang cập nhật…" : "Cập nhật giá và tồn kho"}</button>

                {/* Items list */}
                {posCart.length === 0 ? (
                  <div className="py-10 text-center text-gray-400 text-xs">
                    Chưa có sản phẩm. Hãy quét mã vạch hoặc chọn sản phẩm từ danh sách.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                    {posCart.map((item) => (
                      <div key={item.id} className="flex justify-between items-center py-2 border-b text-xs">
                        <div className="flex-1 pr-2">
                          <div className="font-bold text-gray-800 line-clamp-1">{item.name}</div>
                          <div className="text-gray-400">{formatPrice(item.price)}</div>
                          <div className={item.isActive === false || item.quantity > item.stock ? "font-semibold text-red-600" : "text-gray-500"}>{item.isActive === false ? "Đã ngừng bán" : `Còn: ${item.stock}`}{item.quantity > item.stock ? " · Không đủ tồn" : ""}</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => updateCartQuantity(item.id, -1)}
                            className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 font-bold"
                          >
                            -
                          </button>
                          <span className="font-bold w-6 text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateCartQuantity(item.id, 1)}
                            disabled={item.isActive === false || item.quantity >= item.stock}
                            className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 font-bold"
                          >
                            +
                          </button>
                          <span className="font-black text-gray-900 min-w-[70px] text-right">
                            {formatPrice(item.price * item.quantity)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Khách hàng & Tích điểm */}
                <div className="pt-3 border-t space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-gray-700">Khách hàng thành viên:</label>
                    {selectedCustomer && (
                      <button
                        onClick={() => {
                          setSelectedCustomer(null);
                          setPointsToUse(0);
                        }}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Bỏ chọn
                      </button>
                    )}
                  </div>

                  {!selectedCustomer ? (
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Tìm theo SĐT hoặc tên khách..."
                        value={customerSearch}
                        onChange={(e) => handleSearchCustomer(e.target.value)}
                        className="w-full px-3 py-2 border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-300"
                      />
                      {customerSearchOpen && customerOptions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-xl shadow-xl z-20 max-h-40 overflow-y-auto">
                          {customerOptions.map((c) => (
                            <div
                              key={c.id}
                              onClick={() => {
                                setSelectedCustomer(c);
                                setCustomerSearch("");
                                setCustomerSearchOpen(false);
                              }}
                              className="p-2.5 hover:bg-primary-50 cursor-pointer text-xs flex justify-between items-center"
                            >
                              <div>
                                <div className="font-bold text-gray-800">{c.fullName}</div>
                                <div className="text-gray-400">{c.phone}</div>
                              </div>
                              <span className="text-emerald-600 font-bold">
                                ⭐ {c.rewardPoints || 0} điểm
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-primary-50 border border-primary-200 rounded-xl p-3 text-xs space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-primary-900">👤 {selectedCustomer.fullName}</span>
                        <span className="text-gray-500">{selectedCustomer.phone}</span>
                      </div>
                      <div className="flex justify-between items-center bg-white p-2 rounded-lg border">
                        <span className="text-emerald-700 font-bold">
                          ⭐ Điểm tích lũy: {selectedCustomer.rewardPoints || 0} điểm
                        </span>
                        <span className="text-gray-400">
                          (= {formatPrice((selectedCustomer.rewardPoints || 0) * 1000)})
                        </span>
                      </div>

                      {selectedCustomer.rewardPoints > 0 && (
                        <div className="flex items-center gap-2 pt-1">
                          <label className="text-gray-600 whitespace-nowrap">Dùng điểm:</label>
                          <input
                            type="number"
                            min="0"
                            max={maxRedeemablePoints}
                            value={pointsToUse}
                            onChange={(e) => setPointsToUse(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-24 px-2 py-1 border rounded text-xs font-bold text-emerald-800"
                          />
                          <button
                            onClick={() => setPointsToUse(maxRedeemablePoints)}
                            className="px-2 py-1 bg-primary-100 hover:bg-primary-200 text-primary-800 rounded text-xs font-semibold"
                          >
                            Tối đa
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t space-y-2">
                  <label htmlFor="pos-order-note" className="block text-xs font-bold text-gray-700">Ghi chú đơn hàng:</label>
                  <textarea
                    id="pos-order-note"
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    maxLength={1000}
                    rows={2}
                    placeholder="Nhập ghi chú (không bắt buộc)..."
                    className="w-full px-3 py-2 border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-300"
                  />
                </div>

                {/* Phương thức thanh toán */}
                <div className="pt-3 border-t space-y-2">
                  <label className="text-xs font-bold text-gray-700">Phương thức thanh toán:</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: "cash", label: "Tiền mặt", icon: "💵" },
                      { key: "other", label: "MoMo", icon: "🟣" },
                    ].map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setPaymentMethod(m.key)}
                        className={`py-2 px-1 text-xs rounded-xl font-bold border transition flex flex-col items-center gap-1 ${
                          paymentMethod === m.key
                            ? "bg-primary-600 text-white border-primary-600 shadow-sm"
                            : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <span className="text-base">{m.icon}</span>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tính tiền */}
                <div className="pt-3 border-t space-y-1.5 text-xs">
                  <div className="flex justify-between text-gray-500">
                    <span>Tổng tiền hàng:</span>
                    <span>{formatPrice(posSubtotal)}</span>
                  </div>
                  {pointsDiscount > 0 && (
                    <div className="flex justify-between text-emerald-600 font-semibold">
                      <span>Giảm từ điểm thưởng:</span>
                      <span>-{formatPrice(pointsDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-base text-primary-700 pt-1 border-t">
                    <span>Khách phải trả:</span>
                    <span>{formatPrice(posTotalPayable)}</span>
                  </div>

                  {paymentMethod === "cash" && (
                    <div className="pt-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-gray-600">Tiền khách đưa:</label>
                        <input
                          type="number"
                          value={cashGiven}
                          onChange={(e) => setCashGiven(e.target.value)}
                          placeholder={posTotalPayable.toString()}
                          className="flex-1 px-3 py-1.5 border rounded-lg text-xs font-bold text-right"
                        />
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>Tiền thừa trả khách:</span>
                        <span className="font-bold text-emerald-600">{formatPrice(changeDue)}</span>
                      </div>
                    </div>
                  )}

                  {selectedCustomer && (
                    <div className="text-xs text-primary-600 bg-primary-50 p-2 rounded-lg text-center font-medium">
                      ✨ Khách sẽ được tích lũy thêm: <strong>+{pointsToEarn} điểm</strong> sau đơn này
                    </div>
                  )}
                </div>

                {/* Nút thanh toán */}
                <button
                  onClick={handleCheckoutPOS}
                  disabled={checkoutSubmitting || refreshingCart || !!pendingCheckout || !posCart.length || hasUnavailableItems(posCart)}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-xl shadow-lg shadow-emerald-200 transition disabled:opacity-50"
                >
                  {checkoutSubmitting ? "Đang xử lý..." : "XÁC NHẬN ĐƠN HÀNG"}
                </button>
              </div>
            </div>
          </fieldset>
        )}
      </div>

      {/* ========================================================= */}
      {/* MODAL HOÁ ĐƠN THANH TOÁN TẠI QUẦY                         */}
      {/* ========================================================= */}
      {receiptOrder && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-gray-800 font-mono text-xs">
            <div className="text-center border-b pb-4 mb-4">
              <h2 className="font-black text-lg text-gray-900 tracking-wider">E-MART CONVENIENCE</h2>
              <p className="text-gray-500">Cửa hàng tiện lợi tươi ngon</p>
              <div className="text-gray-400 mt-1">{receiptOrder.paymentStatus === "paid" ? "Số HĐ" : "Mã đơn"}: #{receiptOrder.orderNumber}</div>
              <div className="text-gray-400">{formatDate(receiptOrder.createdAt)}</div>
            </div>

            <div className="space-y-1.5 border-b pb-3 mb-3">
              {receiptOrder.items.map((i) => (
                <div key={i.id} className="flex justify-between">
                  <span className="truncate max-w-[170px]">{i.name} x{i.quantity}</span>
                  <span className="font-bold">{formatPrice(i.price * i.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 border-b pb-3 mb-3">
              <div className="flex justify-between text-gray-500">
                <span>Tạm tính:</span>
                <span>{formatPrice(receiptOrder.subtotal)}</span>
              </div>
              {receiptOrder.pointsUsed > 0 && (
                <div className="flex justify-between text-emerald-600 font-bold">
                  <span>Dùng điểm:</span>
                  <span>-{formatPrice(receiptOrder.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-gray-900 pt-1">
                <span>TỔNG TIỀN:</span>
                <span>{formatPrice(receiptOrder.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Khách đưa:</span>
                <span>{formatPrice(receiptOrder.cashGiven)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Tiền thừa:</span>
                <span className="font-bold">{formatPrice(receiptOrder.changeDue)}</span>
              </div>
            </div>

            {receiptOrder.customer && (
              <div className="bg-gray-50 p-2.5 rounded-lg mb-4 text-center">
                <div>Khách hàng: <strong>{receiptOrder.customer.fullName}</strong></div>
                <div className="text-emerald-700 font-bold mt-0.5">
                  ⭐ Điểm thưởng tích thêm: +{receiptOrder.pointsEarned} điểm
                </div>
              </div>
            )}

            {receiptOrder.shippingAddress && <div className="mb-3 space-y-1 border-b pb-3"><p>Người nhận: {receiptOrder.recipientName || "—"}</p><p>Điện thoại: {receiptOrder.recipientPhone || "—"}</p><p className="whitespace-pre-line break-words">Địa chỉ giao hàng: {receiptOrder.shippingAddress}</p></div>}
            {receiptOrder.note?.trim() && <p className="mb-3 whitespace-pre-line break-words"><strong>Ghi chú: </strong>{receiptOrder.note}</p>}
            <PosPaymentPanel key={receiptOrder.id} order={receiptOrder} onChange={handleReceiptChange} />
            <div className="text-center text-gray-400 text-xs mb-4">
              Cảm ơn quý khách và hẹn gặp lại!
            </div>

            <button
              onClick={closeSavedOrder}
              className="w-full py-2.5 bg-gray-900 hover:bg-black text-white font-bold rounded-xl transition"
            >
              Đóng đơn hàng
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeSavedOrder}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="font-bold text-lg">Chi tiết đơn #{detailOrder.orderNumber}</h2>
              <button onClick={closeSavedOrder} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <StatusBadge status={detailOrder.status} />
                <span className="text-xs text-gray-400">{formatDate(detailOrder.createdAt)}</span>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div><span className="text-gray-500">Tên người nhận:</span> <strong>{detailOrder.recipientName || "Chưa xác định"}</strong></div>
                <div><span className="text-gray-500">Số điện thoại người nhận:</span> {detailOrder.recipientPhone || "Chưa xác định"}</div>
                <div className="whitespace-pre-line break-words"><span className="text-gray-500">Địa chỉ giao hàng:</span> {detailOrder.shippingAddress || "Chưa xác định"}</div>
                <div>
                  <span className="text-gray-500">Thanh toán:</span>{" "}
                  <strong>{detailOrder.paymentMethod === "e_wallet" ? "Ví MoMo" : detailOrder.paymentMethod === "card" ? "Chuyển khoản QR" : "COD (Tiền mặt)"}</strong>
                </div>
                <div><span className="text-gray-500">Trạng thái thanh toán: </span><strong>{paymentStatusLabels[detailOrder.paymentStatus] || detailOrder.paymentStatus}</strong></div>
                {detailOrder.note?.trim() && <div className="whitespace-pre-line break-words"><span className="text-gray-500">Ghi chú:</span> {detailOrder.note}</div>}
              </div>

              {detailOrder.items && detailOrder.items.length > 0 && (
                <div>
                  <div className="font-semibold text-sm text-gray-700 mb-2">Sản phẩm đặt hàng:</div>
                  <div className="space-y-2">
                    {detailOrder.items.map((item) => (
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
                  <span className="text-primary-600">{formatPrice(detailOrder.totalAmount)}</span>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                {detailOrder.status === "pending" && <button disabled={actionLoading || !canWriteOrders} onClick={() => handleConfirm(detailOrder.id)} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Xác nhận nhận đơn</button>}
                {detailOrder.status === "processing" && <button disabled={actionLoading || !canWriteOrders || (detailOrder.paymentMethod !== "cash" && detailOrder.paymentStatus !== "paid")} onClick={() => {
                  if (window.confirm(detailOrder.paymentMethod === "cash" ? `Xác nhận đã giao hàng và thu đủ ${formatPrice(detailOrder.totalAmount)} tiền COD?` : "Xác nhận đã giao hàng thành công?")) handleDeliver(detailOrder.id);
                }} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{detailOrder.paymentMethod === "cash" ? "Đã giao và thu đủ tiền COD" : "Hoàn tất giao hàng"}</button>}
                {["pending", "processing"].includes(detailOrder.status) && <button disabled={actionLoading || !canWriteOrders} onClick={() => openReject(detailOrder.id)} className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 disabled:opacity-50">Hủy đơn</button>}
              </div>
              <OnlinePaymentPanel key={detailOrder.id} order={detailOrder} onChange={async () => {
                setDetailOrder(await request(`/orders/online/${detailOrder.id}`));
                await fetchOrders(page);
              }} />
              {detailOrder.status === "processing" && detailOrder.paymentMethod !== "cash" && detailOrder.paymentStatus !== "paid" && <p className="text-sm text-amber-700">Chờ xác nhận thanh toán trước khi hoàn tất giao hàng.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal.open && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="font-bold text-lg mb-4">Từ chối / Huỷ đơn hàng</h2>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Lý do từ chối (tùy chọn)..."
              rows={3}
              className="w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-300 mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRejectModal({ open: false, orderId: null })}
                className="px-4 py-2 border rounded-xl text-sm hover:bg-gray-50"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading || !canWriteOrders}
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
