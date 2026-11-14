import { formatPrice } from "../../utils/formatPrice";
import { orderStatusBadgeClass, orderStatusText, paymentMethodLabels } from "../../utils/orderStatus";
import TableScroll from "../ui/TableScroll";


// Identification first (code, date, total), then the item count and the secondary columns.
const columns = [
  { label: "Mã đơn hàng", align: "text-left" },
  { label: "Ngày lập", align: "text-left" },
  { label: "Tổng tiền", align: "text-right" },
  { label: "Số lượng SP", align: "text-right" },
  { label: "Khách hàng", align: "text-left" },
  { label: "Trạng thái", align: "text-center" },
  { label: "Thanh toán", align: "text-center" },
  { label: "Nhân viên", align: "text-left" },
];

export default function OrderTable({ showOrder, selectedOrderId, listOrders, loading, currentPage, totalPages, onPrev, onNext, pageSize, compact = true }) {
  const empty = !listOrders.length;
  return <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
    <TableScroll resetKey={`${currentPage}-${pageSize}`} busy={loading && !empty}><table className="management-table w-full table-auto text-sm" data-compact={compact}><thead className="bg-gray-50"><tr>
      {columns.map(({ label, align }) => <th key={label} className={`px-4 py-3 ${align}`}>{label}</th>)}
    </tr></thead><tbody>
      {loading && empty ? <tr><td colSpan={columns.length} className="p-8 text-center text-gray-500">Đang tải…</td></tr> : empty ? <tr><td colSpan={columns.length} className="p-8 text-center text-gray-500">Không có đơn hàng phù hợp.</td></tr> : listOrders.map((order) => <tr key={order.id} onClick={() => showOrder(order.id)} title="Bấm để xem chi tiết đơn" className={`border-t cursor-pointer hover:bg-primary-50 ${selectedOrderId === order.id ? "bg-primary-50" : ""}`}>
        <td className="whitespace-nowrap px-4 py-3 font-semibold text-primary-700">{order.orderNumber}</td>
        <td className="whitespace-nowrap px-4 py-3 tabular-nums">{order.createdAt ? new Date(order.createdAt).toLocaleString("vi-VN") : "—"}</td>
        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{formatPrice(order.totalAmount)}</td>
        <td className="px-4 py-3 text-right tabular-nums">{order.totalQuantity || 0}</td>
        <td className="px-4 py-3">{order.customerName || "Khách vãng lai"}</td>
        <td className="whitespace-nowrap px-4 py-3 text-center"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${orderStatusBadgeClass(order.status)}`}>{orderStatusText(order)}</span></td>
        <td className="px-4 py-3 text-center">{paymentMethodLabels[order.paymentMethod] || order.paymentMethod || "Chưa xác định"}</td>
        <td className="px-4 py-3">{order.userName || "Chưa phân công"}</td>
      </tr>)}
    </tbody></table></TableScroll>
    <footer className="flex items-center justify-between border-t px-3 py-2 text-sm"><button disabled={loading || currentPage <= 1} onClick={onPrev} className="min-h-8 rounded border px-3 py-1 disabled:opacity-40">Trước</button><span>Trang {currentPage} / {totalPages}</span><button disabled={loading || currentPage >= totalPages} onClick={onNext} className="min-h-8 rounded border px-3 py-1 disabled:opacity-40">Sau</button></footer>
  </section>;
}
