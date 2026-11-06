import { useEffect, useMemo, useState } from "react";
import { createSupplier, getAllSuppliers, updateSupplier } from "../../api/supplierApi";
import ModalShell from "../../components/ui/ModalShell";
import PanelCloseButton from "../../components/ui/PanelCloseButton";
import TableDisplayControls from "../../components/ui/TableDisplayControls";
import { useAuth } from "../../hook/useAuth";
import { SUPPLIER_REGIONS, UNCLASSIFIED_REGION, matchesSupplierRegion, supplierRegionLabel } from "../../utils/supplierRegion";

const emptyForm = { name: "", contactName: "", phone: "", email: "", address: "", region: "", isActive: true };
const regionBadge = { "Bắc": "bg-sky-50 text-sky-700", "Trung": "bg-amber-50 text-amber-700", "Nam": "bg-emerald-50 text-emerald-700" };

export default function SupplierList() {
  const { permissions } = useAuth();
  // Write actions follow the account's permissions, not the role name.
  const readOnly = !permissions.includes("suppliers.write");
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterActive, setFilterActive] = useState("all");
  const [filterRegion, setFilterRegion] = useState("all");
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState("view");
  const [form, setForm] = useState(emptyForm);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [compact, setCompact] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getAllSuppliers();
      setSuppliers(data || []);
      setSelected((current) => current ? (data || []).find((item) => item.id === current.id) || null : null);
      setError("");
    } catch (err) { setError(err.message || "Không thể tải danh sách nhà cung cấp."); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi-VN");
    return suppliers.filter((supplier) => {
      const matchesText = !keyword || [supplier.supplierCode, supplier.name, supplier.contactName, supplier.phone, supplier.email, supplier.address].some((value) => value?.toLocaleLowerCase("vi-VN").includes(keyword));
      const matchesStatus = filterActive === "all" || (filterActive === "active" ? supplier.isActive : !supplier.isActive);
      return matchesText && matchesStatus && matchesSupplierRegion(supplier, filterRegion);
    });
  }, [suppliers, search, filterActive, filterRegion]);
  const unclassifiedCount = useMemo(() => suppliers.filter((supplier) => !supplier.region).length, [suppliers]);
  const hasFilters =search.trim() !== "" || filterActive !== "all" || filterRegion !== "all";
  const clearFilters = () => { setSearch(""); setFilterActive("all"); setFilterRegion("all"); setPage(1); };
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const choose = (supplier) => {
    if (mode === "view" && selected?.id === supplier.id) { setSelected(null); return; }
    setSelected(supplier); setMode("view"); setForm({ ...supplier });
  };
  const edit = (supplier) => { setSelected(supplier); setMode("edit"); setForm({ ...emptyForm, ...supplier }); };
  const create = () => { setSelected(null); setMode("create"); setForm(emptyForm); };

  const save = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) { setError("Tên nhà cung cấp không được để trống."); return; }
    if (!form.region) { setError("Vui lòng chọn miền cho nhà cung cấp."); return; }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), contactName: form.contactName?.trim() || null, phone: form.phone?.trim() || null, email: form.email?.trim() || null, address: form.address?.trim() || null, region: form.region || null, isActive: Boolean(form.isActive) };
      const saved = mode === "create" ? await createSupplier(payload) : await updateSupplier(selected.id, payload);
      await load(); setSelected(saved); setForm({ ...emptyForm, ...saved }); setMode("view");
    } catch (err) { setError(err.message || "Không thể lưu nhà cung cấp."); }
    finally { setSaving(false); }
  };
  const field = (label, name, type = "text") => <label className="text-sm text-gray-600">{label}<input type={type} value={form[name] || ""} onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))} className="mt-1 block w-full rounded-lg border px-3 py-2 text-gray-900" /></label>;
  // Details stay in the side panel; create/edit open as a centered modal like "Tạo khuyến mãi mới".
  const showPanel = Boolean(selected && mode === "view");
  const formOpen = mode === "create" || mode === "edit";
  const closeForm = () => { if (saving) return; setMode("view"); setError(""); setForm(selected ? { ...selected } : emptyForm); };

  return <section className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-gray-900">Nhà cung cấp</h1><p className="text-sm text-gray-500">Bấm một dòng để xem chi tiết; chỉnh sửa ngay trên cùng trang.</p></div>{!readOnly && <button type="button" onClick={create} className="rounded-lg bg-primary-600 px-4 py-2 font-medium text-white hover:bg-primary-700">+ Thêm nhà cung cấp</button>}</header>
    {!loading && unclassifiedCount > 0 && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><span>⚠ Có <b>{unclassifiedCount}</b> nhà cung cấp chưa có miền. Sản phẩm của các nhà cung cấp này sẽ không hiện khi khách lọc theo miền.</span>{filterRegion !== UNCLASSIFIED_REGION && <button type="button" onClick={() => { setFilterRegion(UNCLASSIFIED_REGION); setPage(1); }} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium hover:bg-amber-100">Xem danh sách</button>}</div>}
    {error && !formOpen && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    <div className="flex flex-wrap gap-3 rounded-xl border bg-white p-3"><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Mã NCC, tên, liên hệ, địa chỉ" className="min-w-64 flex-1 rounded-lg border px-3 py-2" /><select value={filterActive} onChange={(event) => { setFilterActive(event.target.value); setPage(1); }} className="rounded-lg border px-3 py-2"><option value="all">Tất cả trạng thái</option><option value="active">Hoạt động</option><option value="inactive">Ngừng hoạt động</option></select><select aria-label="Lọc theo miền" value={filterRegion} onChange={(event) => { setFilterRegion(event.target.value); setPage(1); }} className="rounded-lg border px-3 py-2"><option value="all">Tất cả miền</option>{SUPPLIER_REGIONS.map((region) => <option key={region} value={region}>Miền {region}</option>)}<option value={UNCLASSIFIED_REGION}>Chưa phân loại</option></select>{hasFilters && <button type="button" onClick={clearFilters} className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50">Xóa bộ lọc</button>}</div>
    <div className={`grid items-start gap-3 ${showPanel ? "xl:grid-cols-[minmax(0,1.75fr)_minmax(320px,0.8fr)]" : "grid-cols-1"}`}>
    <section className="min-w-0 space-y-3">
    <TableDisplayControls pageSize={pageSize} compact={compact} onCompactChange={setCompact} disabled={loading} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
    <div className="overflow-x-auto rounded-xl border bg-white shadow-sm"><table className="management-table min-w-full w-full text-sm" data-compact={compact}><thead className="bg-gray-50"><tr>{["Mã NCC", "Tên nhà cung cấp", "Miền", "Người liên hệ", "Số điện thoại", "Email", "Địa chỉ", "Trạng thái", "Thao tác"].map((label) => <th key={label} className="px-4 py-3 text-left">{label}</th>)}</tr></thead>
      <tbody>{loading ? <tr><td colSpan="9" className="p-10 text-center text-gray-500">Đang tải...</td></tr> : visible.length === 0 ? <tr><td colSpan="9" className="p-10 text-center text-gray-500">Không có nhà cung cấp phù hợp.</td></tr> : visible.map((supplier) => <tr key={supplier.id} onClick={() => choose(supplier)} className={`cursor-pointer border-t hover:bg-primary-50 ${selected?.id === supplier.id ? "bg-primary-50" : ""}`}>
        <td className="whitespace-nowrap px-4 py-3 font-semibold text-primary-700">{supplier.supplierCode || `NCC-${String(supplier.id).padStart(3, "0")}`}</td><td className="px-4 py-3 font-medium">{supplier.name}</td><td className="whitespace-nowrap px-4 py-3">{supplier.region ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${regionBadge[supplier.region] || "bg-gray-100 text-gray-700"}`}>Miền {supplier.region}</span> : <span className="text-gray-400">Chưa phân loại</span>}</td><td className="whitespace-nowrap px-4 py-3">{supplier.contactName || "—"}</td><td className="whitespace-nowrap px-4 py-3">{supplier.phone || "—"}</td><td className="px-4 py-3">{supplier.email || "—"}</td><td className="max-w-64 truncate px-4 py-3" title={supplier.address}>{supplier.address || "—"}</td><td className="whitespace-nowrap px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${supplier.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-700"}`}>{supplier.isActive ? "Hoạt động" : "Ngừng"}</span></td><td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>{!readOnly ? <button type="button" onClick={() => edit(supplier)} className="rounded border px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-50">Sửa</button> : <span className="text-gray-400">—</span>}</td>
      </tr>)}</tbody></table></div>
    <footer className="flex items-center justify-between text-sm"><span>{filtered.length} nhà cung cấp</span><div className="flex items-center gap-2"><button disabled={safePage <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border bg-white px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40">Trước</button><span>Trang {safePage} / {totalPages}</span><button disabled={safePage >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border bg-white px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40">Sau</button></div></footer>
    </section>

    {showPanel && <article className="management-detail-panel rounded-xl border bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3 border-b pb-3"><h2 className="text-lg font-semibold">Chi tiết nhà cung cấp</h2><PanelCloseButton onClick={() => { setSelected(null); setMode("view"); }} label="Đóng bảng nhà cung cấp" /></div>
      <dl className="grid grid-cols-1 gap-4 pt-4 text-sm sm:grid-cols-3"><div><dt className="text-gray-500">Mã NCC</dt><dd className="font-semibold">{selected.supplierCode}</dd></div><div><dt className="text-gray-500">Tên nhà cung cấp</dt><dd>{selected.name}</dd></div><div><dt className="text-gray-500">Miền</dt><dd>{supplierRegionLabel(selected.region)}</dd></div><div><dt className="text-gray-500">Người liên hệ</dt><dd>{selected.contactName || "—"}</dd></div><div><dt className="text-gray-500">Điện thoại</dt><dd>{selected.phone || "—"}</dd></div><div><dt className="text-gray-500">Email</dt><dd>{selected.email || "—"}</dd></div><div><dt className="text-gray-500">Trạng thái</dt><dd>{selected.isActive ? "Hoạt động" : "Ngừng hoạt động"}</dd></div><div className="sm:col-span-3"><dt className="text-gray-500">Địa chỉ</dt><dd>{selected.address || "—"}</dd></div></dl>
    </article>}
    </div>
    {formOpen && <ModalShell title={mode === "create" ? "Thêm nhà cung cấp" : `Sửa ${selected?.supplierCode || "nhà cung cấp"}`} subtitle={mode === "create" ? "Mã NCC sẽ được hệ thống tạo tự động." : undefined} onClose={saving ? undefined : closeForm} closeOnBackdrop={false} busy={saving} size="lg"
      footer={<><button type="button" onClick={closeForm} disabled={saving} className="rounded-lg border bg-white px-4 py-2 hover:bg-gray-50 disabled:opacity-50">Hủy</button><button type="submit" form="supplier-form" disabled={saving} className="rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white hover:bg-primary-700 disabled:opacity-50">{saving ? "Đang lưu..." : "Lưu"}</button></>}>
      <form id="supplier-form" onSubmit={save} className="space-y-4">{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{field("Tên nhà cung cấp *", "name")}<label className="text-sm text-gray-600">Miền *<select required value={form.region || ""} onChange={(event) => setForm((current) => ({ ...current, region: event.target.value }))} className="mt-1 block w-full rounded-lg border px-3 py-2 text-gray-900"><option value="" disabled>— Chọn miền —</option>{SUPPLIER_REGIONS.map((region) => <option key={region} value={region}>Miền {region}</option>)}</select></label>{field("Người liên hệ", "contactName")}{field("Số điện thoại", "phone", "tel")}{field("Email", "email", "email")}<label className="text-sm text-gray-600 sm:col-span-2">Địa chỉ<textarea rows="3" value={form.address || ""} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} className="mt-1 block w-full rounded-lg border px-3 py-2 text-gray-900" /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.isActive)} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />Đang hoạt động</label></div></form>
    </ModalShell>}
  </section>;
}
