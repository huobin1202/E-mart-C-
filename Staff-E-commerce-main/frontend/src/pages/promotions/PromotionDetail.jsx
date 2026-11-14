import React, { useState, useEffect } from "react";
import PromotionProducts from "../../components/promotions/PromotionProducts";
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
    // API trả thời điểm UTC (có hậu tố Z); hiển thị theo giờ Việt Nam bất kể múi giờ của máy.
    return new Date(dateStr).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-1000">
        <div className="bg-white rounded-xl p-8 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
            <span className="text-gray-600">Đang tải...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !promotion) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-1000 p-4">
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
      return <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800">Chưa bắt đầu</span>;
    if (promotion.usageLimit && promotion.usedCount >= promotion.usageLimit) 
      return <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800">Hết lượt</span>;
    return <span className="px-3 py-1 rounded-full text-sm font-medium bg-emerald-100 text-emerald-800">Đang hoạt động</span>;
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-1000 p-4">
      <div role="dialog" aria-modal="true" aria-label="Chi tiết khuyến mãi" className="bg-white rounded-xl shadow-2xl max-w-[1440px] w-full h-[96dvh] max-h-[96dvh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-primary-600 px-4 py-3 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">Chi tiết khuyến mãi</h2>
              <p className="text-white mt-0.5 text-sm break-words">{promotion.name}</p>
              <p className="text-white/90 mt-0.5 font-mono text-xs">{promotion.type === "voucher" ? promotion.voucherCode : "Chương trình tự động"}</p>
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
        <div className="shrink-0 border-b bg-gray-50">
          <div className="flex">
            <button
              onClick={() => setActiveTab("info")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "info"
                  ? "text-primary-600 border-b-2 border-primary-600 bg-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Thông tin
            </button>
            <button
              onClick={() => setActiveTab("stats")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "stats"
                  ? "text-primary-600 border-b-2 border-primary-600 bg-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Thống kê
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "history"
                  ? "text-primary-600 border-b-2 border-primary-600 bg-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Lịch sử ({redemptions.length})
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {activeTab === "info" && (
            <div className={promotion.type === "product" ? "grid gap-3 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start" : "space-y-3"}>
              {promotion.type === "product" && <PromotionProducts key={promotion.id} productIds={promotion.productIds} />}
              <div className="min-w-0 space-y-2">
              <section aria-label="Thông tin khuyến mãi" className="rounded-lg border border-gray-200 p-3">
                <h3 className="mb-2 text-sm font-semibold text-gray-900">Thông tin khuyến mãi</h3>
                <dl className="space-y-1.5 text-sm [&>div]:grid [&>div]:grid-cols-[8rem_minmax(0,1fr)] [&>div]:items-baseline [&>div]:gap-x-2 [&_dd]:mt-0 [&_dd]:break-words">
                  <div><dt className="text-xs text-gray-500">Loại chương trình</dt><dd className="mt-0.5 font-medium text-gray-900">{{ product: "Theo sản phẩm", event: "Sự kiện", voucher: "Voucher" }[promotion.type] || promotion.type}</dd></div>
                  <div><dt className="text-xs text-gray-500">Giá trị giảm</dt><dd className="mt-0.5 font-bold text-primary-700">{promotion.discountType === "percent" ? `${promotion.value}%` : formatCurrency(promotion.value)}</dd></div>
                  <div><dt className="text-xs text-gray-500">Giảm tối đa</dt><dd className="mt-0.5 font-medium">{promotion.maxDiscount ? formatCurrency(promotion.maxDiscount) : "Không giới hạn"}</dd></div>
                  <div><dt className="text-xs text-gray-500">Ngày bắt đầu</dt><dd className="mt-0.5 font-medium">{formatDate(promotion.startDate)}</dd></div>
                  <div><dt className="text-xs text-gray-500">Ngày kết thúc</dt><dd className="mt-0.5 font-medium">{formatDate(promotion.endDate)}</dd></div>
                  <div><dt className="text-xs text-gray-500">Lượt sử dụng</dt><dd className="mt-0.5 font-medium">{promotion.usedCount || 0} {promotion.type === "voucher" ? "lượt · Mỗi khách tối đa 1 lần" : `/ ${promotion.usageLimit ?? "∞"}`}</dd></div>
                  {promotion.type === "event" && <div><dt className="text-xs text-gray-500">Đơn hàng tối thiểu</dt><dd className="mt-0.5 font-medium">{formatCurrency(promotion.minOrderAmount)}</dd></div>}
                  {promotion.type === "voucher" && <div><dt className="text-xs text-gray-500">Mã voucher</dt><dd className="mt-0.5 break-all font-mono font-semibold">{promotion.voucherCode}</dd></div>}
                  <div><dt className="text-xs text-gray-500">ID khuyến mãi</dt><dd className="mt-0.5 font-medium">#{promotion.id}</dd></div>
                </dl>
              </section>
              {promotion.type === "voucher" && <section aria-label="Phân phối voucher" className="rounded-lg border border-primary-200 bg-primary-50 p-3 text-sm">
                <h3 className="mb-2 font-semibold text-primary-900">Phân phối voucher</h3>
                <dl className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
                  <div><dt className="text-xs text-gray-500">Hình thức</dt><dd>{promotion.visibility === "only-code" ? "Only-code — Nhận bằng mã" : "Public — Hiển thị ở trang Nhận voucher"}</dd></div>
                  <div><dt className="text-xs text-gray-500">Thời gian nhận</dt><dd>{formatDate(promotion.claimStartDate)} — {formatDate(promotion.claimEndDate)}</dd></div>
                  <div><dt className="text-xs text-gray-500">Đã nhận</dt><dd>{promotion.claimedCount || 0} / {promotion.claimLimit ?? "∞"}</dd></div>
                  <div><dt className="text-xs text-gray-500">Cách nhận</dt><dd>{promotion.sendToCustomers ? "Cấp sẵn cho khách hàng hiện có khi tạo." : "Khách tự nhận vào kho."} Mỗi khách nhận và dùng tối đa 1 lần.</dd></div>
                </dl>
              </section>}
              {promotion.description && <section className="rounded-lg bg-gray-50 px-3 py-2"><h3 className="text-xs font-semibold text-gray-500">Mô tả</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700">{promotion.description}</p></section>}
              <dl className="space-y-1 px-1 text-xs text-gray-500">
                <div className="flex gap-1"><dt>Ngày tạo:</dt><dd>{formatDateTime(promotion.createdAt)}</dd></div>
                <div className="flex gap-1"><dt>Cập nhật lần cuối:</dt><dd>{formatDateTime(promotion.updatedAt)}</dd></div>
              </dl>
              </div>
            </div>
          )}
          {activeTab === "stats" && (
            <div>
              {!stats ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                  <p className="mt-3 text-gray-500">Đang tải thống kê...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-primary-50 p-4 rounded-lg">
                      <p className="text-sm text-primary-600 font-medium">Tổng lượt dùng</p>
                      <p className="text-2xl font-bold text-primary-900 mt-1">{stats.totalRedemptions || 0}</p>
                    </div>
                    <div className="bg-emerald-50 p-4 rounded-lg">
                      <p className="text-sm text-emerald-600 font-medium">Tổng giảm giá</p>
                      <p className="text-2xl font-bold text-emerald-900 mt-1">{formatCurrency(stats.totalDiscountAmount || 0)}</p>
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
                    <div key={idx} className="bg-gray-50 p-4 rounded-lg flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-900">Đơn hàng #{item.orderId}</p>
                        <p className="text-sm text-gray-500">{formatDate(item.usedAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-emerald-600">-{formatCurrency(item.discountAmount)}</p>
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
        <div className="shrink-0 border-t px-4 py-3 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
          >
            Đóng
          </button>
          <button
            onClick={() => onEdit(promotion)}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-semibold"
          >
            Chỉnh sửa
          </button>
        </div>
      </div>
    </div>
  );
}
