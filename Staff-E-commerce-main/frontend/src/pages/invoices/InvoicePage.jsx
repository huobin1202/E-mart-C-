import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Printer, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getInvoice, getInvoiceById, getInvoices } from "../../api/invoiceApi";
import { useDebouncedSearch } from "../../hook/useDebouncedSearch";
import { paymentMethodLabels } from "../../utils/orderStatus";
import { useRealtimeNotifications } from "../../hooks/useRealtimeNotifications";
import TableDisplayControls from "../../components/ui/TableDisplayControls";
import TableScroll from "../../components/ui/TableScroll";

const money = (value) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value || 0);
const dateTime = (value) => new Date(value).toLocaleString("vi-VN");
const normalizeText = (value) => (value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi-VN");
const normalizePhone = (value) => (value || "").replace(/[\s().-]/g, "");
const statusLabel = { paid: "Đã thanh toán", pending: "Chờ thanh toán", failed: "Thất bại", refunded: "Đã hoàn tiền" };
const invoiceStatusLabels = {
  issued: "Đã phát hành",
  paid: "Đã thanh toán",
  voided: "Đã hủy",
  refunded: "Đã hoàn tiền",
};

export default function InvoicePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedOrderId = Number(searchParams.get("orderId")) || 0;
  const [result, setResult] = useState({ items: [], totalPages: 0, totalItems: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [compact, setCompact] = useState(true);
  const [showDetail, setShowDetail] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [customerInput, setCustomerInput] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [pendingPrintInvoiceId, setPendingPrintInvoiceId] = useState(null);
  const latestListRequest = useRef(0);
  const latestDetailRequest = useRef(0);

  useDebouncedSearch(customerInput, customerSearch, (keyword) => {
    setCustomerSearch(keyword);
    setPage(1);
  });

  const load = useCallback(async () => {
    const requestId = ++latestListRequest.current;
    setLoading(true);
    try {
      const data = await getInvoices({ page, pageSize, from, to, customerSearch });
      if (requestId !== latestListRequest.current) return;
      if (page > Math.max(1, data.totalPages)) {
        setPage(Math.max(1, data.totalPages));
        return;
      }
      setResult(data);
      setListError("");
    } catch (error) {
      if (requestId === latestListRequest.current) {
        setListError(error.message || "Không tải được danh sách hóa đơn.");
      }
    } finally {
      if (requestId === latestListRequest.current) setLoading(false);
    }
  }, [page, pageSize, from, to, customerSearch]);

  const openByInvoiceId = useCallback(async (invoiceId, forceOpen = false) => {
    if (!invoiceId) return;
    if (!forceOpen && showDetail && selectedInvoiceId === invoiceId) {
      latestDetailRequest.current++;
      setShowDetail(false);
      setSelectedInvoiceId(null);
      setSelected(null);
      setDetailError("");
      setDetailLoading(false);
      return;
    }
    setShowDetail(true);
    const requestId = ++latestDetailRequest.current;
    setSelectedInvoiceId(invoiceId);
    setSelected(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const detail = await getInvoiceById(invoiceId);
      if (requestId === latestDetailRequest.current) setSelected(detail);
    } catch (error) {
      if (requestId === latestDetailRequest.current) {
        setDetailError(error.message || "Không tải được chi tiết hóa đơn.");
      }
    } finally {
      if (requestId === latestDetailRequest.current) setDetailLoading(false);
    }
  }, [selectedInvoiceId, showDetail]);

  const closeDetail = useCallback(() => {
    latestDetailRequest.current++;
    setShowDetail(false);
    setSelectedInvoiceId(null);
    setSelected(null);
    setDetailError("");
    setDetailLoading(false);
    if (searchParams.has("orderId")) {
      const next = new URLSearchParams(searchParams);
      next.delete("orderId");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const openByOrderId = useCallback(async (orderId) => {
    setShowDetail(true);
    const requestId = ++latestDetailRequest.current;
    setSelected(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const detail = await getInvoice(orderId);
      if (requestId === latestDetailRequest.current) {
        setSelectedInvoiceId(detail.invoiceId);
        setSelected(detail);
      }
    } catch (error) {
      if (requestId === latestDetailRequest.current) {
        setDetailError(error.message || "Không tải được chi tiết hóa đơn.");
      }
    } finally {
      if (requestId === latestDetailRequest.current) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const listRequests = latestListRequest;
    if (!linkedOrderId) {
      latestDetailRequest.current++;
      setSelectedInvoiceId(null);
      setSelected(null);
      setDetailError("");
      setDetailLoading(false);
    }
    load();
    return () => { listRequests.current++; };
  }, [load, linkedOrderId]);

  useEffect(() => {
    const detailRequests = latestDetailRequest;
    if (linkedOrderId > 0) openByOrderId(linkedOrderId);
    return () => { detailRequests.current++; };
  }, [linkedOrderId, openByOrderId]);

  useEffect(() => {
    if (!pendingPrintInvoiceId || detailLoading || selected?.invoiceId !== pendingPrintInvoiceId) return undefined;
    setPendingPrintInvoiceId(null);
    const timer = window.setTimeout(() => window.print(), 0);
    return () => window.clearTimeout(timer);
  }, [detailLoading, pendingPrintInvoiceId, selected]);

  useRealtimeNotifications({ NewOrderPlaced: () => load() });

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

  return (
    <section className="space-y-4">
      <header className="flex items-center gap-3">
        <div className="rounded-lg bg-primary-50 p-2 text-primary-700"><FileText size={20} /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý hóa đơn</h1>
          <p className="text-sm text-gray-500">Chọn một hóa đơn để xem chi tiết ngay bên cạnh.</p>
        </div>
      </header>

      {listError && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{listError}</div>}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-3 shadow-sm">
        <label className="min-w-0 flex-1 basis-64 text-sm text-gray-600">
          Khách hàng
          <input className="mt-1 block w-full rounded-lg border px-3 py-2" type="search"
            value={customerInput} onChange={(event) => setCustomerInput(event.target.value)}
            placeholder="Tên, số điện thoại hoặc email" />
        </label>
        <label className="text-sm text-gray-600">
          Từ ngày
          <input className="mt-1 block rounded-lg border px-3 py-2" type="date"
            value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
        </label>
        <label className="text-sm text-gray-600">
          Đến ngày
          <input className="mt-1 block rounded-lg border px-3 py-2" type="date"
            value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
        </label>
        <span className="ml-auto text-sm text-gray-500">{result.totalItems} hóa đơn</span>
      </div>

      <div className={`grid items-start gap-3 ${showDetail ? "xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,1fr)]" : "grid-cols-1"}`}>
        <section className="min-w-0 overflow-hidden rounded-xl border bg-white shadow-sm" aria-label="Danh sách hóa đơn">
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
            <TableDisplayControls pageSize={pageSize} compact={compact} onCompactChange={setCompact} disabled={loading}
              onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
          </div>
          <TableScroll resetKey={`${page}-${pageSize}-${from}-${to}-${customerSearch}`} busy={loading && result.items.length > 0}>
            <table className="management-table min-w-full w-full text-left text-sm" data-compact={compact} aria-label="Danh sách hóa đơn">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  {["Mã hóa đơn", "Ngày giờ tạo", "Khách hàng", "Tổng thanh toán", "Phương thức thanh toán", "Trạng thái hóa đơn", "Nhân viên tạo", "Thao tác"].map((heading) =>
                    <th key={heading} className="whitespace-nowrap px-4 py-3 font-medium">{heading}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading && result.items.length === 0 ? (
                  <tr><td colSpan="8" className="p-8 text-center text-gray-500">Đang tải...</td></tr>
                ) : result.items.length === 0 ? (
                  <tr><td colSpan="8" className="p-8 text-center text-gray-500">Không có hóa đơn phù hợp.</td></tr>
                ) : result.items.map((invoice) => (
                  <tr key={invoice.invoiceId}
                    onClick={() => openByInvoiceId(invoice.invoiceId)}
                    className={"cursor-pointer border-t hover:bg-primary-50 " +
                      (selectedInvoiceId === invoice.invoiceId ? "bg-primary-50" : "")}>
                    <td className="px-4 py-3 font-semibold text-primary-700">{invoice.invoiceNumber}</td>
                    <td className="px-4 py-3">{dateTime(invoice.issuedAt)}</td>
                    <td className="px-4 py-3">{invoice.customerName || "Khách lẻ"}</td>
                    <td className="px-4 py-3 text-right font-medium">{money(invoice.totalAmount)}</td>
                    <td className="px-4 py-3">{paymentMethodLabels[invoice.paymentMethod] || invoice.paymentMethod || "Chưa xác định"}</td>
                    <td className="px-4 py-3">{invoiceStatusLabels[invoice.invoiceStatus] || invoice.invoiceStatus || "Chưa xác định"}</td>
                    <td className="px-4 py-3">{invoice.createdByName || "Hệ thống"}</td>
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <div className="table-actions flex items-center gap-2">
                        <button type="button" onClick={() => {
                          setPendingPrintInvoiceId(invoice.invoiceId);
                          openByInvoiceId(invoice.invoiceId, true);
                        }} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                          <Printer size={14} /> In
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t px-3 py-2 text-sm">
            <span className="mr-auto text-gray-500">
              {result.totalItems ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, result.totalItems)} / {result.totalItems} hóa đơn
            </span>
            <button type="button" disabled={loading || page <= 1} onClick={() => setPage(1)}
              className="min-h-8 rounded border px-2 py-1 disabled:opacity-40">Đầu</button>
            <button type="button" disabled={loading || page <= 1} onClick={() => setPage((current) => current - 1)}
              className="min-h-8 rounded border px-2 py-1 disabled:opacity-40">Trước</button>
            <span>Trang {page} / {Math.max(1, result.totalPages)}</span>
            <button type="button" disabled={loading || page >= result.totalPages} onClick={() => setPage((current) => current + 1)}
              className="min-h-8 rounded border px-2 py-1 disabled:opacity-40">Sau</button>
            <button type="button" disabled={loading || page >= result.totalPages} onClick={() => setPage(result.totalPages)}
              className="min-h-8 rounded border px-2 py-1 disabled:opacity-40">Cuối</button>
          </div>
        </section>

        <article id="invoice-detail" hidden={!showDetail} className="invoice-paper invoice-detail-panel min-w-0 rounded-xl border bg-white p-4 shadow-sm" aria-label="Chi tiết hóa đơn">
          <div className="flex items-center justify-between gap-3 border-b pb-3">
            <h2 className="text-lg font-semibold text-gray-800">Chi tiết hóa đơn</h2>
            <button type="button" onClick={closeDetail} aria-label="Đóng chi tiết hóa đơn" title="Đóng"
              className="rounded-lg p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 print:hidden">
              <X size={20} />
            </button>
          </div>
          {detailLoading ? (
            <p className="py-10 text-center text-sm text-gray-500">Đang tải chi tiết...</p>
          ) : detailError ? (
            <p className="py-10 text-center text-sm text-red-700">{detailError}</p>
          ) : !selected ? (
            <p className="py-10 text-center text-sm text-gray-500">Chọn một dòng trong danh sách để xem chi tiết.</p>
          ) : (
            <div className="space-y-3 pt-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-bold">HÓA ĐƠN</h3>
                  <p className="mt-1 font-semibold text-primary-700">{selected.invoiceNumber}</p>
                  <p className="text-sm text-gray-500">
                    Trạng thái hóa đơn: {invoiceStatusLabels[selected.invoiceStatus] || selected.invoiceStatus || "Chưa xác định"}
                  </p>
                </div>
                <div className="text-sm text-gray-600">
                  <p>Ngày: {dateTime(selected.issuedAt)}</p>
                  <p>Đơn hàng: {selected.orderNumber}</p>
                  <p>Nhân viên: {selected.createdByName || "Hệ thống"}</p>
                  <p>Phương thức: {paymentMethodLabels[selected.paymentMethod] || selected.paymentMethod || "Chưa xác định"}</p>
                </div>
              </div>

              {customerDetails.length > 0 && (
                <div className="space-y-1 border-y py-3 text-sm">
                  {customerDetails.map(([label, value]) =>
                    <p key={label}><span className="font-medium">{label}:</span> {value || "—"}</p>)}
                </div>
              )}
              {hasDeliveryDetails && (
                <section className="space-y-1 text-sm">
                  <h4 className="font-semibold">Thông tin giao hàng</h4>
                  <p>Người nhận: {selected.recipientName || "—"}</p>
                  <p>Số điện thoại người nhận: {selected.recipientPhone || "—"}</p>
                  <p className="whitespace-pre-line break-words">Địa chỉ giao hàng: {selected.shippingAddress || "—"}</p>
                </section>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b text-gray-500">
                    <tr>
                      <th className="py-2">Sản phẩm</th>
                      <th className="py-2">SL</th>
                      <th className="py-2 text-right">Đơn giá</th>
                      <th className="py-2 text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selected.items || []).map((item, index) => (
                      <tr key={String(item.sku || item.productName) + "-" + index} className="border-b">
                        <td className="py-3">{item.productName}</td>
                        <td>{item.quantity}</td>
                        <td className="text-right">{money(item.unitPrice)}</td>
                        <td className="text-right">{money(item.totalPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="ml-auto max-w-xs space-y-2 text-sm">
                {[["Tạm tính", selected.subtotal], ["Thuế", selected.taxAmount],
                  ["Phí giao hàng", selected.feeAmount]].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3"><span>{label}</span><span>{money(value)}</span></div>
                ))}
                <div className="flex justify-between gap-3"><span>Giảm giá</span><span>−{money(selected.discount)}</span></div>
                <div className="flex justify-between gap-3 border-t pt-2 text-base font-bold">
                  <span>Tổng cộng</span><span>{money(selected.totalAmount)}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm print:hidden">
                <p>Thanh toán: <span className="font-semibold">{statusLabel[selected.paymentStatus] || selected.paymentStatus}</span></p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => navigate("/orders", { state: { orderId: selected.orderId } })}
                    className="rounded-lg border px-3 py-2 text-gray-700">Xem đơn hàng gốc</button>
                  <button type="button" onClick={() => window.print()}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-white">
                    <Printer size={16} />In / Xuất PDF
                  </button>
                </div>
              </div>
            </div>
          )}
        </article>
      </div>
      <style>{"@media print { body * { visibility: hidden !important; } .invoice-paper, .invoice-paper * { visibility: visible !important; } .invoice-paper { position: fixed !important; inset: 0 !important; width: 100% !important; max-width: none !important; max-height: none !important; overflow: visible !important; box-shadow: none !important; } }"}</style>
    </section>
  );
}
