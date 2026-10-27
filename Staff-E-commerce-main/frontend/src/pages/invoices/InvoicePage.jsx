import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Printer, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getInvoice, getInvoices } from "../../api/invoiceApi";
import { useDebouncedSearch } from "../../hook/useDebouncedSearch";
import { orderStatusLabels } from "../../utils/orderStatus";
import { useRealtimeNotifications } from "../../hooks/useRealtimeNotifications";

const money = (value) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value || 0);
const dateTime = (value) => new Date(value).toLocaleString("vi-VN");
const normalizeText = (value) => (value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi-VN");
const normalizePhone = (value) => (value || "").replace(/[\s().-]/g, "");
const statusLabel = { paid: "Đã thanh toán", pending: "Chờ thanh toán", failed: "Thất bại", refunded: "Đã hoàn tiền" };

export default function InvoicePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [result, setResult] = useState({ items: [], totalPages: 0, totalItems: 0 });
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [customerInput, setCustomerInput] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const latestRequest = useRef(0);
  useRealtimeNotifications({ NewOrderPlaced: () => load() });

  useDebouncedSearch(customerInput, customerSearch, (keyword) => {
    setCustomerSearch(keyword);
    setPage(1);
  });

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    try {
      const data = await getInvoices({ page, pageSize: 10, from, to, customerSearch });
      if (requestId !== latestRequest.current) return;
      setResult(data); setError("");
    }
    catch (e) { if (requestId === latestRequest.current) setError(e.message || "Không tải được danh sách hóa đơn."); }
    finally { if (requestId === latestRequest.current) setLoading(false); }
  }, [page, from, to, customerSearch]);
  useEffect(() => {
    const requests = latestRequest;
    load();
    return () => { requests.current++; };
  }, [load]);
  const open = useCallback(async (id) => {
    try { setSelected(await getInvoice(id)); setError(""); }
    catch (e) { setError(e.message || "Không tải được hóa đơn."); }
  }, []);
  useEffect(() => { const orderId = Number(searchParams.get("orderId")); if (orderId > 0) open(orderId); }, [searchParams, open]);
  const printInvoice = () => window.print();
  const hasDeliveryDetails = Boolean(selected?.shippingAddress || selected?.recipientName || selected?.recipientPhone);
  const customerDetails = selected ? [
    [hasDeliveryDetails ? "Khách hàng đặt đơn" : "Khách hàng", selected.customerName,
      hasDeliveryDetails && normalizeText(selected.recipientName) && normalizeText(selected.customerName) === normalizeText(selected.recipientName)],
    ["Điện thoại", selected.customerPhone,
      hasDeliveryDetails && normalizePhone(selected.recipientPhone) && normalizePhone(selected.customerPhone) === normalizePhone(selected.recipientPhone)],
    ["Email", selected.customerEmail, false],
    ["Địa chỉ khách hàng", selected.customerAddress,
      hasDeliveryDetails && normalizeText(selected.shippingAddress) && normalizeText(selected.customerAddress) === normalizeText(selected.shippingAddress)],
  ].filter(([, value, duplicate]) => !duplicate && (!hasDeliveryDetails || value?.trim())) : [];

  return <main className="p-6 space-y-5">
    <header className="flex items-center gap-3"><div className="rounded-xl bg-primary-50 p-3 text-primary-700"><FileText /></div><div><h1 className="text-2xl font-bold text-gray-900">Quản lý hóa đơn</h1><p className="text-sm text-gray-500">Hóa đơn của các đơn hàng đã hoàn thành.</p></div></header>
    {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 shadow-sm">
      <label className="min-w-0 flex-1 basis-64 text-sm text-gray-600">Khách hàng<input className="mt-1 block w-full rounded-lg border px-3 py-2" type="search" value={customerInput} onChange={e => setCustomerInput(e.target.value)} placeholder="Tên, số điện thoại hoặc email" /></label>
      <label className="text-sm text-gray-600">Từ ngày<input className="mt-1 block rounded-lg border px-3 py-2" type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} /></label>
      <label className="text-sm text-gray-600">Đến ngày<input className="mt-1 block rounded-lg border px-3 py-2" type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} /></label>
      <span className="ml-auto text-sm text-gray-500">{result.totalItems} hóa đơn</span>
    </div>
    <section className="overflow-x-auto rounded-xl border bg-white shadow-sm"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-gray-600"><tr>{["Mã hóa đơn", "Khách hàng", "Ngày tạo", "Trạng thái đơn", "Thanh toán", "Tổng tiền", ""].map(h => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>
      {loading ? <tr><td colSpan="7" className="p-8 text-center text-gray-500">Đang tải...</td></tr> : result.items.length === 0 ? <tr><td colSpan="7" className="p-8 text-center text-gray-500">Không có hóa đơn phù hợp.</td></tr> : result.items.map(i => <tr key={i.orderId} onClick={() => open(i.orderId)} className="border-t cursor-pointer hover:bg-gray-50"><td className="px-4 py-3 font-semibold text-primary-700"><button type="button" onClick={() => open(i.orderId)} className="text-left hover:underline">{i.invoiceNumber}</button></td><td className="px-4 py-3">{i.customerName || "Khách lẻ"}</td><td className="px-4 py-3">{dateTime(i.issuedAt)}</td><td className="px-4 py-3">{orderStatusLabels[i.orderStatus] || "Chưa xác định"}</td><td className="px-4 py-3">{statusLabel[i.paymentStatus] || i.paymentStatus}</td><td className="px-4 py-3 font-medium">{money(i.totalAmount)}</td><td className="px-4 py-3 text-right"><button onClick={() => open(i.orderId)} className="font-medium text-primary-700 hover:underline">Chi tiết</button></td></tr>)}</tbody></table></section>
    <div className="flex items-center justify-end gap-3 text-sm"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded border px-3 py-2 disabled:opacity-40">Trước</button><span>Trang {page} / {Math.max(1, result.totalPages)}</span><button disabled={page >= result.totalPages} onClick={() => setPage(p => p + 1)} className="rounded border px-3 py-2 disabled:opacity-40">Sau</button></div>
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}><article className="invoice-paper max-h-[92vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-6 shadow-2xl"><div className="mb-5 flex justify-between print:hidden"><span className="font-semibold">Chi tiết hóa đơn</span><button aria-label="Đóng" onClick={() => setSelected(null)}><X /></button></div><div className="flex items-start justify-between"><div><h2 className="text-2xl font-bold">HÓA ĐƠN</h2><p className="mt-1 text-gray-500">{selected.invoiceNumber} · Trạng thái đơn: {orderStatusLabels[selected.orderStatus] || "Chưa xác định"}</p></div><div className="text-right text-sm"><p>Ngày: {dateTime(selected.issuedAt)}</p><p>Đơn hàng: {selected.orderNumber}</p></div></div>
      {customerDetails.length > 0 && <div className="my-6 space-y-1 border-y py-4 text-sm">{customerDetails.map(([label, value]) => <p key={label} className={label === "Khách hàng" || label === "Khách hàng đặt đơn" ? "font-semibold" : ""}>{label}: {value || "—"}</p>)}</div>}
      {hasDeliveryDetails && <section className="my-5 space-y-1 text-sm"><h3 className="font-semibold">Thông tin giao hàng</h3><p>Người nhận: {selected.recipientName || "—"}</p><p>Số điện thoại người nhận: {selected.recipientPhone || "—"}</p><p className="whitespace-pre-line break-words">Địa chỉ giao hàng: {selected.shippingAddress || "—"}</p></section>}
      <table className="w-full text-left text-sm"><thead><tr className="border-b text-gray-500"><th className="py-2">Sản phẩm</th><th className="py-2">SL</th><th className="py-2 text-right">Đơn giá</th><th className="py-2 text-right">Thành tiền</th></tr></thead><tbody>{selected.items.map((item, n) => <tr key={`${item.sku}-${n}`} className="border-b"><td className="py-3">{item.productName}</td><td>{item.quantity}</td><td className="text-right">{money(item.unitPrice)}</td><td className="text-right">{money(item.totalPrice)}</td></tr>)}</tbody></table>
      <div className="ml-auto mt-4 max-w-xs space-y-2 text-sm"><div className="flex justify-between"><span>Tạm tính</span><span>{money(selected.subtotal)}</span></div><div className="flex justify-between"><span>Thuế</span><span>{money(selected.taxAmount)}</span></div><div className="flex justify-between"><span>Phí giao hàng</span><span>{money(selected.feeAmount)}</span></div><div className="flex justify-between"><span>Giảm giá</span><span>−{money(selected.discount)}</span></div><div className="flex justify-between border-t pt-2 text-base font-bold"><span>Tổng cộng</span><span>{money(selected.totalAmount)}</span></div></div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4 print:hidden"><div className="text-sm"><p>Trạng thái thanh toán: <span className="font-semibold">{statusLabel[selected.paymentStatus] || selected.paymentStatus}</span></p><p className="mt-1 text-xs text-gray-500">Tự động cập nhật theo đơn hàng và giao dịch thanh toán.</p></div><div className="flex gap-2"><button onClick={() => navigate("/orders", { state: { orderId: selected.orderId } })} className="rounded-lg border px-4 py-2 text-gray-700">Xem đơn hàng gốc</button><button onClick={printInvoice} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700"><Printer size={16} />In / Xuất PDF</button></div></div>
      </article></div>}
    <style>{`@media print { body * { visibility: hidden !important; } .invoice-paper, .invoice-paper * { visibility: visible !important; } .invoice-paper { position: fixed !important; inset: 0 !important; width: 100% !important; max-width: none !important; max-height: none !important; overflow: visible !important; border-radius: 0 !important; box-shadow: none !important; } }`}</style>
  </main>;
}
