import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  getUsersPaginated,
  getUserById,
  updateUser,
  createUser,
  getRoles,
  getEmployees,
  deleteUser,
  updateUserStatus,
} from "../../api/apiClient";
import Pagination from "../../components/ui/Pagination";
import { Eye, Edit2, Lock, Unlock, Trash2 } from "lucide-react";
import { getCustomers } from "../../api/customerApi";
import { Link } from "react-router-dom";

const emptyForm = {
  username: "",
  email: "",
  fullName: "",
  role: "staff",
  isActive: true,
  password: "",
  employeeId: "",
  customerId: "",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isAccountActive = (user) => user.isActive && !user.isLocked;

const roleBadgeClass = (role) =>
  role?.toLowerCase() === "admin"
    ? "bg-red-50 text-red-700"
    : role?.toLowerCase() === "customer"
      ? "bg-amber-50 text-amber-700"
      : "bg-sky-50 text-sky-700";

const roleLabel = (role) =>
  ({ admin: "Admin", staff: "Nhân viên", customer: "Khách hàng" }[
    role?.toLowerCase()
  ] ?? role);

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 relative">
        <button
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
          onClick={onClose}
        >
          ✕
        </button>
        <h2 className="text-lg font-semibold mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [filterRoles, setFilterRoles] = useState([]);
  const [roleFilter, setRoleFilter] = useState("");
  const [accountGroup, setAccountGroup] = useState("internal");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const latestRequest = useRef(0);
  const [employees, setEmployees] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [alert, setAlert] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);

  const [detailUser, setDetailUser] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editUserId, setEditUserId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const keyword = searchInput.trim();
    if (keyword === search) return;
    const timer = window.setTimeout(() => {
      setSearch(keyword);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, search]);

  useEffect(() => {
    fetchRoles();
    fetchEmployees();
    fetchCustomers();
  }, []);

  async function fetchEmployees() {
    try { setEmployees(await getEmployees()); } catch (err) { setError(err.message || "Không thể tải hồ sơ nhân viên."); }
  }

  async function fetchCustomers() {
    try {
      const result = await getCustomers(1, 500, "", "all");
      setCustomers(result.items ?? []);
    } catch (err) { setError(err.message || "Không thể tải hồ sơ khách hàng."); }
  }

  async function fetchRoles() {
    try {
      const result = await getRoles();
      setFilterRoles((result ?? []).filter((role) => ["admin", "staff"].includes(role.name?.toLowerCase())));
      setRoles((result ?? []).filter((role) => role.isActive && ["admin", "staff"].includes(role.name?.toLowerCase())));
    } catch (err) {
      setError(err.message || "Không thể tải danh sách vai trò.");
    }
  }

  const fetchUsers = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError("");
    try {
      let result;
      if (accountGroup === "internal" && !roleFilter) {
        // Query the two supported roles separately so this also works with an
        // API instance that has not yet been restarted with the internal-group filter.
        const [admins, staff] = await Promise.all([
          getUsersPaginated(1, 100, { role: "admin", status: statusFilter, search }),
          getUsersPaginated(1, 100, { role: "staff", status: statusFilter, search }),
        ]);
        const allItems = [...(admins.items ?? []), ...(staff.items ?? [])].sort((a, b) => a.id - b.id);
        const totalPages = Math.max(1, Math.ceil(allItems.length / pageSize));
        const currentPage = Math.min(page, totalPages);
        result = {
          items: allItems.slice((currentPage - 1) * pageSize, currentPage * pageSize),
          currentPage,
          totalPages,
          totalItems: allItems.length,
          pageSize,
        };
      } else {
        const selectedRole = roleFilter || "customer";
        result = await getUsersPaginated(page, pageSize, { role: selectedRole, status: statusFilter, search });
      }
      if (requestId !== latestRequest.current) return;
      if (result.currentPage && result.currentPage !== page) setPage(result.currentPage);
      setUsers(result.items ?? []);
      setMeta({
        currentPage: result.currentPage ?? page,
        totalPages:
          result.totalPages && result.totalPages > 0 ? result.totalPages : 1,
        totalItems: result.totalItems ?? 0,
        pageSize: result.pageSize ?? pageSize,
      });
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      setUsers([]);
      setMeta(null);
      setError(err.message || "Không thể tải danh sách người dùng.");
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [page, pageSize, roleFilter, statusFilter, search, accountGroup]);

  useEffect(() => {
    const requests = latestRequest;
    fetchUsers();
    return () => { requests.current++; };
  }, [fetchUsers]);

  function openEditModal(user) {
    setEditUserId(user.id);
    setFormData({
      username: user.username ?? "",
      email: user.email ?? "",
      fullName: user.fullName ?? "",
      role: user.role ?? "staff",
      employeeId: user.employeeId ?? "",
      customerId: user.customerId ?? "",
      isActive: isAccountActive(user),
      password: "",
    });
    setFieldErrors({});
  }

  function closeEditModal() {
    setEditUserId(null);
    setFormData(emptyForm);
    setSaving(false);
    setFieldErrors({});
    setShowEditPassword(false);
  }

  function openCreateModal() {
    setFormData({ ...emptyForm, role: accountGroup === "customers" ? "customer" : "staff" });
    setCreateModalOpen(true);
    setAlert(null);
    setFieldErrors({});
    setShowCreatePassword(false);
  }

  function closeCreateModal() {
    setCreateModalOpen(false);
    setFormData(emptyForm);
    setSaving(false);
    setFieldErrors({});
    setShowCreatePassword(false);
  }

  async function handleCreateSubmit(e) {
    e.preventDefault();
    setFieldErrors({});

    const trimmedUsername = formData.username.trim();
    const trimmedPassword = formData.password.trim();

    if (trimmedUsername.length < 3) {
      setFieldErrors({ username: "Username phải có ít nhất 3 kí tự!" });
      return;
    }

    if (trimmedPassword.length < 6) {
      setFieldErrors({ password: "Mật khẩu phải có ít nhất 6 kí tự!" });
      return;
    }

    if ((formData.role !== "admin" && formData.role !== "customer") && !formData.employeeId) {
      setFieldErrors({ employeeId: "Vui lòng chọn hồ sơ nhân viên." });
      return;
    }
    if (formData.role === "customer" && !formData.customerId) {
      setFieldErrors({ customerId: "Vui lòng chọn hồ sơ khách hàng." });
      return;
    }

    setSaving(true);
    setAlert(null);
    try {
      const payload = {
        username: trimmedUsername,
        password: trimmedPassword,
        role: formData.role,
        isActive: formData.isActive,
      };
      if (formData.role !== "customer" && formData.employeeId) {
        payload.employeeId = Number(formData.employeeId);
      } else if (formData.role === "customer") {
        payload.customerId = Number(formData.customerId);
      }
      const created = await createUser(payload);
      setAlert({
        type: "success",
        message: `Đã thêm tài khoản ${created.username} với vai trò ${roleLabel(created.role)}.`,
      });
      closeCreateModal();
      fetchEmployees();
      fetchCustomers();
      if (page !== 1) {
        setPage(1);
      } else {
        fetchUsers();
      }
    } catch (err) {
      const msg = err.message || "Thêm tài khoản thất bại.";
      if (msg.toLowerCase().includes("username")) {
        setFieldErrors({ username: msg });
      } else if (msg.toLowerCase().includes("email")) {
        setFieldErrors({ email: msg });
      } else {
        setAlert({
          type: "error",
          message: msg,
        });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!editUserId) return;
    setFieldErrors({});

    const trimmedUsername = formData.username.trim();
    const trimmedEmail = formData.email.trim();

    if (trimmedUsername.length < 3) {
      setFieldErrors({ username: "Username phải có ít nhất 3 ký tự." });
      return;
    }

    if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
      setFieldErrors({ email: "Email không hợp lệ." });
      return;
    }

    const confirmed = window.confirm(
      `Bạn có chắc chắn muốn cập nhật người dùng ${trimmedUsername}?`
    );
    if (!confirmed) return;

    setSaving(true);
    setAlert(null);
    try {
      const payload = {
        username: trimmedUsername,
        role: formData.role,
        isActive: formData.isActive,
      };
      if (formData.role !== "customer" && formData.employeeId) payload.employeeId = Number(formData.employeeId);
      else if (formData.role === "customer") payload.customerId = Number(formData.customerId);
      if (!payload.password) {
        payload.password = undefined;
      }
      if (formData.password) payload.password = formData.password;
      const updated = await updateUser(editUserId, payload);
      setAlert({
        type: "success",
        message: `Đã cập nhật ${updated.username}.`,
      });
      closeEditModal();
      fetchUsers();
      fetchEmployees();
      fetchCustomers();
    } catch (err) {
      const msg = err.message || "Cập nhật người dùng thất bại.";
      if (msg.toLowerCase().includes("username")) {
        setFieldErrors({ username: msg });
      } else if (msg.toLowerCase().includes("email")) {
        setFieldErrors({ email: msg });
      } else {
        setAlert({
          type: "error",
          message: msg,
        });
      }
    } finally {
      setSaving(false);
    }
  }
  async function handleViewDetail(user) {
    setDetailUser(user);
    setDetailLoading(true);
    setAlert(null);
    try {
      const detail = await getUserById(user.id);
      setDetailUser(detail);
    } catch (err) {
      setAlert({
        type: "error",
        message: err.message || "Không thể tải chi tiết người dùng.",
      });
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetailModal() {
    setDetailUser(null);
    setDetailLoading(false);
  }

  async function handleStatusToggle(user) {
    try {
      const updated = await updateUserStatus(user.id, !isAccountActive(user));
      setUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
      fetchUsers();
    } catch (err) {
      setAlert({ type: "error", message: err.message || "Không thể cập nhật trạng thái tài khoản." });
    }
  }

  async function handleDelete(user) {
    if (!window.confirm(`Xóa tài khoản ${user.username}? Chỉ tài khoản chưa đăng nhập và chưa có hoạt động hoặc dữ liệu nghiệp vụ mới được xóa. Hồ sơ nhân viên/khách hàng vẫn được giữ lại.`)) return;
    try {
      await deleteUser(user.id);
      setAlert({ type: "success", message: `Đã xóa tài khoản ${user.username}.` });
      fetchUsers();
    } catch (err) {
      setAlert({ type: "error", message: err.message || "Không thể xóa tài khoản." });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">
            Quản lý tài khoản
          </h1>
          <p className="text-sm text-gray-500">
            CRUD tài khoản, active/inactive và phân role admin, nhân viên, khách hàng.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
        <button
          className="px-4 py-2 rounded-md bg-primary-600 text-white shadow-sm hover:bg-primary-700"
          onClick={openCreateModal}
        >
          + Thêm tài khoản
        </button>
        <Link
          to="/roles"
          className="rounded-md border border-primary-600 px-4 py-2 text-primary-600 hover:bg-primary-50"
        >
          Phân quyền role
        </Link>
        </div>
      </div>

      {alert && (
        <div
          className={`rounded-md px-4 py-2 text-sm ${
            alert.type === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {alert.message}
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-4 flex gap-2 border-b pb-3">
          <button type="button" onClick={() => { setAccountGroup("internal"); setRoleFilter(""); setPage(1); }} className={`rounded-md px-4 py-2 text-sm ${accountGroup === "internal" ? "bg-primary-600 text-white" : "border text-gray-600"}`}>Nhân viên &amp; Admin</button>
          <button type="button" onClick={() => { setAccountGroup("customers"); setRoleFilter(""); setPage(1); }} className={`rounded-md px-4 py-2 text-sm ${accountGroup === "customers" ? "bg-primary-600 text-white" : "border text-gray-600"}`}>Khách hàng</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium text-gray-700">
            Tìm tài khoản
            <input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Tên đăng nhập, họ tên, email" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Vai trò
            <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-normal">
              <option value="">Tất cả vai trò</option>
              {(accountGroup === "customers" ? [{ id: "customer", name: "customer", isActive: true }] : filterRoles).map((role) => <option key={role.id} value={role.name}>{roleLabel(role.name)}{!role.isActive ? " (ngừng hoạt động)" : ""}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Trạng thái tài khoản
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-normal">
              <option value="">Tất cả trạng thái</option>
              <option value="active">Đang hoạt động</option>
              <option value="inactive">Đã khóa</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="button" onClick={() => { setRoleFilter(""); setStatusFilter(""); setSearchInput(""); setSearch(""); setPage(1); }} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Xóa bộ lọc</button>
          </div>
        </div>
        {meta && !loading && <p className="mt-3 text-sm text-gray-500">Tìm thấy {meta.totalItems} tài khoản</p>}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Hồ sơ liên kết</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3 text-right">Hành động</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  Đang tải...
                </td>
              </tr>
            )}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  {roleFilter || statusFilter || search ? "Không có tài khoản phù hợp với bộ lọc." : "Chưa có người dùng nào."}
                </td>
              </tr>
            )}
            {!loading &&
              users.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => handleViewDetail(user)}
                  title="Bấm để xem chi tiết"
                  className="cursor-pointer hover:bg-primary-50/60 transition-colors"
                >
                  <td className="px-4 py-3">{user.email || "—"}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {user.username}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${roleBadgeClass(
                        user.role
                      )}`}
                    >
                      {roleLabel(user.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {user.employeeName || user.customerName || "Tài khoản quản trị"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                        isAccountActive(user)
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {isAccountActive(user) ? "Đang hoạt động" : "Đã khóa"}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition"
                        onClick={() => handleViewDetail(user)}
                        title="Xem chi tiết"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                        onClick={() => openEditModal(user)}
                        title="Sửa thông tin"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        className={`p-2 rounded-lg transition ${
                          isAccountActive(user)
                            ? "text-amber-600 hover:bg-amber-50"
                            : "text-emerald-600 hover:bg-emerald-50"
                        }`}
                        onClick={() => handleStatusToggle(user)}
                        title={isAccountActive(user) ? "Khóa tài khoản" : "Mở khóa tài khoản"}
                      >
                        {isAccountActive(user) ? <Lock size={16} /> : <Unlock size={16} />}
                      </button>
                      <button
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                        onClick={() => handleDelete(user)}
                        title="Xóa tài khoản chưa có hoạt động"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {meta && users.length > 0 && (
        <Pagination meta={meta} onPageChange={(p) => setPage(p)} />
      )}

      {detailUser && (
        <Modal title="Thông tin người dùng" onClose={closeDetailModal}>
          {detailLoading ? (
            <p className="text-sm text-gray-500">Đang tải...</p>
          ) : (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Username</dt>
                <dd className="font-semibold text-gray-800">
                  {detailUser.username}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Email</dt>
                <dd className="font-semibold text-gray-800">
                  {detailUser.email || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Họ tên</dt>
                <dd className="font-semibold text-gray-800">
                  {detailUser.fullName || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Vai trò</dt>
                <dd className="font-semibold text-gray-800">
                  {roleLabel(detailUser.role)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Trạng thái</dt>
                <dd className="font-semibold text-gray-800">
                  {isAccountActive(detailUser) ? "Đang hoạt động" : "Đã khóa"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Cập nhật lần cuối</dt>
                <dd className="font-semibold text-gray-800">
                  {detailUser.updatedAt
                    ? new Date(detailUser.updatedAt).toLocaleString()
                    : "—"}
                </dd>
              </div>
            </dl>
          )}
        </Modal>
      )}

      {createModalOpen && (
        <Modal title="Thêm tài khoản" onClose={closeCreateModal}>
          <form className="space-y-4" onSubmit={handleCreateSubmit}>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Username
              </label>
              <input
                type="text"
                className="mt-1 w-full rounded-md border px-3 py-2"
                value={formData.username}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, username: e.target.value }))
                }
                required
                minLength={3}
                aria-invalid={Boolean(fieldErrors.username)}
              />
              {fieldErrors.username && (
                <p className="text-sm text-red-600 mt-1">
                  {fieldErrors.username}
                </p>
              )}
            </div>
            <p className="rounded-md bg-gray-50 p-3 text-sm text-gray-600">
              Họ tên và email sẽ được lấy tự động từ hồ sơ đã chọn.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Vai tro
                </label>
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={formData.role}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      role: e.target.value,
                      employeeId: e.target.value === "customer" ? "" : prev.employeeId,
                      customerId: e.target.value === "customer" ? prev.customerId : "",
                    }))
                  }
                >
                  {(accountGroup === "customers" ? [{ name: "customer" }] : roles).map((role) => (
                    <option key={role.id ?? role.name} value={role.name}>
                      {role.name}
                    </option>
                  ))}
                </select>
                {formData.role !== "customer" && (
                  <select
                    className="mt-2 w-full rounded-md border px-3 py-2"
                    value={formData.employeeId}
                    onChange={(e) => setFormData((prev) => ({ ...prev, employeeId: e.target.value }))}
                    required={formData.role !== "admin"}
                  >
                    <option value="">Chọn hồ sơ nhân viên để cấp tài khoản</option>
                    {employees.filter((item) => !item.hasAccount || String(item.id) === String(formData.employeeId)).map((item) => (
                      <option key={item.id} value={item.id}>{item.fullName}</option>
                    ))}
                  </select>
                )}
                {formData.role === "customer" && (
                  <select
                    className="mt-2 w-full rounded-md border px-3 py-2"
                    value={formData.customerId}
                    onChange={(e) => setFormData((prev) => ({ ...prev, customerId: e.target.value }))}
                    required
                  >
                    <option value="">Chọn hồ sơ khách hàng để cấp tài khoản</option>
                    {customers.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Trang thai
                </label>
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={formData.isActive ? "true" : "false"}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      isActive: e.target.value === "true",
                    }))
                  }
                >
                  <option value="true">Dang hoat dong</option>
                  <option value="false">Khoa</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Mat khau</label>
              <div className="relative">
                <input
                  type={showCreatePassword ? "text" : "password"}
                  className="mt-1 w-full rounded-md border px-3 py-2 pr-10"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, password: e.target.value }))
                  }
                  minLength={6}
                  required
                  aria-invalid={Boolean(fieldErrors.password)}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-gray-700"
                  onClick={() => setShowCreatePassword((s) => !s)}
                  aria-label={showCreatePassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showCreatePassword ? "🙈" : "👁️"}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="text-sm text-red-600 mt-1">
                  {fieldErrors.password}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="px-4 py-2 rounded-md border"
                onClick={closeCreateModal}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-md bg-primary-600 text-white disabled:opacity-50 hover:bg-primary-700"
                disabled={saving}
              >
                {saving ? "Đang lưu..." : "Thêm mới"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editUserId && (
        <Modal title="Cập nhật người dùng" onClose={closeEditModal}>
          <form className="space-y-4" onSubmit={handleEditSubmit}>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Username
              </label>
              <input
                type="text"
                className="mt-1 w-full rounded-md border px-3 py-2 bg-gray-100 cursor-not-allowed"
                value={formData.username}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, username: e.target.value }))
                }
                required
                aria-invalid={Boolean(fieldErrors.username)}
                readOnly
              />
              {fieldErrors.username && (
                <p className="text-sm text-red-600 mt-1">
                  {fieldErrors.username}
                </p>
              )}
            </div>
            <p className="rounded-md bg-gray-50 p-3 text-sm text-gray-600">
              Họ tên và email được lấy tự động từ hồ sơ nhân viên hoặc khách hàng
              đã liên kết.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Vai trò
                </label>
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={formData.role}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      role: e.target.value,
                      employeeId: e.target.value === "customer" ? "" : prev.employeeId,
                      customerId: e.target.value === "customer" ? prev.customerId : "",
                    }))
                  }
                >
                  {(accountGroup === "customers" ? [{ name: "customer" }] : roles).map((role) => (
                    <option key={role.id ?? role.name} value={role.name}>
                      {role.name}
                    </option>
                  ))}
                </select>
                {formData.role !== "customer" && (
                  <select className="mt-2 w-full rounded-md border px-3 py-2" value={formData.employeeId} onChange={(e) => setFormData((prev) => ({ ...prev, employeeId: e.target.value }))} required={formData.role !== "admin"}>
                    <option value="">Chọn hồ sơ nhân viên</option>
                    {employees.filter((item) => !item.hasAccount || String(item.id) === String(formData.employeeId)).map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}
                  </select>
                )}
                {formData.role === "customer" && (
                  <select className="mt-2 w-full rounded-md border px-3 py-2" value={formData.customerId} onChange={(e) => setFormData((prev) => ({ ...prev, customerId: e.target.value }))} required>
                    <option value="">Chọn hồ sơ khách hàng</option>
                    {customers.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Trạng thái
                </label>
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={formData.isActive ? "true" : "false"}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      isActive: e.target.value === "true",
                    }))
                  }
                >
                  <option value="true">Đang hoạt động</option>
                  <option value="false">Khoá</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Đặt lại mật khẩu (tùy chọn)
              </label>
              <div className="relative">
                <input
                  type={showEditPassword ? "text" : "password"}
                  className="mt-1 w-full rounded-md border px-3 py-2 pr-10"
                  value={formData.password}
                  placeholder="Để trống nếu không đổi"
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, password: e.target.value }))
                  }
                  minLength={6}
                  aria-invalid={Boolean(fieldErrors.password)}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-gray-700"
                  onClick={() => setShowEditPassword((s) => !s)}
                  aria-label={showEditPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showEditPassword ? "🙈" : "👁️"}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="text-sm text-red-600 mt-1">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="px-4 py-2 rounded-md border"
                onClick={closeEditModal}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-md bg-primary-600 text-white disabled:opacity-50 hover:bg-primary-700"
                disabled={saving}
              >
                {saving ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
