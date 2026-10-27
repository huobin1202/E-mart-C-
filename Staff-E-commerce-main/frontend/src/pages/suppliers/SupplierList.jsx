// Updated SupplierList.jsx with role-based access control
import React, { useState, useEffect } from "react";
import {
  getAllSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from "../../api/supplierApi";
import SupplierModal from "../../components/suppliers/SupplierModel";
import { useAuth } from "../../hook/useAuth";

export default function SupplierList() {
  // Get current user and role
  const { user } = useAuth();
  const isStaff = user?.role?.toLowerCase() === "staff";

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filterActive, setFilterActive] = useState("all");

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("view");
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const data = await getAllSuppliers();
      setSuppliers(data);
      setError(null);
    } catch (err) {
      setError(err.message || "Không thể tải danh sách nhà cung cấp");
    } finally {
      setLoading(false);
    }
  };

  // Filtered suppliers
  const filteredSuppliers = suppliers.filter((s) => {
    const matchSearch =
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.phone?.includes(search) ||
      s.email?.toLowerCase().includes(search.toLowerCase()) ||
      s.address?.toLowerCase().includes(search.toLowerCase());

    const matchFilter =
      filterActive === "all" ||
      (filterActive === "active" && s.isActive) ||
      (filterActive === "inactive" && !s.isActive);

    return matchSearch && matchFilter;
  });

  // Handlers
  const handleCreate = () => {
    if (isStaff) {
      alert("Bạn không có quyền thêm mới nhà cung cấp");
      return;
    }
    setSelectedSupplier(null);
    setModalMode("create");
    setShowModal(true);
  };

  const handleView = (supplier) => {
    setSelectedSupplier(supplier);
    setModalMode("view");
    setShowModal(true);
  };

  const handleEdit = (supplier) => {
    if (isStaff) {
      alert("Bạn không có quyền chỉnh sửa");
      return;
    }
    setSelectedSupplier(supplier);
    setModalMode("edit");
    setShowModal(true);
  };

  const handleSave = async (formData) => {
    if (isStaff) {
      alert("Bạn không có quyền thực hiện thao tác này");
      return;
    }

    try {
      setSaving(true);
      if (modalMode === "create") {
        await createSupplier(formData);
      } else if (modalMode === "edit" && selectedSupplier) {
        await updateSupplier(selectedSupplier.id, formData);
      }
      await fetchSuppliers();
      setShowModal(false);
    } catch (err) {
      alert(err.message || "Không thể lưu nhà cung cấp");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isStaff) {
      alert("Bạn không có quyền xóa nhà cung cấp");
      return;
    }

    if (!selectedSupplier) return;
    if (
      !confirm(`Bạn có chắc muốn xóa nhà cung cấp "${selectedSupplier.name}"?`)
    )
      return;

    try {
      setSaving(true);
      await deleteSupplier(selectedSupplier.id);
      await fetchSuppliers();
      setShowModal(false);
    } catch (err) {
      alert(err.message || "Không thể xóa nhà cung cấp");
    } finally {
      setSaving(false);
    }
  };

  const stats = {
    total: suppliers.length,
    active: suppliers.filter((s) => s.isActive).length,
    inactive: suppliers.filter((s) => !s.isActive).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Đang tải...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          ❌ {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          🏢 Quản lý nhà cung cấp
        </h1>
        <p className="text-gray-600">
          Quản lý thông tin các nhà cung cấp sản phẩm
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border-2 border-primary-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-primary-600 text-sm font-medium mb-1">
                Tổng số
              </p>
              <p className="text-3xl text-primary-600 font-bold">
                {stats.total}
              </p>
            </div>
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center text-2xl">
              🏢
            </div>
          </div>
        </div>

        <div className="bg-white border-2 border-emerald-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-600 text-sm font-medium mb-1">
                Đang hoạt động
              </p>
              <p className="text-3xl text-emerald-600 font-bold">
                {stats.active}
              </p>
            </div>
            <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center text-2xl">
              ✅
            </div>
          </div>
        </div>

        <div className="bg-white border-2 border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium mb-1">
                Ngừng hoạt động
              </p>
              <p className="text-3xl text-gray-600 font-bold">
                {stats.inactive}
              </p>
            </div>
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-2xl">
              ⛔
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Search */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <input
                type="text"
                placeholder="Tìm kiếm nhà cung cấp..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <svg
                className="absolute left-3 top-3 w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          {/* Filter + Add */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFilterActive("all")}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterActive === "all"
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Tất cả ({stats.total})
            </button>
            <button
              onClick={() => setFilterActive("active")}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterActive === "active"
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Hoạt động ({stats.active})
            </button>
            <button
              onClick={() => setFilterActive("inactive")}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterActive === "inactive"
                  ? "bg-gray-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Ngừng ({stats.inactive})
            </button>

            {!isStaff && (
              <>
                <div className="w-px h-8 bg-gray-200 mx-1" />

                <button
                  onClick={handleCreate}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium flex items-center gap-2"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Thêm mới
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Table - Compact version */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-16">
                  STT
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Nhà cung cấp
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Liên hệ
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider w-32">
                  Trạng thái
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider w-32">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center">
                    <div className="text-gray-400">
                      <div className="text-5xl mb-3">📦</div>
                      <p className="text-lg font-medium text-gray-600">
                        Không tìm thấy nhà cung cấp nào
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        {search
                          ? "Thử tìm kiếm với từ khóa khác"
                          : "Hãy thêm nhà cung cấp đầu tiên"}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((supplier, index) => (
                  <tr
                    key={supplier.id}
                    onClick={() => handleView(supplier)}
                    title="Bấm để xem chi tiết"
                    className="cursor-pointer hover:bg-primary-50/60 transition-colors"
                  >
                    <td className="px-4 py-4 text-sm text-gray-500 font-medium">
                      {index + 1}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-lg">🏢</span>
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-800 truncate">
                            {supplier.name}
                          </div>
                          {supplier.address && (
                            <div
                              className="text-xs text-gray-500 mt-1 truncate max-w-xs"
                              title={supplier.address}
                            >
                              📍 {supplier.address}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm space-y-1">
                        {supplier.phone ? (
                          <div className="flex items-center gap-2 text-gray-700">
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                            </svg>
                            <span className="font-mono">{supplier.phone}</span>
                          </div>
                        ) : null}
                        {supplier.email ? (
                          <div className="flex items-center gap-2 text-gray-600">
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                              <polyline points="22,6 12,13 2,6" />
                            </svg>
                            <span className="truncate max-w-[200px]">
                              {supplier.email}
                            </span>
                          </div>
                        ) : null}
                        {!supplier.phone && !supplier.email && (
                          <span className="text-gray-400 text-sm">
                            Chưa có thông tin
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                          supplier.isActive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            supplier.isActive ? "bg-emerald-500" : "bg-gray-400"
                          }`}
                        />
                        {supplier.isActive ? "Hoạt động" : "Ngừng"}
                      </span>
                    </td>
                    <td className="px-4 py-4" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleView(supplier)}
                          className="p-2 bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100 transition-colors"
                          title="Xem chi tiết"
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                        {!isStaff && (
                          <button
                            onClick={() => handleEdit(supplier)}
                            className="p-2 bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100 transition-colors"
                            title="Chỉnh sửa"
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination (optional) */}
      {filteredSuppliers.length > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <div>
            Hiển thị{" "}
            <span className="font-medium">{filteredSuppliers.length}</span> nhà
            cung cấp
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <SupplierModal
          mode={isStaff ? "view" : modalMode}
          supplier={selectedSupplier}
          onSave={handleSave}
          onCancel={() => setShowModal(false)}
          onDelete={handleDelete}
          saving={saving}
        />
      )}
    </div>
  );
}
