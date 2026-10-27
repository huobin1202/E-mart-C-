import { useEffect, useState } from "react";
import { getPermissions, getRoles, updateRole } from "../../api/apiClient";
import PermissionGroups from "../../components/users/PermissionGroups";

export default function RoleManagement() {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [permissionIds, setPermissionIds] = useState([]);
  const [roleActive, setRoleActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    Promise.all([getRoles(), getPermissions()])
      .then(([roleData, permissionData]) => {
        const internalRoles = (roleData ?? []).filter((role) => ["admin", "staff"].includes(role.name?.toLowerCase()));
        setRoles(internalRoles);
        setPermissions(permissionData ?? []);
        if (internalRoles.length) selectRole(internalRoles[0]);
      })
      .catch((error) => setMessage(error.message || "Không thể tải dữ liệu phân quyền."))
      .finally(() => setLoading(false));
  }, []);

  function selectRole(role) {
    setSelectedId(role.id);
    setPermissionIds(role.permissionIds ?? []);
    setRoleActive(role.isActive);
  }

  async function save() {
    const role = roles.find((item) => item.id === selectedId);
    if (!role) return;
    setSaving(true);
    setMessage("");
    try {
      const updated = await updateRole(role.id, {
        name: role.name,
        description: role.description ?? "",
        isActive: roleActive,
        permissionIds,
      });
      setRoles((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      window.dispatchEvent(new Event("permissions-changed"));
      setMessage("Đã cập nhật quyền cho vai trò.");
    } catch (error) {
      setMessage(error.message || "Cập nhật phân quyền thất bại.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-gray-500">Đang tải phân quyền...</p>;
  const selectedRole = roles.find((role) => role.id === selectedId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800">Phân quyền nhân viên</h1>
      </div>
      {message && <div className="rounded-md bg-primary-50 px-4 py-2 text-sm text-primary-700">{message}</div>}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 font-semibold">Vai trò</h2>
          <div className="space-y-2">
            {roles.map((role) => (
              <button
                key={role.id}
                disabled={saving}
                onClick={() => selectRole(role)}
                className={`w-full rounded-md px-3 py-2 text-left ${
                  role.id === selectedId ? "bg-primary-50 text-primary-700" : "hover:bg-gray-50"
                }`}
              >
                <div className="font-medium">{role.name === "admin" ? "Quản trị viên" : role.name === "staff" ? "Nhân viên" : role.name}</div>
                <div className="text-xs text-gray-500">{role.description || "Chưa có mô tả"}</div>
              </button>
            ))}
          </div>
          {!roles.length && <p className="text-sm text-gray-500">Chưa có vai trò nội bộ.</p>}
        </div>
        <div className="rounded-lg border bg-white p-4 md:col-span-2">
          <h2 className="mb-1 font-semibold">Quyền được cấp</h2>
          <p className="mb-4 text-sm text-gray-500">Xem: tra cứu thông tin. Thao tác: tạo, sửa, xóa hoặc xử lý nghiệp vụ trong chức năng đó.</p>
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={roleActive} disabled={saving || !selectedRole || selectedRole.name === "admin"} onChange={(e) => setRoleActive(e.target.checked)} />
            Vai trò đang hoạt động
          </label>
          <PermissionGroups permissions={permissions} selectedIds={permissionIds} onChange={setPermissionIds} isAdmin={selectedRole?.name === "admin"} disabled={saving || !selectedRole} />
          <button
            className="mt-5 rounded-md bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-50"
            disabled={!selectedId || saving}
            onClick={save}
          >
            {saving ? "Đang lưu..." : "Lưu phân quyền"}
          </button>
        </div>
      </div>
    </div>
  );
}
