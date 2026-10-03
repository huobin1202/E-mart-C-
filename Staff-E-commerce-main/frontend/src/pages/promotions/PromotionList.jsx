import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import Pagination from "../../components/ui/Pagination";
import {
  fetchPromotionsPaginated,
  deletePromotion as deletePromotionThunk,
  togglePromotionActive as togglePromotionActiveThunk,
  fetchPromotionStats,
} from "../../features/promotions/promotionSlice";
import PromotionCreate from "./PromotionCreate";
import PromotionDetail from "./PromotionDetail";
import PromotionEdit from "./PromotionEdit";
import { useAuth } from "../../hook/useAuth";
import { formatVietnam, getPromotionStatus } from "../../utils/dateTimeHelper";

export default function PromotionList() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [refresh, setRefresh] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPromotionId, setSelectedPromotionId] = useState(null);
  const [editingPromotion, setEditingPromotion] = useState(null);
  const [statsLocal, setStatsLocal] = useState(null);

  const { user } = useAuth();
  const isStaff = user?.role?.toLowerCase() === "staff";

  const dispatch = useDispatch();
  const {
    items,
    loading,
    error,
    meta,
    overview: stats,
  } = useSelector((s) => s.promotions);

  // Debounce search để không gọi API liên tục khi gõ
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    dispatch(
      fetchPromotionsPaginated({
        page,
        pageSize,
        search: debouncedSearch,
        status: filterStatus,
        type: filterType,
      })
    );
  }, [
    dispatch,
    page,
    pageSize,
    debouncedSearch,
    filterStatus,
    filterType,
    refresh,
  ]);

  // Reset về page 1 khi filter thay đổi
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterStatus, filterType]);

  useEffect(() => {
    dispatch(fetchPromotionStats());
  }, [dispatch, refresh]);

  const handleDelete = async (id) => {
    if (!confirm("Bạn có chắc muốn xóa khuyến mãi này?")) return;
    const res = await dispatch(deletePromotionThunk(id));
    if (res.meta.requestStatus === "rejected") alert("Lỗi: " + res.payload);
  };

  const handleToggle = async (id) => {
    const res = await dispatch(togglePromotionActiveThunk(id));
    if (res.meta.requestStatus === "rejected") alert("Lỗi: " + res.payload);
    else dispatch(fetchPromotionStats());
  };

  useEffect(() => {
    if (stats) setStatsLocal(stats);
  }, [stats]);

  const formatDate = (dateStr) => {
    return formatVietnam(dateStr);
  };

  const getStatusBadge = (promo) => {
    const { label, color } = getPromotionStatus(promo);
    
    const colorClasses = {
      gray: "bg-gray-100 text-gray-800",
      red: "bg-red-100 text-red-800",
      yellow: "bg-yellow-100 text-yellow-800",
      orange: "bg-orange-100 text-orange-800",
      green: "bg-green-100 text-green-800",
    };
    
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${colorClasses[color]}`}>
        {label}
      </span>
    );
  };

  // Không cần filter ở FE nữa vì đã filter ở BE
  const filteredItems = items;

  const StatCard = ({ icon, label, value, color }) => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow h-full">
      <div className="flex items-center">
        <div className={`shrink-0 ${color} rounded-lg p-2`}>{icon}</div>
        <div className="ml-3">
          <p className="text-xs font-medium text-gray-600">{label}</p>
          <p className="text-xl font-semibold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-2xl font-bold text-gray-900">
              Quản lý Khuyến mãi
            </h1>
            {!isStaff && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl"
              >
                <span className="flex items-center">
                  <svg
                    className="w-4 h-4 mr-2"
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
                  Tạo khuyến mãi mới
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Statistics */}
        <div className="flex flex-wrap gap-3 mb-8">
          <div className="flex-1 min-w-[140px]">
            <StatCard
              icon={
                <svg
                  className="w-5 h-5 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                  />
                </svg>
              }
              label="Tổng số"
              value={statsLocal?.total ?? stats?.total ?? 0}
              color="bg-blue-100"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <StatCard
              icon={
                <svg
                  className="w-5 h-5 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              }
              label="Đang hoạt động"
              value={statsLocal?.active ?? stats?.active ?? 0}
              color="bg-green-100"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <StatCard
              icon={
                <svg
                  className="w-5 h-5 text-yellow-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              }
              label="Chưa bắt đầu"
              value={statsLocal?.scheduled ?? stats?.scheduled ?? 0}
              color="bg-yellow-100"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <StatCard
              icon={
                <svg
                  className="w-5 h-5 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              }
              label="Hết hạn"
              value={statsLocal?.expired ?? stats?.expired ?? 0}
              color="bg-red-100"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <StatCard
              icon={
                <svg
                  className="w-5 h-5 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                  />
                </svg>
              }
              label="Không hoạt động"
              value={statsLocal?.inactive ?? stats?.inactive ?? 0}
              color="bg-gray-100"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="relative flex-1 min-w-0">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg
                  className="h-5 w-5 text-gray-400"
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
              <input
                type="text"
                placeholder="Tìm kiếm mã khuyến mãi..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-12 pr-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="block w-full lg:w-64 px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đang hoạt động</option>
              <option value="scheduled">Chưa bắt đầu</option>
              <option value="inactive">Không hoạt động</option>
              <option value="expired">Hết hạn</option>
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="block w-full lg:w-56 px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="all">Tất cả loại</option>
              <option value="product">Theo sản phẩm</option>
              <option value="event">Sự kiện</option>
              <option value="voucher">Voucher</option>
            </select>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Đang tải dữ liệu...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex">
              <svg
                className="h-5 w-5 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="ml-3 text-sm text-red-800">
                Có lỗi xảy ra: {error}
              </p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredItems.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              Không tìm thấy khuyến mãi nào
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Thử thay đổi điều kiện tìm kiếm hoặc tạo khuyến mãi mới.
            </p>
          </div>
        )}

        {/* Table */}
        {!loading && !error && filteredItems.length > 0 && (
          <>
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Mã KM
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Loại
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Giá trị
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ĐH tối thiểu
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Thời gian
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Lượt dùng
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Trạng thái
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredItems.map((promo, idx) => (
                      <tr
                        key={promo.id}
                        className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900 font-mono bg-blue-50 px-2 py-1 rounded">
                            {promo.code}
                          </span>
                          <div className="mt-1 text-xs text-gray-500">{promo.name}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              promo.discountType === "percent"
                                ? "bg-purple-100 text-purple-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {{ product: "Theo sản phẩm", event: "Sự kiện", voucher: "Voucher" }[promo.type]} · {promo.discountType === "percent" ? "%" : "VNĐ"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                          {promo.discountType === "percent"
                            ? `${promo.value}%`
                            : `${promo.value.toLocaleString()}đ`}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {promo.type === "event" ? `${(promo.minOrderAmount || 0).toLocaleString()}đ` : "—"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>{formatDate(promo.startDate)}</div>
                          <div className="text-xs text-gray-400">
                            đến {formatDate(promo.endDate)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center text-sm">
                            <span className="font-medium text-gray-900">
                              {promo.usedCount}
                            </span>
                            <span className="text-gray-400 mx-1">/</span>
                            <span className="text-gray-500">
                              {promo.usageLimit ?? "∞"}
                            </span>
                          </div>
                          {promo.usageLimit && (
                            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                              <div
                                className="bg-blue-600 h-1.5 rounded-full"
                                style={{
                                  width: `${Math.min(
                                    (promo.usedCount / promo.usageLimit) * 100,
                                    100
                                  )}%`,
                                }}
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(promo)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setSelectedPromotionId(promo.id)}
                              className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-md text-xs font-medium hover:bg-blue-200"
                            >
                              Chi tiết
                            </button>
                            {!isStaff && (
                              <>
                                <button
                                  onClick={() => handleToggle(promo.id)}
                                  className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                                    promo.active
                                      ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                                      : "bg-green-100 text-green-800 hover:bg-green-200"
                                  }`}
                                >
                                  {promo.active ? "Tắt" : "Bật"}
                                </button>
                                <button
                                  onClick={() => setEditingPromotion(promo)}
                                  className="px-3 py-1.5 bg-orange-100 text-orange-800 rounded-md text-xs font-medium hover:bg-orange-200"
                                >
                                  Sửa
                                </button>
                                <button
                                  onClick={() => handleDelete(promo.id)}
                                  className="px-3 py-1.5 bg-red-100 text-red-800 rounded-md text-xs font-medium hover:bg-red-200"
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
              </div>
            </div>

            {meta.totalPages > 1 && (
              <div className="mt-6">
                <Pagination meta={meta} onPageChange={(p) => setPage(p)} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal tạo khuyến mãi */}
      {showCreateModal && (
        <PromotionCreate
          onCancel={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            setRefresh((r) => r + 1);
          }}
        />
      )}

      {/* Modal chi tiết khuyến mãi */}
      {selectedPromotionId && (
        <PromotionDetail
          promotionId={selectedPromotionId}
          onClose={() => setSelectedPromotionId(null)}
          onEdit={(promo) => {
            setSelectedPromotionId(null);
            setEditingPromotion(promo);
          }}
        />
      )}

      {/* Modal chỉnh sửa khuyến mãi */}
      {editingPromotion && (
        <PromotionEdit
          promotion={editingPromotion}
          onCancel={() => setEditingPromotion(null)}
          onSuccess={() => {
            setEditingPromotion(null);
            setRefresh((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}
