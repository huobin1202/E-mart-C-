// Updated UnitList.jsx with role-based access control
import React, { useState, useEffect, useCallback } from "react";
import {
  getAllUnits,
  createUnit,
  updateUnit,
  deleteUnit,
  toggleUnitActive,
} from "../../api/unitApi";
import UnitModal from "../../components/units/UnitModal";
import { useAuth } from "../../hook/useAuth";

export default function UnitList() {
  // Get current user and role
  const { user } = useAuth();
  const isStaff = user?.role?.toLowerCase() === "staff";

  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);

  // Modal state
  const [modalState, setModalState] = useState({
    open: false,
    mode: null, // 'view' | 'edit' | 'create'
    unit: null,
  });
  const [saving, setSaving] = useState(false);

  // Search & Filter
  const [search, setSearch] = useState("");
  const [filterActive, setFilterActive] = useState(""); // "" | "true" | "false"

  // Fetch units
  const fetchUnits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllUnits();
      setUnits(data);
    } catch (error) {
      console.error("Error fetching units:", error);
      setError(error.message || "Lỗi tải danh sách đơn vị");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnits();
  }, [fetchUnits]);

  // Open modal
  const openModal = useCallback((mode, unit = null) => {
    setModalState({
      open: true,
      mode,
      unit: unit || {},
    });
  }, []);

  // Close modal
  const closeModal = useCallback(() => {
    setModalState({
      open: false,
      mode: null,
      unit: null,
    });
  }, []);

  // Handle save (create/edit)
  const handleSave = async (unitData, mode) => {
    if (isStaff) {
      setNotification({
        type: "error",
        message: "Bạn không có quyền thực hiện thao tác này",
      });
      return;
    }

    setSaving(true);
    setNotification(null);
    try {
      if (mode === "create") {
        await createUnit(unitData);
        setNotification({
          type: "success",
          message: "Thêm đơn vị thành công",
        });
      } else {
        await updateUnit(unitData.id, unitData);
        setNotification({
          type: "success",
          message: "Cập nhật đơn vị thành công",
        });
      }
      closeModal();
      await fetchUnits();
    } catch (error) {
      console.error("Save error:", error);
      setNotification({
        type: "error",
        message:
          error.message ||
          `${mode === "create" ? "Thêm" : "Cập nhật"} thất bại`,
      });
    } finally {
      setSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async (id, productCount) => {
    if (isStaff) {
      setNotification({
        type: "error",
        message: "Bạn không có quyền xóa đơn vị",
      });
      return;
    }

    if (productCount > 0) {
      setNotification({
        type: "error",
        message: "Không thể xóa đơn vị đang được sử dụng bởi sản phẩm",
      });
      return;
    }

    if (!window.confirm("Bạn có chắc muốn xóa đơn vị này?")) return;

    try {
      await deleteUnit(id);
      setNotification({
        type: "success",
        message: "Xóa đơn vị thành công",
      });
      await fetchUnits();
      closeModal();
    } catch (error) {
      console.error("Delete error:", error);
      setNotification({
        type: "error",
        message: error.message || "Không thể xóa đơn vị này",
      });
    }
  };

  // Handle toggle active
  const handleToggleActive = async (id) => {
    if (isStaff) {
      setNotification({
        type: "error",
        message: "Bạn không có quyền thay đổi trạng thái",
      });
      return;
    }

    try {
      await toggleUnitActive(id);
      await fetchUnits();
      setNotification({
        type: "success",
        message: "Cập nhật trạng thái thành công",
      });
    } catch (error) {
      console.error("Toggle error:", error);
      setNotification({
        type: "error",
        message: error.message || "Có lỗi xảy ra",
      });
    }
  };

  // Filter units
  const filteredUnits = units.filter((unit) => {
    const matchSearch =
      unit.code.toLowerCase().includes(search.toLowerCase()) ||
      unit.name.toLowerCase().includes(search.toLowerCase());

    const matchActive =
      filterActive === ""
        ? true
        : filterActive === "true"
        ? unit.isActive
        : !unit.isActive;

    return matchSearch && matchActive;
  });

  // Auto-hide notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Quản lý Đơn vị tính
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Quản lý các đơn vị đo lường sản phẩm
            </p>
          </div>
          {!isStaff && (
            <button
              onClick={() => openModal("create")}
              className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 flex items-center gap-2 transition"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Thêm đơn vị
            </button>
          )}
        </div>

        {/* Notification */}
        {notification && (
          <div
            className={`mb-4 p-4 rounded-md flex items-start ${
              notification.type === "success"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-red-50 border border-red-200 text-red-800"
            }`}
          >
            <svg
              className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              {notification.type === "success" ? (
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              ) : (
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              )}
            </svg>
            <div className="flex-1">
              <p className="font-medium">{notification.message}</p>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-gray-500 hover:text-gray-700 ml-4"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow-sm mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <input
                type="text"
                placeholder="Tìm kiếm theo mã hoặc tên..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="true">Đang sử dụng</option>
                <option value="false">Ngừng sử dụng</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-indigo-600"></div>
              <p className="mt-2 text-gray-600">Đang tải...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-red-600">{error}</p>
              <button
                onClick={fetchUnits}
                className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
              >
                Thử lại
              </button>
            </div>
          ) : filteredUnits.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {search || filterActive
                ? "Không tìm thấy đơn vị phù hợp"
                : "Chưa có đơn vị nào"}
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    STT
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mã
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tên
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Số sản phẩm
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Trạng thái
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUnits.map((unit, index) => (
                  <tr key={unit.id} onClick={() => openModal("view", unit)} title="Bấm để xem chi tiết" className="cursor-pointer hover:bg-primary-50/60 transition">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {unit.code}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {unit.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-primary-600 font-semibold">
                      {unit.productCount || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={(event) => { event.stopPropagation(); handleToggleActive(unit.id); }}
                        disabled={isStaff}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                          unit.isActive
                            ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                            : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                        } ${isStaff ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        {unit.isActive ? "Đang dùng" : "Ngừng dùng"}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openModal("view", unit)}
                          className="px-3 py-1 bg-primary-100 text-primary-800 rounded hover:bg-primary-200 transition"
                        >
                          Chi tiết
                        </button>
                        {!isStaff && (
                          <>
                            <button
                              onClick={() => openModal("edit", unit)}
                              className="px-3 py-1 bg-amber-100 text-amber-800 rounded hover:bg-amber-200 transition"
                            >
                              Sửa
                            </button>
                            <button
                              onClick={() =>
                                handleDelete(unit.id, unit.productCount)
                              }
                              className={`px-3 py-1 rounded transition ${
                                unit.productCount > 0
                                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                  : "bg-red-100 text-red-800 hover:bg-red-200"
                              }`}
                              title={
                                unit.productCount > 0
                                  ? "Không thể xóa đơn vị đang được sử dụng"
                                  : "Xóa đơn vị"
                              }
                            >
                              Xóa
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Stats */}
        <div className="mt-4 text-sm text-gray-600">
          Hiển thị <strong>{filteredUnits.length}</strong> /{" "}
          <strong>{units.length}</strong> đơn vị
        </div>
      </div>

      {/* Modal */}
      {modalState.open && (
        <UnitModal
          mode={isStaff ? "view" : modalState.mode}
          unit={modalState.unit}
          onSave={handleSave}
          onCancel={closeModal}
          onDelete={() => {
            if (modalState.unit?.id && !isStaff) {
              handleDelete(modalState.unit.id, modalState.unit.productCount);
            }
          }}
          saving={saving}
        />
      )}
    </div>
  );
}
