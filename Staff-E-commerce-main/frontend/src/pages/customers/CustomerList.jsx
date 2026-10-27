import { useEffect, useState } from "react";
import { useDebouncedSearch } from "../../hook/useDebouncedSearch";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchCustomers,
  setCurrentPage,
  setSearchTerm,
  setStatusFilter,
  resetFilters,
  mergeRealtimeCustomer,
} from "../../features/customers/customerSlice";
import Pagination from "../../components/ui/Pagination";
import CustomerDetailModal from "../../components/customers/CustomerDetailModal";
import CustomerEditModal from "../../components/customers/CustomerEditModal";
import CustomerAddModal from "../../components/customers/CustomerAddModal";
import {
  Search,
  Edit2,
  Eye,
  RotateCcw,
  Tag,
  CheckCircle,
  Clock,
  XCircle,
  Trash2,
  Upload,
  Power,
} from "lucide-react";
import ImportModal from "../../components/import/ImportModal";
import { getCustomers, deleteCustomer, toggleCustomerStatus } from "../../api/customerApi";
import { useAuth } from "../../hook/useAuth";
import { useRealtimeNotifications } from "../../hooks/useRealtimeNotifications";

const CustomerList = () => {
  const dispatch = useDispatch();
  const {
    items: customers,
    loading,
    error,
    pagination,
    filters,
  } = useSelector((state) => state.customers);

  const { user } = useAuth();
  const isStaff = user?.role?.toLowerCase() === "staff";

  const [localSearchTerm, setLocalSearchTerm] = useState(filters.search || "");
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
  });

  useRealtimeNotifications({
    CustomerCreated: (customer) => {
      dispatch(mergeRealtimeCustomer(customer));
      refreshCustomerData();
    },
    CustomerUpdated: (customer) => {
      dispatch(mergeRealtimeCustomer(customer));
      refreshCustomerData();
    },
  });

  function refreshCustomerData() {
    dispatch(fetchCustomers({
      page: pagination.currentPage,
      pageSize: pagination.pageSize,
      search: filters.search,
      status: filters.status,
    }));
    Promise.all([
      getCustomers(1, 1, "", "all"),
      getCustomers(1, 1, "", "active"),
      getCustomers(1, 1, "", "inactive"),
    ]).then(([totalData, activeData, inactiveData]) => {
      setStats({ total: totalData.totalItems || 0, active: activeData.totalItems || 0, inactive: inactiveData.totalItems || 0 });
    }).catch((error) => console.error("Error refreshing customer stats:", error));
  }

  useEffect(() => {
    if (!actionNotice) return undefined;
    const timer = window.setTimeout(() => setActionNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [actionNotice]);

  // Fetch stats (total, active, inactive) on mount
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [totalData, activeData, inactiveData] = await Promise.all([
          getCustomers(1, 1, "", "all"),
          getCustomers(1, 1, "", "active"),
          getCustomers(1, 1, "", "inactive"),
        ]);
        setStats({
          total: totalData.totalItems || 0,
          active: activeData.totalItems || 0,
          inactive: inactiveData.totalItems || 0,
        });
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    };
    fetchStats();
    const refreshTimer = window.setInterval(fetchStats, 15000);
    return () => window.clearInterval(refreshTimer);
  }, []);

  // Fetch customers when filters or pagination changes
  useEffect(() => {
    const refreshCustomers = () => dispatch(
      fetchCustomers({
        page: pagination.currentPage,
        pageSize: pagination.pageSize,
        search: filters.search,
        status: filters.status,
      })
    );
    refreshCustomers();
    // Fallback when the SignalR connection is not available; the list endpoint reads SQL directly.
    const refreshTimer = window.setInterval(refreshCustomers, 3000);
    return () => window.clearInterval(refreshTimer);
  }, [
    dispatch,
    pagination.currentPage,
    filters.search,
    filters.status,
    pagination.pageSize,
  ]);

  useDebouncedSearch(localSearchTerm, filters.search, (keyword) => {
    dispatch(setSearchTerm(keyword));
  });

  const handleStatusFilter = (status) => {
    dispatch(setStatusFilter(status));
  };

  const handleView = (customerId) => {
    setSelectedCustomerId(customerId);
  };

  const handleEdit = (customerId) => {
    setEditingCustomerId(customerId);
  };

  const handleDelete = async (customerId) => {
    if (!window.confirm("Xóa hồ sơ khách hàng này?")) return;
    try {
      await deleteCustomer(customerId);
      const result = await dispatch(fetchCustomers({
        page: pagination.currentPage,
        pageSize: pagination.pageSize,
        search: filters.search,
        status: filters.status,
      })).unwrap();
      if (result.items.length === 0 && pagination.currentPage > 1) {
        dispatch(setCurrentPage(pagination.currentPage - 1));
      }
      const [totalData, activeData, inactiveData] = await Promise.all([
        getCustomers(1, 1, "", "all"),
        getCustomers(1, 1, "", "active"),
        getCustomers(1, 1, "", "inactive"),
      ]);
      setStats({ total: totalData.totalItems || 0, active: activeData.totalItems || 0, inactive: inactiveData.totalItems || 0 });
      setActionNotice({ type: "success", message: "Đã xóa khách hàng." });
    } catch (error) {
      setActionNotice({ type: "error", message: error.message || "Không thể xóa khách hàng." });
    }
  };

  const handleToggleCustomerStatus = async (customer) => {
    const nextActive = !customer.isActive;
    const action = nextActive ? "mở khóa" : "khóa";
    if (!window.confirm(`Bạn có chắc muốn ${action} tài khoản khách hàng ${customer.fullName}?`)) return;
    try {
      await toggleCustomerStatus(customer.id, nextActive);
      const [listResult, totalData, activeData, inactiveData] = await Promise.all([
        dispatch(fetchCustomers({ page: pagination.currentPage, pageSize: pagination.pageSize, search: filters.search, status: filters.status })).unwrap(),
        getCustomers(1, 1, "", "all"),
        getCustomers(1, 1, "", "active"),
        getCustomers(1, 1, "", "inactive"),
      ]);
      if (listResult.items.length === 0 && pagination.currentPage > 1) dispatch(setCurrentPage(pagination.currentPage - 1));
      setStats({ total: totalData.totalItems || 0, active: activeData.totalItems || 0, inactive: inactiveData.totalItems || 0 });
      setActionNotice({ type: "success", message: `Đã ${action} khách hàng.` });
    } catch (error) {
      setActionNotice({ type: "error", message: error.message || `Không thể ${action} khách hàng.` });
    }
  };

  const handlePageChange = (page) => {
    dispatch(setCurrentPage(page));
  };

  const handleReset = () => {
    dispatch(resetFilters());
    setLocalSearchTerm("");
  };

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800">Lỗi: {error}</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-800">Quản Lý Khách Hàng</h1>
        <div className="flex gap-3">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
          >
            <Upload size={18} />
            Import Khách Hàng
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            + Thêm Khách Hàng
          </button>
        </div>
      </div>
      {actionNotice && <div role={actionNotice.type === "error" ? "alert" : "status"} className={`fixed right-4 top-4 z-50 max-w-md rounded-lg border p-3 shadow-lg ${actionNotice.type === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{actionNotice.message}<button type="button" className="ml-3 underline" onClick={() => setActionNotice(null)}>Đóng</button></div>}

      {/* Statistics */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <div
          className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => handleStatusFilter("all")}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Tag className="w-5 h-5 text-primary-600" />
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-1">Tổng số</p>
          <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
        </div>
        <div
          className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => handleStatusFilter("active")}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-1">Đang hoạt động</p>
          <p className="text-2xl font-bold text-gray-800">{stats.active}</p>
        </div>
        <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-100 rounded-lg">
              <Clock className="w-5 h-5 text-red-600" />
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-1">Hết hạn</p>
          <p className="text-2xl font-bold text-gray-800">0</p>
        </div>
        <div
          className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => handleStatusFilter("inactive")}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-gray-100 rounded-lg">
              <XCircle className="w-5 h-5 text-gray-600" />
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-1">Không hoạt động</p>
          <p className="text-2xl font-bold text-gray-800">{stats.inactive}</p>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="mb-6 flex gap-4">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Tìm kiếm theo tên, email, số điện thoại..."
            value={localSearchTerm}
            onChange={(e) => setLocalSearchTerm(e.target.value)}
            className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400 pointer-events-none" />
        </div>
        <select
          value={filters.status}
          onChange={(e) => handleStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">Tất Cả Trạng Thái</option>
          <option value="active">Đang Hoạt Động</option>
          <option value="inactive">Ngừng Hoạt Động</option>
        </select>
        <button
          onClick={handleReset}
          className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 flex items-center gap-2"
          title="Làm mới danh sách"
        >
          <RotateCcw size={18} />
          Làm Mới
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden border border-gray-300 rounded-lg">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <thead className="bg-gray-100 border-b border-gray-300">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                  Tên Khách Hàng
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                  Điện Thoại
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                  Ngày Sinh
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                  Địa Chỉ
                </th>
                <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">
                  Hành Động
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan="6"
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    Đang tải...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td
                    colSpan="6"
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    Không có khách hàng nào
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => handleView(customer.id)}
                    title="Bấm để xem chi tiết"
                    className="cursor-pointer border-b border-gray-200 hover:bg-primary-50/60"
                  >
                    <td className="px-6 py-3">
                      <div>
                        <p className="font-semibold text-gray-800">
                          {customer.fullName}
                        </p>
                        <p className="text-sm text-gray-500">
                          {(() => {
                            const formattedDate = customer.createdAt
                              ? new Date(customer.createdAt).toLocaleDateString(
                                  "vi-VN"
                                )
                              : "";
                            return formattedDate;
                          })()}
                          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${customer.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{customer.isActive ? "Đang hoạt động" : "Không hoạt động"}</span>
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">
                      {customer.email || "-"}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">
                      {customer.phone || "-"}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">
                      {customer.dateOfBirth ? new Date(customer.dateOfBirth).toLocaleDateString("vi-VN") : "-"}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">
                      {customer.address || "-"}
                    </td>
                    <td className="px-6 py-3 text-center" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleView(customer.id)}
                          className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition"
                          title="Xem chi tiết"
                        >
                          <Eye size={18} />
                        </button>
                        {!isStaff && (
                          <>
                            <button
                              onClick={() => handleEdit(customer.id)}
                              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                              title="Sửa"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => handleToggleCustomerStatus(customer)}
                              className={`p-2 rounded-lg transition ${customer.isActive ? "text-amber-600 hover:bg-amber-50" : "text-emerald-600 hover:bg-emerald-50"}`}
                              title={customer.isActive ? "Khóa tài khoản" : "Mở khóa tài khoản"}
                            >
                              <Power size={18} />
                            </button>
                            <button
                              onClick={() => handleDelete(customer.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                              title="Xóa hồ sơ"
                            >
                              <Trash2 size={18} />
                            </button>
                          </>
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

      {/* Pagination */}
      <div className="mt-6">
        <Pagination meta={pagination} onPageChange={handlePageChange} />
        <div className="mt-4 text-sm text-gray-600">
          Hiển thị{" "}
          <strong>
            {(pagination.currentPage - 1) * pagination.pageSize + 1} -{" "}
            {Math.min(
              pagination.currentPage * pagination.pageSize,
              pagination.totalItems
            )}
          </strong>{" "}
          / {pagination.totalItems} khách hàng
        </div>
      </div>

      {/* Customer Detail Modal */}
      {selectedCustomerId && (
        <CustomerDetailModal
          customerId={selectedCustomerId}
          onClose={() => setSelectedCustomerId(null)}
        />
      )}

      {/* Customer Edit Modal */}
      {editingCustomerId && (
        <CustomerEditModal
          customerId={editingCustomerId}
          onClose={() => setEditingCustomerId(null)}
          onSave={async () => {
            // Refresh customer list after edit
            await dispatch(
              fetchCustomers({
                page: pagination.currentPage,
                pageSize: pagination.pageSize,
                search: filters.search,
                status: filters.status,
              })
            ).unwrap();
            // Update stats
            const [totalData, activeData, inactiveData] = await Promise.all([
              getCustomers(1, 1, "", "all"),
              getCustomers(1, 1, "", "active"),
              getCustomers(1, 1, "", "inactive"),
            ]);
            setStats({
              total: totalData.totalItems || 0,
              active: activeData.totalItems || 0,
              inactive: inactiveData.totalItems || 0,
            });
            setActionNotice({ type: "success", message: "Đã cập nhật thông tin khách hàng." });
          }}
        />
      )}

      {/* Customer Add Modal */}
      <CustomerAddModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={async () => {
          // Refresh customer list after adding
          await dispatch(
            fetchCustomers({
              page: pagination.currentPage,
              pageSize: pagination.pageSize,
              search: filters.search,
              status: filters.status,
            })
          ).unwrap();
          // Update stats
          const [totalData, activeData, inactiveData] = await Promise.all([
            getCustomers(1, 1, "", "all"),
            getCustomers(1, 1, "", "active"),
            getCustomers(1, 1, "", "inactive"),
          ]);
          setStats({
            total: totalData.totalItems || 0,
            active: activeData.totalItems || 0,
            inactive: inactiveData.totalItems || 0,
          });
          setActionNotice({ type: "success", message: "Đã thêm khách hàng." });
        }}
      />

      {/* Import Modal */}
      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={async () => {
          // Refresh customer list after import
          await dispatch(
            fetchCustomers({
              page: pagination.currentPage,
              pageSize: pagination.pageSize,
              search: filters.search,
              status: filters.status,
            })
          ).unwrap();
          // Update stats
          const [totalData, activeData, inactiveData] = await Promise.all([
            getCustomers(1, 1, "", "all"),
            getCustomers(1, 1, "", "active"),
            getCustomers(1, 1, "", "inactive"),
          ]);
          setStats({
            total: totalData.totalItems || 0,
            active: activeData.totalItems || 0,
            inactive: inactiveData.totalItems || 0,
          });
          setActionNotice({ type: "success", message: "Đã nhập danh sách khách hàng." });
        }}
        type="customers"
      />
    </div>
  );
};

export default CustomerList;
