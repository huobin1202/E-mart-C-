import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedSearch } from "../../hook/useDebouncedSearch";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import PanelCloseButton from "../../components/ui/PanelCloseButton";
import { getAllSuppliers } from "../../api/supplierApi";
import { getProductsPaginated } from "../../api/apiClient";
import {
  cancelPurchaseOrder,
  completePurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrderById,
  getPurchaseOrders,
} from "../../api/purchaseOrderApi";
import Pagination from "../../components/ui/Pagination";
import TableDisplayControls from "../../components/ui/TableDisplayControls";

const emptyLine = () => ({ productId: "", quantity: 1, importPrice: "" });
const formatMoney = (value) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value || 0);
const formatDate = (value) => value ? new Date(value).toLocaleString("vi-VN") : "-";

const statusStyle = {
  pending: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};

export default function PurchaseOrderList() {
  const location = useLocation();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [meta, setMeta] = useState({ currentPage: 1, totalPages: 1 });
  const [filters, setFilters] = useState({ search: "", status: "", supplierId: "" });
  const [searchInput, setSearchInput] = useState("");
  const latestRequest = useRef(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [compact, setCompact] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [processingMenuId, setProcessingMenuId] = useState(null);
  const [processingMenuPosition, setProcessingMenuPosition] = useState(null);
  const [form, setForm] = useState({ supplierId: "", note: "", items: [emptyLine()] });
  const [saving, setSaving] = useState(false);

  useDebouncedSearch(searchInput, filters.search, (keyword) => {
    setFilters((current) => ({ ...current, search: keyword }));
    setPage(1);
  });

  const loadOrders = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError("");
    try {
      const data = await getPurchaseOrders({ page, pageSize, ...filters });
      if (requestId !== latestRequest.current) return;
      setOrders(data.items || []);
      setMeta(data);
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      setError(err.message || "Không thể tải danh sách phiếu nhập.");
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [page, pageSize, filters]);

  useEffect(() => {
    const requests = latestRequest;
    loadOrders();
    return () => { requests.current++; };
  }, [loadOrders]);
  useEffect(() => {
    Promise.all([getAllSuppliers(), getProductsPaginated(1, 100, "", null, null, null, null, "name_asc", 1)])
      .then(([supplierData, productData]) => {
        setSuppliers((supplierData || []).filter((supplier) => supplier.isActive));
        setProducts(productData.items || []);
      })
      .catch((err) => setError(err.message || "Không thể tải dữ liệu tạo phiếu nhập."));
  }, []);
  useEffect(() => {
    const prefill = location.state?.prefillProduct;
    if (!prefill) return;
    setForm({
      supplierId: String(prefill.supplierId ?? prefill.supplier?.id ?? prefill.supplier_id ?? ""),
      note: `Nhập hàng bổ sung: ${prefill.productName ?? prefill.name ?? ""}`,
      items: [{ productId: String(prefill.id), quantity: 1, importPrice: "" }],
    });
    setShowCreate(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state?.prefillProduct, navigate]);

  const total = useMemo(() => form.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.importPrice || 0), 0), [form.items]);

  const updateLine = (index, field, value) => setForm((current) => ({
    ...current,
    items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
  }));

  const openDetail = async (id) => {
    if (detail?.id === id) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    try {
      const loadedDetail = await getPurchaseOrderById(id);
      const totalQuantity = loadedDetail.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const totalAmount = loadedDetail.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.importPrice || 0), 0);
      setDetail({ ...loadedDetail, totalQuantity, totalAmount });
    }
    catch (err) { setError(err.message || "Không thể tải chi tiết phiếu nhập."); }
    finally { setDetailLoading(false); }
  };

  const submitCreate = async (event) => {
    event.preventDefault();
    if (!form.supplierId || form.items.some((item) => !item.productId || Number(item.quantity) <= 0 || Number(item.importPrice) < 0)) {
      setError("Chọn nhà cung cấp, sản phẩm và nhập số lượng/giá hợp lệ.");
      return;
    }
    setSaving(true);
    try {
      const created = await createPurchaseOrder({
        supplierId: Number(form.supplierId), note: form.note,
        items: form.items.map((item) => ({ productId: Number(item.productId), quantity: Number(item.quantity), importPrice: Number(item.importPrice) })),
      });
      setShowCreate(false);
      setForm({ supplierId: "", note: "", items: [emptyLine()] });
      await loadOrders();
      setDetail(created);
    } catch (err) {
      setError(err.message || "Không thể tạo phiếu nhập.");
    } finally { setSaving(false); }
  };

  const transition = async (action, id) => {
    const message = action === "complete" ? "Hoàn tất nhập kho? Tồn kho sẽ được cộng và thao tác này không thể đảo ngược." : "Hủy phiếu nhập này?";
    if (!window.confirm(message)) return;
    try {
      const updated = action === "complete" ? await completePurchaseOrder(id) : await cancelPurchaseOrder(id);
      setProcessingMenuId(null);
      setProcessingMenuPosition(null);
      setDetail(updated);
      await loadOrders();
    } catch (err) { setError(err.message || "Không thể cập nhật phiếu nhập."); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Phiếu nhập hàng</h1><p className="mt-1 text-sm text-gray-500">Lập phiếu từ nhà cung cấp, kiểm tra chi tiết, rồi xác nhận cộng tồn kho.</p></div>
        <button type="button" onClick={() => setShowCreate(true)} className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700">Tạo phiếu nhập</button>
      </div>

      {error && <div className="border border-red-200 bg-red-50 text-red-800 px-4 py-3 rounded-md text-sm">{error}<button className="float-right font-semibold" onClick={() => setError("")}>Đóng</button></div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Tìm theo mã phiếu, nhà cung cấp" className="sm:col-span-1 px-3 py-2 border border-gray-300 rounded-md" />
        <select value={filters.status} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, status: event.target.value })); }} className="px-3 py-2 border border-gray-300 rounded-md"><option value="">Tất cả trạng thái</option><option value="pending">Chờ xử lý</option><option value="completed">Đã nhập kho</option><option value="cancelled">Đã hủy</option></select>
        <select value={filters.supplierId} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, supplierId: event.target.value })); }} className="px-3 py-2 border border-gray-300 rounded-md"><option value="">Tất cả nhà cung cáp</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>
      </div>

      <div className={`grid items-start gap-3 ${detail ? "xl:grid-cols-[minmax(0,1.35fr)_minmax(500px,1fr)]" : "grid-cols-1"}`}>
      <section className="min-w-0 space-y-3">
        <TableDisplayControls pageSize={pageSize} compact={compact} onCompactChange={setCompact} disabled={loading}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      <div className="overflow-x-auto border border-gray-200 rounded-md bg-white">
        <table className="management-table min-w-full w-full text-sm" data-compact={compact}>
          <thead className="bg-gray-50 text-left text-gray-600"><tr>
            {['Mã phiếu nhập', 'Ngày lập', 'Nhà cung cấp', 'Tổng SP', 'Tổng tiền', 'Nhân viên', 'Trạng thái', 'Thao tác'].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}
          </tr></thead>
          <tbody>{loading ? <tr><td colSpan="8" className="px-4 py-10 text-center text-gray-500">Đang tải...</td></tr> : orders.length === 0 ? <tr><td colSpan="8" className="px-4 py-10 text-center text-gray-500">Chưa có phiếu nhập phù hợp.</td></tr> : orders.map((order) => <tr key={order.id} onClick={() => openDetail(order.id)} title="Bấm để xem chi tiết" className={`cursor-pointer border-t border-gray-100 hover:bg-primary-50/60 ${detail?.id === order.id ? 'bg-primary-50' : ''}`}>
            <td className="px-4 py-3 font-medium text-primary-700">{order.poCode}</td>
            <td className="px-4 py-3">{formatDate(order.createdAt)}</td>
            <td className="px-4 py-3">{order.supplierName}</td>
            <td className="px-4 py-3 text-right">{Number(order.totalQuantity ?? 0)}</td>
            <td className="px-4 py-3 text-right font-medium">{formatMoney(order.totalAmount)}</td>
            <td className="px-4 py-3">{order.employeeName || order.userName || 'Hệ thống'}</td>
            <td className="px-4 py-3"><span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${statusStyle[order.status] || 'bg-gray-100 text-gray-700'}`}>{order.status === 'pending' ? 'Chờ xử lý' : order.status === 'completed' ? 'Đã nhập kho' : 'Đã hủy'}</span></td>
            <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>{order.status === 'pending' ?
              <button type="button" aria-haspopup="menu" aria-expanded={processingMenuId === order.id} onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const isClosing = processingMenuId === order.id;
                setProcessingMenuId(isClosing ? null : order.id);
                setProcessingMenuPosition(isClosing ? null : { top: rect.bottom + 4, left: Math.max(8, rect.right - 176) });
              }} className="rounded border px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-50">Xử lý ▾</button>
              : <span className="text-gray-400">—</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <Pagination meta={meta} onPageChange={setPage} />
      </section>

      {detail && <article className="management-detail-panel min-w-0 rounded-xl border bg-white p-4 shadow-sm" aria-label="Chi tiết phiếu nhập">
        <div className="flex items-center justify-between gap-3 border-b pb-3"><h2 className="text-lg font-semibold">Chi tiết phiếu nhập</h2><PanelCloseButton onClick={() => { setDetail(null); setDetailLoading(false); }} label="Đóng chi tiết phiếu nhập" /></div>
        {detailLoading ? <p className="py-10 text-center text-gray-500">Đang tải chi tiết...</p> : !detail ? <p className="py-10 text-center text-gray-500">Chọn một dòng để xem chi tiết.</p> : <div className="space-y-4 pt-4">
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2"><div><span className="text-gray-500">Mã phiếu</span><p className="font-semibold text-primary-700">{detail.poCode}</p></div><div><span className="text-gray-500">Nhà cung cấp</span><p>{detail.supplierName}</p></div><div><span className="text-gray-500">Nhân viên</span><p>{detail.employeeName || detail.userName || 'Hệ thống'}</p></div><div><span className="text-gray-500">Trạng thái</span><p>{detail.status === 'pending' ? 'Chờ xử lý' : detail.status === 'completed' ? 'Đã nhập kho' : 'Đã hủy'}</p></div></div>
          {detail.note && <p className="rounded bg-gray-50 p-3 text-sm"><span className="font-medium">Ghi chú:</span> {detail.note}</p>}
          <div className="overflow-hidden rounded-md border">
            <table className="w-full table-fixed text-xs 2xl:text-sm">
              <colgroup><col className="w-[36%]" /><col className="w-[14%]" /><col className="w-[24%]" /><col className="w-[26%]" /></colgroup>
              <thead className="bg-gray-50"><tr><th className="px-2 py-2 text-left">Sản phẩm</th><th className="px-2 py-2 text-right">SL</th><th className="px-2 py-2 text-right">Giá nhập</th><th className="px-2 py-2 text-right">Thành tiền</th></tr></thead>
              <tbody>{detail.items.map((item) => <tr key={item.productId} className="border-t"><td className="break-words px-2 py-2">{item.productName}<span className="block break-all text-[11px] text-gray-500">{item.sku || ''}</span></td><td className="whitespace-nowrap px-2 py-2 text-right">{item.quantity}</td><td className="whitespace-nowrap px-2 py-2 text-right">{formatMoney(item.importPrice)}</td><td className="whitespace-nowrap px-2 py-2 text-right">{formatMoney(item.subtotal)}</td></tr>)}</tbody>
              <tfoot className="border-t bg-gray-50"><tr><td className="px-2 py-3 text-right font-semibold">Tổng SP</td><td className="px-2 py-3 text-right font-semibold">{detail.totalQuantity}</td><td className="px-2 py-3 text-right font-semibold">Tổng tiền</td><td className="whitespace-nowrap px-2 py-3 text-right font-semibold">{formatMoney(detail.totalAmount)}</td></tr></tfoot>
            </table>
          </div>
        </div>}
      </article>}
      </div>

      {showCreate && <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4"><form onSubmit={submitCreate} className="w-full max-w-4xl bg-white rounded-md shadow-xl my-6"><div className="flex items-center justify-between px-5 py-4 border-b"><h2 className="font-semibold text-lg">Tạo phiếu nhập</h2><button type="button" onClick={() => setShowCreate(false)} className="text-gray-500 hover:text-gray-800">Đóng</button></div><div className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><label className="text-sm font-medium text-gray-700">Nhà cung cấp<select required value={form.supplierId} onChange={(event) => setForm((current) => ({ ...current, supplierId: event.target.value }))} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md"><option value="">Chọn nhà cung cấp</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label className="text-sm font-medium text-gray-700">Ghi chú<textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md" rows="2" /></label></div>
        <div className="overflow-x-auto border border-gray-200 rounded-md"><table className="min-w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Sản phẩm</th><th className="px-3 py-2 text-right">Số lượng</th><th className="px-3 py-2 text-right">Giá nhập</th><th className="px-3 py-2 text-right">Thành tiền</th><th className="px-3 py-2" /></tr></thead><tbody>{form.items.map((item, index) => <tr key={index} className="border-t"><td className="px-3 py-2 min-w-64"><select required value={item.productId} onChange={(event) => updateLine(index, "productId", event.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded"><option value="">Chọn sản phẩm</option>{products.map((product) => <option key={product.id} value={product.id}>{product.productName}{product.sku ? ` (${product.sku})` : ""}</option>)}</select></td><td className="px-3 py-2"><input required min="1" type="number" value={item.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} className="w-24 text-right px-2 py-1.5 border border-gray-300 rounded" /></td><td className="px-3 py-2"><input required min="0" type="number" value={item.importPrice} onChange={(event) => updateLine(index, "importPrice", event.target.value)} className="w-32 text-right px-2 py-1.5 border border-gray-300 rounded" /></td><td className="px-3 py-2 text-right whitespace-nowrap">{formatMoney(Number(item.quantity || 0) * Number(item.importPrice || 0))}</td><td className="px-3 py-2 text-right"><button type="button" disabled={form.items.length === 1} onClick={() => setForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))} className="text-red-700 disabled:text-gray-300">Xóa</button></td></tr>)}</tbody></table></div>
        <div className="flex items-center justify-between"><button type="button" onClick={() => setForm((current) => ({ ...current, items: [...current.items, emptyLine()] }))} className="text-primary-700 font-medium">Thêm dòng hàng</button><span className="font-semibold">Tổng dự kiến: {formatMoney(total)}</span></div>
      </div><div className="flex justify-end gap-3 px-5 py-4 border-t"><button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-300 rounded-md">Hủy</button><button disabled={saving} className="px-4 py-2 bg-primary-600 text-white rounded-md disabled:opacity-50 hover:bg-primary-700">{saving ? "Đang lưu..." : "Lưu phiếu chờ xử lý"}</button></div></form></div>}

      {processingMenuId && processingMenuPosition && createPortal(
        <div role="menu" style={{ position: "fixed", top: processingMenuPosition.top, left: processingMenuPosition.left }} className="z-[100] w-44 rounded-md border bg-white p-1 shadow-xl">
          <button type="button" role="menuitem" onClick={() => transition('cancel', processingMenuId)} className="block w-full rounded px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50">Hủy phiếu</button>
          <button type="button" role="menuitem" onClick={() => transition('complete', processingMenuId)} className="block w-full rounded px-3 py-2 text-left text-sm text-emerald-700 hover:bg-emerald-50">Hoàn tất nhập</button>
        </div>, document.body)}

    </div>
  );
}
