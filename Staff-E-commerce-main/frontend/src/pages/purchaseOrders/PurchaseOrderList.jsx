import { useEffect, useMemo, useState } from "react";
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

const emptyLine = () => ({ productId: "", quantity: 1, importPrice: "" });
const formatMoney = (value) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value || 0);
const formatDate = (value) => value ? new Date(value).toLocaleString("vi-VN") : "-";

const statusStyle = {
  pending: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-800",
};

export default function PurchaseOrderList() {
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [meta, setMeta] = useState({ currentPage: 1, totalPages: 1 });
  const [filters, setFilters] = useState({ search: "", status: "", supplierId: "" });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ supplierId: "", note: "", items: [emptyLine()] });
  const [saving, setSaving] = useState(false);

  const loadOrders = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getPurchaseOrders({ page, pageSize: 10, ...filters });
      setOrders(data.items || []);
      setMeta(data);
    } catch (err) {
      setError(err.message || "Không thể tải danh sách phiếu nhập.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOrders(); }, [page, filters.status, filters.supplierId]);
  useEffect(() => {
    Promise.all([getAllSuppliers(), getProductsPaginated(1, 100, "", null, null, null, null, "name_asc", 1)])
      .then(([supplierData, productData]) => {
        setSuppliers((supplierData || []).filter((supplier) => supplier.isActive));
        setProducts(productData.items || []);
      })
      .catch((err) => setError(err.message || "Không thể tải dữ liệu tạo phiếu nhập."));
  }, []);

  const total = useMemo(() => form.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.importPrice || 0), 0), [form.items]);

  const updateLine = (index, field, value) => setForm((current) => ({
    ...current,
    items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
  }));

  const openDetail = async (id) => {
    try { setDetail(await getPurchaseOrderById(id)); }
    catch (err) { setError(err.message || "Không thể tải chi tiết phiếu nhập."); }
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
      setDetail(updated);
      await loadOrders();
    } catch (err) { setError(err.message || "Không thể cập nhật phiếu nhập."); }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Phiếu nhập hàng</h1><p className="mt-1 text-sm text-gray-500">Lập phiếu từ nhà cung cấp, kiểm tra chi tiết, rồi xác nhận cộng tồn kho.</p></div>
        <button type="button" onClick={() => setShowCreate(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Tạo phiếu nhập</button>
      </div>

      {error && <div className="border border-rose-200 bg-rose-50 text-rose-800 px-4 py-3 rounded-md text-sm">{error}<button className="float-right font-semibold" onClick={() => setError("")}>Dong</button></div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} onKeyDown={(event) => event.key === "Enter" && loadOrders()} placeholder="Tim theo ma phieu, nha cung cap" className="sm:col-span-1 px-3 py-2 border border-gray-300 rounded-md" />
        <select value={filters.status} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, status: event.target.value })); }} className="px-3 py-2 border border-gray-300 rounded-md"><option value="">Tat ca trang thai</option><option value="pending">Cho xu ly</option><option value="completed">Da nhap kho</option><option value="cancelled">Da huy</option></select>
        <select value={filters.supplierId} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, supplierId: event.target.value })); }} className="px-3 py-2 border border-gray-300 rounded-md"><option value="">Tat ca nha cung cap</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-md bg-white">
        <table className="min-w-full text-sm"><thead className="bg-gray-50 text-left text-gray-600"><tr><th className="px-4 py-3 font-medium">Ma phieu</th><th className="px-4 py-3 font-medium">Nha cung cap</th><th className="px-4 py-3 font-medium">Nguoi lap</th><th className="px-4 py-3 font-medium text-right">Tong tien</th><th className="px-4 py-3 font-medium">Trang thai</th><th className="px-4 py-3 font-medium">Ngay lap</th><th className="px-4 py-3" /></tr></thead>
          <tbody>{loading ? <tr><td colSpan="7" className="px-4 py-10 text-center text-gray-500">Dang tai...</td></tr> : orders.length === 0 ? <tr><td colSpan="7" className="px-4 py-10 text-center text-gray-500">Chua co phieu nhap phu hop.</td></tr> : orders.map((order) => <tr key={order.id} className="border-t border-gray-100 hover:bg-gray-50"><td className="px-4 py-3 font-medium text-gray-900">{order.poCode}</td><td className="px-4 py-3">{order.supplierName}</td><td className="px-4 py-3">{order.userName || "-"}</td><td className="px-4 py-3 text-right">{formatMoney(order.totalAmount)}</td><td className="px-4 py-3"><span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${statusStyle[order.status] || "bg-gray-100 text-gray-700"}`}>{order.status === "pending" ? "Cho xu ly" : order.status === "completed" ? "Da nhap kho" : "Da huy"}</span></td><td className="px-4 py-3 whitespace-nowrap">{formatDate(order.createdAt)}</td><td className="px-4 py-3 text-right"><button onClick={() => openDetail(order.id)} className="text-indigo-700 hover:underline">Chi tiet</button></td></tr>)}</tbody>
        </table>
      </div>
      <Pagination meta={meta} onPageChange={setPage} />

      {showCreate && <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4"><form onSubmit={submitCreate} className="w-full max-w-4xl bg-white rounded-md shadow-xl my-6"><div className="flex items-center justify-between px-5 py-4 border-b"><h2 className="font-semibold text-lg">Tao phieu nhap</h2><button type="button" onClick={() => setShowCreate(false)} className="text-gray-500 hover:text-gray-800">Dong</button></div><div className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><label className="text-sm font-medium text-gray-700">Nha cung cap<select required value={form.supplierId} onChange={(event) => setForm((current) => ({ ...current, supplierId: event.target.value }))} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md"><option value="">Chon nha cung cap</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label className="text-sm font-medium text-gray-700">Ghi chu<textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md" rows="2" /></label></div>
        <div className="overflow-x-auto border border-gray-200 rounded-md"><table className="min-w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">San pham</th><th className="px-3 py-2 text-right">So luong</th><th className="px-3 py-2 text-right">Gia nhap</th><th className="px-3 py-2 text-right">Thanh tien</th><th className="px-3 py-2" /></tr></thead><tbody>{form.items.map((item, index) => <tr key={index} className="border-t"><td className="px-3 py-2 min-w-64"><select required value={item.productId} onChange={(event) => updateLine(index, "productId", event.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded"><option value="">Chon san pham</option>{products.map((product) => <option key={product.id} value={product.id}>{product.productName}{product.sku ? ` (${product.sku})` : ""}</option>)}</select></td><td className="px-3 py-2"><input required min="1" type="number" value={item.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} className="w-24 text-right px-2 py-1.5 border border-gray-300 rounded" /></td><td className="px-3 py-2"><input required min="0" type="number" value={item.importPrice} onChange={(event) => updateLine(index, "importPrice", event.target.value)} className="w-32 text-right px-2 py-1.5 border border-gray-300 rounded" /></td><td className="px-3 py-2 text-right whitespace-nowrap">{formatMoney(Number(item.quantity || 0) * Number(item.importPrice || 0))}</td><td className="px-3 py-2 text-right"><button type="button" disabled={form.items.length === 1} onClick={() => setForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))} className="text-rose-700 disabled:text-gray-300">Xoa</button></td></tr>)}</tbody></table></div>
        <div className="flex items-center justify-between"><button type="button" onClick={() => setForm((current) => ({ ...current, items: [...current.items, emptyLine()] }))} className="text-indigo-700 font-medium">Them dong hang</button><span className="font-semibold">Tong du kien: {formatMoney(total)}</span></div>
      </div><div className="flex justify-end gap-3 px-5 py-4 border-t"><button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-300 rounded-md">Huy</button><button disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-md disabled:opacity-50">{saving ? "Dang luu..." : "Luu phieu cho xu ly"}</button></div></form></div>}

      {detail && <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4"><div className="w-full max-w-3xl bg-white rounded-md shadow-xl my-6"><div className="flex items-center justify-between px-5 py-4 border-b"><div><h2 className="font-semibold text-lg">{detail.poCode}</h2><p className="text-sm text-gray-500">{detail.supplierName} · {formatDate(detail.createdAt)}</p></div><button onClick={() => setDetail(null)} className="text-gray-500 hover:text-gray-800">Dong</button></div><div className="p-5 space-y-4"><div className="grid grid-cols-2 gap-4 text-sm"><div><span className="text-gray-500">Nguoi lap</span><p>{detail.userName || "-"}</p></div><div><span className="text-gray-500">Trang thai</span><p className="mt-1"><span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${statusStyle[detail.status]}`}>{detail.status}</span></p></div>{detail.note && <div className="col-span-2"><span className="text-gray-500">Ghi chu</span><p>{detail.note}</p></div>}</div><div className="overflow-x-auto border border-gray-200 rounded-md"><table className="min-w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">San pham</th><th className="px-3 py-2 text-right">So luong</th><th className="px-3 py-2 text-right">Gia nhap</th><th className="px-3 py-2 text-right">Thanh tien</th></tr></thead><tbody>{detail.items.map((item) => <tr key={item.productId} className="border-t"><td className="px-3 py-2">{item.productName}<span className="block text-xs text-gray-500">{item.sku || ""}</span></td><td className="px-3 py-2 text-right">{item.quantity}</td><td className="px-3 py-2 text-right">{formatMoney(item.importPrice)}</td><td className="px-3 py-2 text-right">{formatMoney(item.subtotal)}</td></tr>)}</tbody><tfoot className="border-t bg-gray-50"><tr><td colSpan="3" className="px-3 py-3 text-right font-semibold">Tong cong</td><td className="px-3 py-3 text-right font-semibold">{formatMoney(detail.totalAmount)}</td></tr></tfoot></table></div></div><div className="flex justify-end gap-3 px-5 py-4 border-t">{detail.status === "pending" && <><button onClick={() => transition("cancel", detail.id)} className="px-4 py-2 border border-rose-300 text-rose-700 rounded-md">Huy phieu</button><button onClick={() => transition("complete", detail.id)} className="px-4 py-2 bg-emerald-600 text-white rounded-md">Hoan tat nhap kho</button></>}<button onClick={() => setDetail(null)} className="px-4 py-2 border border-gray-300 rounded-md">Dong</button></div></div></div>}
    </div>
  );
}
