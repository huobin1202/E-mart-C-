import { useEffect, useState } from "react";
import { createEmployee, deleteEmployee, getEmployees, updateEmployee } from "../../api/apiClient";
import { Edit2, Eye, Trash2, X } from "lucide-react";

const empty = { fullName: "", familyMiddleName: "", givenName: "", baseSalary: 0, phone: "", email: "", dateOfBirth: "", address: "", note: "", isActive: true };

export default function EmployeeManagement() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(null);

  async function load() {
    try { setItems(await getEmployees()); } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);
  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  async function save(e) {
    e.preventDefault();
    try {
      const nameFromParts = `${form.familyMiddleName || ""} ${form.givenName || ""}`.trim();
      const payload = { ...form, fullName: nameFromParts || form.fullName.trim(), baseSalary: Number(form.baseSalary || 0) };
      const saved = editingId ? await updateEmployee(editingId, payload) : await createEmployee(payload);
      setItems((current) => editingId ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
      setEditingId(null); setForm(empty); setError("");
    } catch (err) { setError(err.message); }
  }
  async function remove(id) {
    if (!window.confirm("Xóa hồ sơ nhân viên này?")) return;
    try { await deleteEmployee(id); setItems((current) => current.filter((item) => item.id !== id)); }
    catch (err) { setError(err.message); }
  }
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold">Quản lý nhân viên</h1><p className="text-sm text-gray-500">Quản lý hồ sơ; cấp tài khoản tại mục Quản lý tài khoản.</p></div>
      {error && <div className="rounded bg-red-50 p-3 text-red-700">{error}</div>}
      <form onSubmit={save} className="grid gap-3 rounded-lg border bg-white p-4 md:grid-cols-3">
        {["familyMiddleName", "givenName", "phone", "email", "address", "note"].map((name) => (
          <input key={name} name={name} value={form[name]} onChange={change} required={name === "givenName"} placeholder={{ familyMiddleName: "Họ và tên lót", givenName: "Tên", phone: "Số điện thoại", email: "Email", address: "Địa chỉ", note: "Ghi chú" }[name]} className="rounded border px-3 py-2" />
        ))}
        <input type="number" min="0" step="1000" name="baseSalary" value={form.baseSalary} onChange={change} placeholder="Lương cơ bản" className="rounded border px-3 py-2" />
        <input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={change} className="rounded border px-3 py-2" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          Đang làm việc (bỏ chọn sẽ khóa tài khoản và thu hồi phiên đăng nhập)
        </label>
        <div className="flex gap-2">
          <button className="rounded bg-primary-600 px-4 py-2 text-white hover:bg-primary-700">{editingId ? "Cập nhật" : "Thêm hồ sơ"}</button>
          {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(empty); }} className="rounded border px-4 py-2">Hủy</button>}
        </div>
      </form>
      <div className="overflow-hidden rounded-lg border border-gray-300 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-left"><thead className="border-b border-gray-300 bg-gray-100"><tr><th className="px-6 py-3 text-sm font-semibold text-gray-700">Họ tên</th><th className="px-6 py-3 text-sm font-semibold text-gray-700">Lương cơ bản</th><th className="px-6 py-3 text-sm font-semibold text-gray-700">Số điện thoại</th><th className="px-6 py-3 text-sm font-semibold text-gray-700">Email</th><th className="px-6 py-3 text-sm font-semibold text-gray-700">Ngày sinh</th><th className="px-6 py-3 text-sm font-semibold text-gray-700">Địa chỉ</th><th className="px-6 py-3 text-sm font-semibold text-gray-700">Ghi chú</th><th className="px-6 py-3 text-sm font-semibold text-gray-700">Tài khoản được cấp</th><th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Hành động</th></tr></thead><tbody>
        {items.length === 0 ? <tr><td colSpan="9" className="px-6 py-8 text-center text-gray-500">Không có nhân viên nào</td></tr> : items.map((item) => <tr key={item.id} onClick={() => setViewing(item)} title="Bấm để xem chi tiết" className="cursor-pointer border-b border-gray-200 hover:bg-primary-50/60"><td className="px-6 py-3 font-semibold text-gray-800">{item.fullName}</td><td className="px-6 py-3 text-sm text-gray-600">{Number(item.baseSalary || 0).toLocaleString("vi-VN")} ₫</td><td className="px-6 py-3 text-sm text-gray-600">{item.phone || "—"}</td><td className="px-6 py-3 text-sm text-gray-600">{item.email || "—"}</td><td className="px-6 py-3 text-sm text-gray-600">{item.dateOfBirth ? item.dateOfBirth.slice(0, 10) : "—"}</td><td className="px-6 py-3 text-sm text-gray-600">{item.address || "—"}</td><td className="px-6 py-3 text-sm text-gray-600">{item.note || "—"}</td><td className="px-6 py-3 text-sm text-gray-600">{item.accountUsername || (item.hasAccount ? "Đã cấp" : "Chưa cấp")}</td><td className="px-6 py-3" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-center gap-2"><button onClick={() => setViewing(item)} className="rounded-lg p-2 text-primary-600 transition hover:bg-primary-50" title="Xem chi tiết"><Eye size={18} /></button><button onClick={() => { setEditingId(item.id); setForm({ ...empty, ...item, dateOfBirth: item.dateOfBirth ? item.dateOfBirth.slice(0, 10) : "" }); }} className="rounded-lg p-2 text-emerald-600 transition hover:bg-emerald-50" title="Sửa"><Edit2 size={18} /></button><button onClick={() => remove(item.id)} className="rounded-lg p-2 text-red-600 transition hover:bg-red-50" title="Xóa hồ sơ"><Trash2 size={18} /></button></div></td></tr>)}
      </tbody></table></div></div>
      {viewing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-gray-200 p-6"><h2 className="text-2xl font-bold text-gray-800">Chi tiết nhân viên</h2><button onClick={() => setViewing(null)} className="rounded-lg p-1 transition hover:bg-gray-100"><X size={24} className="text-gray-600" /></button></div><div className="grid grid-cols-1 gap-6 p-6 sm:grid-cols-2"><div><label className="block text-sm font-semibold text-gray-600">Họ và tên lót</label><p className="mt-1 text-lg text-gray-800">{viewing.familyMiddleName || "—"}</p></div><div><label className="block text-sm font-semibold text-gray-600">Tên</label><p className="mt-1 text-lg text-gray-800">{viewing.givenName || "—"}</p></div><div><label className="block text-sm font-semibold text-gray-600">Lương cơ bản</label><p className="mt-1 text-lg text-gray-800">{Number(viewing.baseSalary || 0).toLocaleString("vi-VN")} ₫</p></div><div><label className="block text-sm font-semibold text-gray-600">Email</label><p className="mt-1 text-lg text-gray-800">{viewing.email || "—"}</p></div><div><label className="block text-sm font-semibold text-gray-600">Số điện thoại</label><p className="mt-1 text-lg text-gray-800">{viewing.phone || "—"}</p></div><div><label className="block text-sm font-semibold text-gray-600">Ngày sinh</label><p className="mt-1 text-lg text-gray-800">{viewing.dateOfBirth ? viewing.dateOfBirth.slice(0, 10) : "—"}</p></div><div><label className="block text-sm font-semibold text-gray-600">Tài khoản</label><p className="mt-1 text-lg text-gray-800">{viewing.accountUsername || (viewing.hasAccount ? "Đã cấp" : "Chưa cấp")}</p></div><div><label className="block text-sm font-semibold text-gray-600">Địa chỉ</label><p className="mt-1 text-lg text-gray-800">{viewing.address || "—"}</p></div><div className="sm:col-span-2"><label className="block text-sm font-semibold text-gray-600">Ghi chú</label><p className="mt-1 text-lg text-gray-800">{viewing.note || "—"}</p></div></div></div></div>}
    </div>
  );
}
