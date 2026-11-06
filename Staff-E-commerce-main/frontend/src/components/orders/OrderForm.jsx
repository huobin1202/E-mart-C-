import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { useAuth } from "../../hook/useAuth";
import { formatPrice } from "../../utils/formatPrice";
import { canProcessOrder, orderStatusBadgeClass, orderStatusText, paymentStatusLabels, paymentMethodLabels, saleChannelLabel } from "../../utils/orderStatus";

const date = (value) => (value ? new Date(value).toLocaleString("vi-VN") : "—");
const normalizeName = (value) => (value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi-VN");

function Info({ label, children, wide = false }) {
  return <div className={wide ? "sm:col-span-2" : ""}><dt className="text-xs text-gray-500">{label}</dt><dd className="mt-0.5 break-words font-medium text-gray-900">{children}</dd></div>;
}

/** Side panel shown beside the order list, same pattern as the invoice page. */
function Panel({ title, onClose, footer, children }) {
  return <article className="management-detail-panel min-w-0 rounded-xl border bg-white p-4 shadow-sm" aria-label="Chi tiết đơn hàng">
    <div className="flex items-center justify-between gap-3 border-b pb-3">
      <h2 className="min-w-0 text-lg font-semibold text-gray-800">{title}</h2>
      <button type="button" onClick={onClose} aria-label="Đóng chi tiết đơn hàng" title="Đóng"
        className="shrink-0 rounded-lg p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800">
        <X size={20} />
      </button>
    </div>
    {children}
    {footer && <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-4 text-sm">{footer}</div>}
  </article>;
}

/**
 * Order detail panel. Order of information: code, date, total → line items
 * (quantity, unit price and line total side by side) → customer / payment / delivery → notes and metadata.
 * All amounts are shown as returned by the API; nothing is recalculated here.
 */
export default function OrdersForm({ currentOrder: order, loading = false, onClose }) {
  const navigate = useNavigate();
  const { permissions } = useAuth();

  if (!order) {
    return <Panel title="Chi tiết đơn hàng" onClose={onClose}>
      <div className="space-y-3 pt-3" role="status" aria-label="Đang mở chi tiết đơn">
        {loading && [0, 1, 2, 3].map((row) => <div key={row} className="h-6 animate-pulse rounded bg-gray-100" />)}
      </div>
    </Panel>;
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const hasDeliveryDetails = Boolean(order.orderType === "mobile" || order.recipientName || order.shippingAddress);
  const sameDisplayName = Boolean(normalizeName(order.recipientName)) && normalizeName(order.customerName) === normalizeName(order.recipientName);
  const canSeeInvoice = permissions.includes("invoices.read") && (order.status === "completed" || order.status === "processing" || order.paymentStatus === "paid");

  const footer = (canSeeInvoice || canProcessOrder(order)) ? <>
    {canSeeInvoice && <button type="button" onClick={() => navigate(`/invoices?orderId=${order.id}`)} className="rounded-lg border bg-white px-3 py-2 text-gray-700">Xem hóa đơn</button>}
    {canProcessOrder(order) && <button type="button" onClick={() => navigate(`/pos?orderId=${order.id}`)} className="rounded-lg bg-primary-600 px-3 py-2 font-semibold text-white">{order.orderType === "pos" && order.paymentStatus === "pending" ? "Thanh toán tại POS" : "Xử lý tại POS"}</button>}
  </> : null;

  return <Panel onClose={onClose} footer={footer}
    title={<span className="flex flex-wrap items-center gap-2">Đơn hàng <span className="text-primary-700">{order.orderNumber}</span>
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${orderStatusBadgeClass(order.status)}`}>{orderStatusText(order)}</span></span>}>
    <section aria-label="Thông tin chính" className="mt-3 grid grid-cols-2 gap-3 rounded-lg border bg-gray-50 p-3">
      <div><p className="text-xs text-gray-500">Mã đơn hàng</p><p className="font-semibold text-gray-900">{order.orderNumber}</p></div>
      <div><p className="text-xs text-gray-500">Ngày lập</p><p className="font-semibold tabular-nums text-gray-900">{date(order.createdAt)}</p></div>
      <div className="col-span-2"><p className="text-xs text-gray-500">Tổng tiền</p><p className="text-xl font-bold tabular-nums text-primary-700">{formatPrice(order.totalAmount)}</p></div>
    </section>

    <section aria-label="Chi tiết mặt hàng" className="mt-4">
      <h3 className="mb-2 font-semibold text-gray-900">Chi tiết mặt hàng</h3>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600"><tr>
            <th className="px-3 py-2 text-left font-medium">Sản phẩm</th>
            <th className="whitespace-nowrap px-3 py-2 text-right font-medium">SL</th>
            <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Đơn giá</th>
            <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Thành tiền</th>
          </tr></thead>
          <tbody>
            {items.length === 0
              ? <tr><td colSpan={4} className="p-4 text-center text-gray-500">Đơn hàng không có mặt hàng.</td></tr>
              : items.map((item, index) => <tr key={item.id ?? `${item.productId}-${index}`} className="border-t">
                <td className="px-3 py-2 break-words">{item.productName}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatPrice(item.unitPrice)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{formatPrice(item.totalPrice)}</td>
              </tr>)}
          </tbody>
          <tfoot className="border-t bg-gray-50 tabular-nums">
            <tr><td colSpan={3} className="px-3 py-1.5 text-right text-gray-600">Tạm tính</td><td className="whitespace-nowrap px-3 py-1.5 text-right">{formatPrice(order.subtotal)}</td></tr>
            <tr><td colSpan={3} className="px-3 py-1.5 text-right text-gray-600">Giảm giá</td><td className="whitespace-nowrap px-3 py-1.5 text-right">{formatPrice(order.discount)}</td></tr>
            <tr className="border-t"><td colSpan={3} className="px-3 py-2 text-right font-semibold">Tổng tiền</td><td className="whitespace-nowrap px-3 py-2 text-right text-base font-bold text-primary-700">{formatPrice(order.totalAmount)}</td></tr>
          </tfoot>
        </table>
      </div>
    </section>

    <section aria-label="Khách hàng và thanh toán" className="mt-4 rounded-lg border p-3">
      <h3 className="mb-2 font-semibold text-gray-900">Khách hàng và thanh toán</h3>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {!sameDisplayName && <Info label={hasDeliveryDetails ? "Khách hàng đặt đơn" : "Khách hàng"}>{order.customerName || "Khách vãng lai"}</Info>}
        <Info label="Trạng thái thanh toán">{paymentStatusLabels[order.paymentStatus] || order.paymentStatus || "Chưa xác định"}</Info>
        <Info label="Phương thức thanh toán">{paymentMethodLabels[order.paymentMethod] || order.paymentMethod || "Chưa xác định"}</Info>
        <Info label="Kênh bán">{saleChannelLabel(order.orderType)}</Info>
      </dl>
    </section>

    {hasDeliveryDetails && <section aria-label="Thông tin người nhận" className="mt-4 rounded-lg border p-3">
      <h3 className="mb-2 font-semibold text-gray-900">Thông tin người nhận</h3>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Info label="Tên người nhận">{order.recipientName || "Chưa xác định"}</Info>
        <Info label="Số điện thoại người nhận">{order.recipientPhone || "Chưa xác định"}</Info>
        <Info label="Địa chỉ giao hàng" wide><span className="whitespace-pre-line">{order.shippingAddress || "Chưa xác định"}</span></Info>
      </dl>
    </section>}

    <section aria-label="Thông tin khác" className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      <div className="sm:col-span-2"><h3 className="mb-1 font-semibold text-gray-900">Ghi chú đơn hàng</h3><p className="whitespace-pre-line break-words rounded-lg bg-gray-50 p-3">{order.note?.trim() || "Không có ghi chú"}</p></div>
      <dl className="contents">
        <Info label="Nhân viên">{order.userName || "Chưa phân công"}</Info>
        <Info label="Ngày cập nhật">{date(order.updatedAt)}</Info>
      </dl>
    </section>
  </Panel>;
}
