import React, { useState, useEffect } from "react";
import { getPromotionById, getPromotionRedemptions, getPromotionStats } from "../../api/promotionApi";

export default function PromotionDetail({ promotionId, onClose, onEdit }) {
  const [promotion, setPromotion] = useState(null);
  const [stats, setStats] = useState(null);
  const [redemptions, setRedemptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("info"); // info, stats, history

  useEffect(() => {
    if (!promotionId) return;
    
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [promoData, statsData, redemptionsData] = await Promise.all([
          getPromotionById(promotionId),
          getPromotionStats(promotionId).catch(() => null),
          getPromotionRedemptions(promotionId).catch(() => []),
        ]);
        
        setPromotion(promoData);
        setStats(statsData);
        setRedemptions(redemptionsData);
      } catch (err) {
        setError(err.message || "Không thể tải dữ liệu");
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, [promotionId]);

  const formatDate = (dateStr) => {
    if (!dateStr) return "Không giới hạn";
    const date = new Date(dateStr);
    // Cộng 7 giờ để chuyển từ UTC sang giờ Việt Nam
    date.setHours(date.getHours() + 7);
    return date.toLocaleDateString("vi-VN", { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    // Cộng 7 giờ để chuyển từ UTC sang giờ Việt Nam
    date.setHours(date.getHours() + 7);
    return date.toLocaleString("vi-VN", { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (amount) => {
    return amount?.toLocaleString("vi-VN") + "đ";
  };

  if (loading) {
    return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="text-gray-600">Đang tải...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !promotion) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl p-8 shadow-2xl max-w-md">
          <div className="text-center">
            <svg className="mx-auto h-12 w-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">Có lỗi xảy ra</h3>
            <p className="mt-2 text-sm text-gray-500">{error}</p>
            <button
              onClick={onClose}
              className="mt-6 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    );
  }

  const getStatusBadge = () => {
    const now = new Date();
    if (!promotion.active) 
      return <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">Không hoạt động</span>;
    if (promotion.endDate && new Date(promotion.endDate) < now) 
      return <span className="px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">Hết hạn</span>;
    if (promotion.startDate && new Date(promotion.startDate) > now) 
      return <span className="px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">Chưa bắt đầu</span>;
    if (promotion.usageLimit && promotion.usedCount >= promotion.usageLimit) 
      return <span className="px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800">Hết lượt</span>;
    return <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">Đang hoạt động</span>;
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-blue-600 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">Chi tiết khuyến mãi</h2>
              <p className="text-white mt-1">{promotion.name}</p>
              <p className="text-white mt-1 font-mono text-lg">{promotion.type === "voucher" ? promotion.voucherCode : "Chương trình tự động"}</p>
            </div>
            <div className="flex items-center gap-3">
              {getStatusBadge()}
              <button
                onClick={onClose}
                className="bg-red-500 text-white hover:bg-red-600 p-2 rounded font-bold text-xl"
                aria-label="Đóng"
              >
                 &times;
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b bg-gray-50">
          <div className="flex">
            <button
              onClick={() => setActiveTab("info")}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === "info"
                  ? "text-blue-600 border-b-2 border-blue-600 bg-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Thông tin
            </button>
            <button
              onClick={() => setActiveTab("stats")}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === "stats"
                  ? "text-blue-600 border-b-2 border-blue-600 bg-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Thống kê
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === "history"
                  ? "text-blue-600 border-b-2 border-blue-600 bg-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Lịch sử ({redemptions.length})
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "info" && (
            <div className="space-y-6">
              {/* Thông tin cơ bản */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-3">Thông tin cơ bản</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-blue-700">Mã khuyến mãi</label>
                    <p className="mt-1 text-base font-bold text-blue-900 font-mono">{promotion.type === "voucher" ? promotion.voucherCode : "Không có mã nhập"}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-blue-700">ID</label>
                    <p className="mt-1 text-base text-blue-900">#{promotion.id}</p>
                  </div>
                </div>
              </div>

              {/* Thông tin giảm giá */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Thông tin giảm giá</h3>
                <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-medium text-gray-500">Loại chương trình</label>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    {{ product: "Theo sản phẩm", event: "Sự kiện", voucher: "Voucher" }[promotion.type] || promotion.type}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Giá trị</label>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    {promotion.discountType === "percent" ? `${promotion.value}%` : formatCurrency(promotion.value)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Đơn hàng tối thiểu</label>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{promotion.type === "event" ? formatCurrency(promotion.minOrderAmount) : "—"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Giảm tối đa</label>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    {promotion.maxDiscount ? formatCurrency(promotion.maxDiscount) : "Không giới hạn"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Ngày bắt đầu</label>
                  <p className="mt-1 text-gray-900">{formatDate(promotion.startDate)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Ngày kết thúc</label>
                  <p className="mt-1 text-gray-900">{formatDate(promotion.endDate)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Lượt sử dụng</label>
                  <p className="mt-1 text-gray-900">
                    <span className="font-semibold text-lg">{promotion.usedCount}</span>
                    <span className="text-gray-400 mx-2">/</span>
                    <span>{promotion.usageLimit ?? "∞"}</span>
                  </p>
                  {promotion.usageLimit && (
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${Math.min((promotion.usedCount / promotion.usageLimit) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Trạng thái</label>
                    <div className="mt-1">{getStatusBadge()}</div>
                  </div>
                </div>
              </div>

              {/* Thông tin thời gian */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Thông tin thời gian</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Ngày tạo</label>
                    <p className="mt-1 text-gray-900">{formatDateTime(promotion.createdAt)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Cập nhật lần cuối</label>
                    <p className="mt-1 text-gray-900">{formatDateTime(promotion.updatedAt)}</p>
                  </div>
                </div>
              </div>

              {/* Mô tả */}
              {promotion.description && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Mô tả</h3>
                  <p className="text-gray-700 bg-gray-50 p-4 rounded-lg whitespace-pre-wrap">{promotion.description}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "stats" && (
            <div>
              {!stats ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-3 text-gray-500">Đang tải thống kê...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <p className="text-sm text-blue-600 font-medium">Tổng lượt dùng</p>
                      <p className="text-2xl font-bold text-blue-900 mt-1">{stats.totalRedemptions || 0}</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <p className="text-sm text-green-600 font-medium">Tổng giảm giá</p>
                      <p className="text-2xl font-bold text-green-900 mt-1">{formatCurrency(stats.totalDiscountAmount || 0)}</p>
                    </div>
                  </div>

                  {/* Chi tiết stats */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-gray-900 mb-3">Chi tiết</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Số khách hàng:</span>
                        <span className="font-semibold">{stats.uniqueCustomers || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Giá trị TB/đơn:</span>
                        <span className="font-semibold">{formatCurrency(stats.averageOrderValue || 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div>
              {redemptions.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="mt-2 text-gray-500">Chưa có lịch sử sử dụng</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {redemptions.map((item, idx) => (
                    <div key={idx} className="bg-gray-50 p-4 rounded-lg flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">Đơn hàng #{item.orderId}</p>
                        <p className="text-sm text-gray-500">{formatDate(item.usedAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-600">-{formatCurrency(item.discountAmount)}</p>
                        <p className="text-sm text-gray-500">Từ {formatCurrency(item.orderAmount)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 bg-gray-50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
          >
            Đóng
          </button>
          <button
            onClick={() => onEdit(promotion)}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
          >
            Chỉnh sửa
          </button>
        </div>
      </div>
    </div>
  );
}
