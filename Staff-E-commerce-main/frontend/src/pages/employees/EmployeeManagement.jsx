import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createEmployee, deleteEmployee, getEmployees, updateEmployee } from "../../api/apiClient";
import { Edit2, Eye, Plus, Search, Trash2, X } from "lucide-react";

const empty = {
  fullName: "", familyMiddleName: "", givenName: "", baseSalary: 0,
  phone: "", email: "", dateOfBirth: "", address: "", note: "", isActive: true,
};

const normalizeSearch = (value) => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().trim();

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
      if (event.key === "Escape") { event.preventDefault(); close.current(); return; }
      if (event.key !== "Tab") return;
      const controls = panel.current?.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
      );
      if (!controls?.length) { event.preventDefault(); return; }
      const first = controls[0];
      const last = controls[controls.length - 1];
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
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X size={20} /></button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  );
}

export default function EmployeeManagement() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ ...empty });
  const [editingId, setEditingId] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const keyword = normalizeSearch(search);
  const filteredItems = items.filter((item) =>
    [item.fullName, item.familyMiddleName, item.givenName, item.phone, item.email, item.accountUsername]
      .some((value) => normalizeSearch(value).includes(keyword)));

  useEffect(() => {
    getEmployees().then(setItems).catch((reason) => setError(reason.message)).finally(() => setLoading(false));
  }, []);

  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  function openForm(item = null) {
    setEditingId(item?.id ?? null);
    setForm(item ? {
      ...empty, ...item,
      baseSalary: Number(item.baseSalary || 0),
      dateOfBirth: item.dateOfBirth?.slice(0, 10) ?? "",
    } : { ...empty });
    setFormError("");
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false); setEditingId(null); setForm({ ...empty }); setFormError("");
  }

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setFormError("");
    try {
      const nameFromParts = `${form.familyMiddleName || ""} ${form.givenName || ""}`.trim();
      const payload = { ...form, fullName: nameFromParts || form.fullName.trim(), baseSalary: Number(form.baseSalary || 0) };
      const saved = editingId ? await updateEmployee(editingId, payload) : await createEmployee(payload);
      setItems((current) => editingId
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [saved, ...current]);
      setError(""); setFormOpen(false); setEditingId(null); setForm({ ...empty }); setFormError("");
    } catch (reason) {
      setFormError(reason.message || "Không thể lưu hồ sơ nhân viên.");
    } finally { setSaving(false); }
  }

  async function remove(id) {
    if (!window.confirm("Xóa hồ sơ nhân viên này?")) return;
    try {
      await deleteEmployee(id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (reason) { setError(reason.message); }
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
        <div className="relative"><Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input id="employee-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nhập họ tên, số điện thoại, email hoặc tài khoản…" className="w-full rounded-lg border py-2 pl-10 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100" /></div>
        {!loading && <p role="status" className="mt-2 text-sm text-gray-500">{keyword ? `Tìm thấy ${filteredItems.length} / ${items.length} nhân viên` : `${items.length} nhân viên`}</p>}
      </section>

      <div className="overflow-hidden rounded-lg border border-gray-300 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-left"><thead className="border-b border-gray-300 bg-gray-100"><tr>{["Họ tên", "Lương cơ bản", "Số điện thoại", "Email", "Ngày sinh", "Địa chỉ", "Ghi chú", "Tài khoản được cấp", "Hành động"].map((label) => <th key={label} className="px-6 py-3 text-sm font-semibold text-gray-700">{label}</th>)}</tr></thead><tbody>
        {loading ? <tr><td colSpan="9" className="px-6 py-8 text-center text-gray-500">Đang tải nhân viên…</td></tr> : filteredItems.length === 0 ? <tr><td colSpan="9" className="px-6 py-8 text-center text-gray-500">{keyword ? "Không tìm thấy nhân viên phù hợp." : "Không có nhân viên nào"}</td></tr> : filteredItems.map((item) => <tr key={item.id} onClick={() => setViewing(item)} className="cursor-pointer border-b border-gray-200 hover:bg-primary-50/60"><td className="px-6 py-3 font-semibold text-gray-800">{item.fullName}</td><td className="px-6 py-3 text-sm text-gray-600">{Number(item.baseSalary || 0).toLocaleString("vi-VN")} ₫</td><td className="px-6 py-3 text-sm text-gray-600">{item.phone || "—"}</td><td className="px-6 py-3 text-sm text-gray-600">{item.email || "—"}</td><td className="px-6 py-3 text-sm text-gray-600">{item.dateOfBirth ? item.dateOfBirth.slice(0, 10) : "—"}</td><td className="px-6 py-3 text-sm text-gray-600">{item.address || "—"}</td><td className="px-6 py-3 text-sm text-gray-600">{item.note || "—"}</td><td className="px-6 py-3 text-sm text-gray-600">{item.accountUsername || (item.hasAccount ? "Đã cấp" : "Chưa cấp")}</td><td className="px-6 py-3" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-center gap-2"><button onClick={() => setViewing(item)} className="rounded-lg p-2 text-primary-600 hover:bg-primary-50" title="Xem chi tiết"><Eye size={18} /></button><button onClick={() => openForm(item)} className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50" title="Sửa"><Edit2 size={18} /></button><button onClick={() => remove(item.id)} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Xóa hồ sơ"><Trash2 size={18} /></button></div></td></tr>)}
      </tbody></table></div></div>

      {formOpen && <EmployeeDialog title={editingId ? "Chỉnh sửa nhân viên" : "Thêm nhân viên"} onClose={closeForm}><form onSubmit={save} aria-busy={saving} className="flex min-h-0 flex-col"><fieldset disabled={saving} className="min-h-0 overflow-y-auto px-6 py-5">{formError && <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</div>}<div className="grid gap-4 sm:grid-cols-2">
        <Field name="familyMiddleName" label="Họ và tên lót" form={form} change={change} autofocus />
        <Field name="givenName" label="Tên" form={form} change={change} required />
        <Field name="baseSalary" label="Lương cơ bản" form={form} change={change} type="number" min="0" step="1000" />
        <Field name="phone" label="Số điện thoại" form={form} change={change} type="tel" />
        <Field name="email" label="Email" form={form} change={change} type="email" />
        <Field name="dateOfBirth" label="Ngày sinh" form={form} change={change} type="date" />
        <Field name="address" label="Địa chỉ" form={form} change={change} wide />
        <label className="block text-sm font-medium text-gray-700 sm:col-span-2">Ghi chú<textarea name="note" rows={3} value={form.note} onChange={change} className="mt-1 block w-full rounded-lg border px-3 py-2 font-normal" /></label>
        <label className="flex items-start gap-2 text-sm text-gray-700 sm:col-span-2"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} className="mt-1" /><span>Đang làm việc<span className="mt-1 block text-xs text-gray-500">Bỏ chọn sẽ khóa tài khoản và thu hồi phiên đăng nhập.</span></span></label>
      </div></fieldset><footer className="flex shrink-0 justify-end gap-3 border-t bg-gray-50 px-6 py-4"><button type="button" onClick={closeForm} disabled={saving} className="rounded-lg border bg-white px-4 py-2 text-sm font-medium disabled:opacity-50">Hủy</button><button type="submit" disabled={saving} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Đang lưu…" : editingId ? "Lưu thay đổi" : "Thêm nhân viên"}</button></footer></form></EmployeeDialog>}

      {viewing && <EmployeeDialog title="Chi tiết nhân viên" onClose={() => setViewing(null)}><div className="grid overflow-y-auto p-6 sm:grid-cols-2 gap-6"><Detail label="Họ và tên lót" value={viewing.familyMiddleName} /><Detail label="Tên" value={viewing.givenName} /><Detail label="Lương cơ bản" value={`${Number(viewing.baseSalary || 0).toLocaleString("vi-VN")} ₫`} /><Detail label="Email" value={viewing.email} /><Detail label="Số điện thoại" value={viewing.phone} /><Detail label="Ngày sinh" value={viewing.dateOfBirth?.slice(0, 10)} /><Detail label="Tài khoản" value={viewing.accountUsername || (viewing.hasAccount ? "Đã cấp" : "Chưa cấp")} /><Detail label="Địa chỉ" value={viewing.address} /><div className="sm:col-span-2"><Detail label="Ghi chú" value={viewing.note} /></div></div></EmployeeDialog>}
    </div>
  );
}

function Field({ name, label, form, change, type = "text", required = false, autofocus = false, wide = false, ...inputProps }) {
  return <label className={`block text-sm font-medium text-gray-700 ${wide ? "sm:col-span-2" : ""}`}>{label}{required && <span className="text-red-600"> *</span>}<input data-autofocus={autofocus ? "true" : undefined} name={name} type={type} value={form[name]} onChange={change} required={required} className="mt-1 block w-full rounded-lg border px-3 py-2 font-normal focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100" {...inputProps} /></label>;
}

function Detail({ label, value }) {
  return <div><p className="text-sm font-semibold text-gray-600">{label}</p><p className="mt-1 text-lg text-gray-800">{value || "—"}</p></div>;
}
