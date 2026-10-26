import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createEmployee, deleteEmployee, getEmployees, updateEmployee } from "../../api/apiClient";
import { Edit2, Eye, Plus, Search, Trash2, X } from "lucide-react";

const empty = { fullName: "", phone: "", email: "", dateOfBirth: "", address: "", note: "", isActive: true };
const fieldLabels = { fullName: "Họ tên", phone: "Số điện thoại", email: "Email", address: "Địa chỉ", note: "Ghi chú" };
const normalizeSearch = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().trim();

function EmployeeDialog({ title, onClose, children }) {
  const titleId = useId();
  const panel = useRef(null);
  const close = useRef(onClose);

  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector("[data-autofocus]")?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const controls = panel.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]');
      if (!controls?.length) { event.preventDefault(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.current.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 id={titleId} className="text-xl font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Đóng biểu mẫu nhân viên" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X size={20} /></button>
        </header>
        {children}
      </section>
    </div>, document.body
  );
}

export default function EmployeeManagement() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(null);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const keyword = normalizeSearch(search);
  const filteredItems = items.filter((item) => [item.fullName, item.phone, item.email, item.accountUsername].some((value) => normalizeSearch(value).includes(keyword)));

  async function load() {
    try { setItems(await getEmployees()); } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  const change = (e) => setForm((current) => ({ ...current, [e.target.name]: e.target.value }));
  function openForm(item = null) {
    setEditingId(item?.id ?? null);
    setForm(item ? {
      fullName: item.fullName ?? "", phone: item.phone ?? "", email: item.email ?? "",
      dateOfBirth: item.dateOfBirth?.slice(0, 10) ?? "", address: item.address ?? "", note: item.note ?? "", isActive: item.isActive,
    } : { ...empty });
    setFormError("");
    setFormOpen(true);
  }
  function closeForm() {
    if (saving) return;
    setFormOpen(false); setEditingId(null); setForm({ ...empty }); setFormError("");
  }
  async function save(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true); setFormError("");
    try {
      const saved = editingId ? await updateEmployee(editingId, form) : await createEmployee(form);
      setItems((current) => editingId ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
      setFormOpen(false); setEditingId(null); setForm({ ...empty }); setError("");
    } catch (err) { setFormError(err.message || "Không thể lưu hồ sơ nhân viên."); }
    finally { setSaving(false); }
  }
  async function remove(id) {
    if (!window.confirm("Xóa hồ sơ nhân viên này?")) return;
    try { await deleteEmployee(id); setItems((current) => current.filter((item) => item.id !== id)); }
    catch (err) { setError(err.message); }
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Quản lý nhân viên</h1><p className="text-sm text-gray-500">Quản lý hồ sơ; cấp tài khoản tại mục Quản lý tài khoản.</p></div>
        <button type="button" onClick={() => openForm()} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"><Plus size={18} />Thêm nhân viên</button>
      </div>
      {error && <div role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</div>}
      <section className="rounded-lg border bg-white p-4">
        <label htmlFor="employee-search" className="mb-2 block text-sm font-medium text-gray-700">Tìm kiếm nhân viên</label>
        <div className="relative">
          <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input id="employee-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nhập họ tên, số điện thoại, email hoặc tài khoản…" className="w-full rounded-lg border py-2 pl-10 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100" />
        </div>
        {!loading && <p role="status" className="mt-2 text-sm text-gray-500">{keyword ? `Tìm thấy ${filteredItems.length} / ${items.length} nhân viên` : `${items.length} nhân viên`}</p>}
      </section>
      <div className="overflow-hidden rounded-lg border border-gray-300 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-left"><thead className="border-b border-gray-300 bg-gray-100"><tr><th className="px-6 py-3 text-sm font-semibold text-gray-700">Họ tên</th><th className="px-6 py-3 text-sm font-semibold text-gray-700">Số điện thoại</th><th className="px-6 py-3 text-sm font-semibold text-gray-700">Email</th><th className="px-6 py-3 text-sm font-semibold text-gray-700">Ngày sinh</th><th className="px-6 py-3 text-sm font-semibold text-gray-700">Địa chỉ</th><th className="px-6 py-3 text-sm font-semibold text-gray-700">Ghi chú</th><th className="px-6 py-3 text-sm font-semibold text-gray-700">Tài khoản được cấp</th><th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Hành động</th></tr></thead><tbody>
        {loading ? <tr><td colSpan="8" className="px-6 py-8 text-center text-gray-500">Đang tải nhân viên…</td></tr> : filteredItems.length === 0 ? <tr><td colSpan="8" className="px-6 py-8 text-center text-gray-500">{keyword ? "Không tìm thấy nhân viên phù hợp." : "Không có nhân viên nào"}</td></tr> : filteredItems.map((item) => <tr key={item.id} className="border-b border-gray-200 hover:bg-gray-50"><td className="px-6 py-3 font-semibold text-gray-800">{item.fullName}</td><td className="px-6 py-3 text-sm text-gray-600">{item.phone || "—"}</td><td className="px-6 py-3 text-sm text-gray-600">{item.email || "—"}</td><td className="px-6 py-3 text-sm text-gray-600">{item.dateOfBirth ? item.dateOfBirth.slice(0, 10) : "—"}</td><td className="px-6 py-3 text-sm text-gray-600">{item.address || "—"}</td><td className="px-6 py-3 text-sm text-gray-600">{item.note || "—"}</td><td className="px-6 py-3 text-sm text-gray-600">{item.accountUsername || (item.hasAccount ? "Đã cấp" : "Chưa cấp")}</td><td className="px-6 py-3"><div className="flex items-center justify-center gap-2"><button onClick={() => setViewing(item)} className="rounded-lg p-2 text-primary-600 transition hover:bg-primary-50" title="Xem chi tiết"><Eye size={18} /></button><button onClick={() => openForm(item)} className="rounded-lg p-2 text-emerald-600 transition hover:bg-emerald-50" title="Sửa"><Edit2 size={18} /></button><button onClick={() => remove(item.id)} className="rounded-lg p-2 text-red-600 transition hover:bg-red-50" title="Xóa hồ sơ"><Trash2 size={18} /></button></div></td></tr>)}
      </tbody></table></div></div>
      {formOpen && <EmployeeDialog title={editingId ? "Chỉnh sửa nhân viên" : "Thêm nhân viên"} onClose={closeForm}>
        <form onSubmit={save} aria-busy={saving} className="flex min-h-0 flex-col">
          <fieldset disabled={saving} className="min-h-0 overflow-y-auto px-6 py-5">
            {formError && <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</div>}
            <div className="grid gap-4 sm:grid-cols-2">
              {["fullName", "phone", "email"].map((name) => <label key={name} className="block text-sm font-medium text-gray-700">
                {fieldLabels[name]}{name === "fullName" && <span className="text-red-600"> *</span>}
                <input data-autofocus={name === "fullName" ? "true" : undefined} name={name} type={name === "email" ? "email" : name === "phone" ? "tel" : "text"} value={form[name]} onChange={change} required={name === "fullName"} minLength={name === "fullName" ? 2 : undefined} maxLength={name === "phone" ? 50 : 255} className="mt-1 block w-full rounded-lg border px-3 py-2 font-normal focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100" />
              </label>)}
              <label className="block text-sm font-medium text-gray-700">Ngày sinh<input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={change} className="mt-1 block w-full rounded-lg border px-3 py-2 font-normal focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100" /></label>
              <label className="block text-sm font-medium text-gray-700 sm:col-span-2">Địa chỉ<input name="address" value={form.address} onChange={change} className="mt-1 block w-full rounded-lg border px-3 py-2 font-normal focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100" /></label>
              <label className="block text-sm font-medium text-gray-700 sm:col-span-2">Ghi chú<textarea name="note" rows={3} value={form.note} onChange={change} className="mt-1 block w-full rounded-lg border px-3 py-2 font-normal focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100" /></label>
              <label className="flex items-start gap-2 text-sm text-gray-700 sm:col-span-2">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((current) => ({ ...current, isActive: e.target.checked }))} className="mt-1" />
                <span>Đang làm việc<span className="mt-1 block text-xs text-gray-500">Bỏ chọn sẽ khóa tài khoản và thu hồi phiên đăng nhập.</span></span>
              </label>
            </div>
          </fieldset>
          <footer className="flex shrink-0 justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
            <button type="button" onClick={closeForm} disabled={saving} className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-100 disabled:opacity-50">Hủy</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">{saving ? "Đang lưu…" : editingId ? "Lưu thay đổi" : "Thêm nhân viên"}</button>
          </footer>
        </form>
      </EmployeeDialog>}
      {viewing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-gray-200 p-6"><h2 className="text-2xl font-bold text-gray-800">Chi tiết nhân viên</h2><button onClick={() => setViewing(null)} className="rounded-lg p-1 transition hover:bg-gray-100"><X size={24} className="text-gray-600" /></button></div><div className="grid grid-cols-1 gap-6 p-6 sm:grid-cols-2"><div><label className="block text-sm font-semibold text-gray-600">Họ tên</label><p className="mt-1 text-lg text-gray-800">{viewing.fullName}</p></div><div><label className="block text-sm font-semibold text-gray-600">Email</label><p className="mt-1 text-lg text-gray-800">{viewing.email || "—"}</p></div><div><label className="block text-sm font-semibold text-gray-600">Số điện thoại</label><p className="mt-1 text-lg text-gray-800">{viewing.phone || "—"}</p></div><div><label className="block text-sm font-semibold text-gray-600">Ngày sinh</label><p className="mt-1 text-lg text-gray-800">{viewing.dateOfBirth ? viewing.dateOfBirth.slice(0, 10) : "—"}</p></div><div><label className="block text-sm font-semibold text-gray-600">Tài khoản</label><p className="mt-1 text-lg text-gray-800">{viewing.accountUsername || (viewing.hasAccount ? "Đã cấp" : "Chưa cấp")}</p></div><div><label className="block text-sm font-semibold text-gray-600">Địa chỉ</label><p className="mt-1 text-lg text-gray-800">{viewing.address || "—"}</p></div><div className="sm:col-span-2"><label className="block text-sm font-semibold text-gray-600">Ghi chú</label><p className="mt-1 text-lg text-gray-800">{viewing.note || "—"}</p></div></div></div></div>}
    </div>
  );
}
