import React, { useState, useEffect } from "react";
import { updatePromotion } from "../../api/promotionApi";
import ProductPickerModal from "../../components/promotions/ProductPickerModal";

export default function PromotionEdit({ promotion, onCancel, onSuccess }) {
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    code: "",
    type: "event",
    discountType: "percent",
    value: "",
    minOrderAmount: "",
    voucherCode: "",
    productIdsText: "",
    maxDiscount: "",
    usageLimit: "",
    startDate: "",
    endDate: "",
    active: true,
    description: "",
    usedCount: 0,
    status: "active",
    voucherCode: "",
    productIds: [],
  });

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showProductPicker, setShowProductPicker] = useState(false);

  useEffect(() => {
    getProductsPaginated(1, 100, "", null, null, null, null, "name_asc", 1)
      .then((data) => setProducts(data.items ?? data.Items ?? []))
      .catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    if (promotion) {
      setFormData({
        id: promotion.id,
        name: promotion.name || "",
        code: promotion.code || "",
        type: promotion.type || "event",
        discountType: promotion.discountType || "percent",
        value: promotion.value,
        minOrderAmount: promotion.minOrderAmount,
        voucherCode: promotion.voucherCode || "",
        productIdsText: (promotion.productIds || []).join(", "),
        maxDiscount: promotion.maxDiscount || "",
        usageLimit: promotion.usageLimit || "",
        startDate: promotion.startDate ? promotion.startDate.split("T")[0] : "",
        endDate: promotion.endDate ? promotion.endDate.split("T")[0] : "",
        active: promotion.active,
        description: promotion.description || "",
        usedCount: promotion.usedCount || 0,
        status: promotion.status || (promotion.active ? "active" : "disabled"),
        voucherCode: promotion.voucherCode || "",
        productIds: promotion.productIds || [],
      });
    }
  }, [promotion]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => {
      const newData = {
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      };
      
      // Xóa giá trị maxDiscount khi chuyển sang loại "fixed"
      return newData;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!formData.name || !formData.value || (formData.type === "event" && !formData.minOrderAmount) || (formData.type === "voucher" && !formData.voucherCode) || (formData.type === "product" && !formData.productIdsText.trim())) {
        throw new Error("Vui lòng điền đầy đủ thông tin bắt buộc");
      }

      const payload = {
        id: formData.id,
        name: formData.name,
        code: formData.code,
        type: formData.type,
        discountType: formData.discountType,
        value: parseFloat(formData.value),
        minOrderAmount: formData.type === "event" ? parseFloat(formData.minOrderAmount || 0) : 0,
        voucherCode: formData.type === "voucher" ? formData.voucherCode.trim().toUpperCase() : null,
        productIds: formData.type === "product" ? formData.productIdsText.split(",").map((id) => Number(id.trim())).filter(Number.isInteger) : [],
        maxDiscount: formData.maxDiscount ? parseFloat(formData.maxDiscount) : null,
        usageLimit: formData.usageLimit ? parseInt(formData.usageLimit) : null,
        startDate: formData.startDate || null,
        endDate: formData.endDate || null,
        active: formData.active,
        status: formData.active ? "active" : "disabled",
        description: formData.description || "",
        usedCount: formData.usedCount,
        voucherCode: formData.voucherCode.trim() || formData.code.toUpperCase(),
        productIds: formData.productIds,
      };

      await updatePromotion(formData.id, payload);
      alert("Cập nhật khuyến mãi thành công!");
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.message || "Có lỗi xảy ra khi cập nhật khuyến mãi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-blue-600 p-6 rounded-t-xl">
          <h2 className="text-2xl font-bold text-white">Chỉnh sửa khuyến mãi</h2>
          <p className="text-white mt-1 font-mono">{formData.code}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex">
                <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="ml-3 text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}

          <div><label className="block text-sm font-medium text-gray-700 mb-2">Tên chương trình</label><input name="name" value={formData.name} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg" required /></div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Nhóm khuyến mãi</label>
            <select
              name="promotionKind"
              value={formData.promotionKind}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="event">Theo đơn hàng</option>
              <option value="voucher">Voucher</option>
              <option value="product">Theo sản phẩm</option>
            </select>
          </div>

          {formData.promotionKind === "voucher" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Mã voucher</label>
              <input
                type="text"
                name="voucherCode"
                value={formData.voucherCode}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
              />
            </div>
          )}

          {formData.promotionKind === "product" && (
            <fieldset className="rounded-lg border border-gray-200 p-4">
              <legend className="px-1 text-sm font-medium text-gray-700">Sản phẩm áp dụng</legend>
              <div className="max-h-40 space-y-2 overflow-y-auto">
                {products.map((product) => (
                  <label key={product.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={formData.productIds.includes(product.id)}
                      onChange={(event) => setFormData((current) => ({
                        ...current,
                        productIds: event.target.checked
                          ? [...current.productIds, product.id]
                          : current.productIds.filter((id) => id !== product.id),
                      }))}
                    />
                    <span>{product.productName ?? product.name} (#{product.id})</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {/* Loại và giá trị */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Loại chương trình <span className="text-red-500">*</span>
              </label>
              <select
                name="type"
                value={formData.type}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="event">Sự kiện</option>
                <option value="voucher">Voucher</option>
                <option value="product">Theo sản phẩm</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Giá trị {formData.discountType === "percent" ? "(%)" : "(VNĐ)"} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="value"
                value={formData.value}
                onChange={handleChange}
                min="0"
                step={formData.discountType === "percent" ? "1" : "1000"}
                max={formData.discountType === "percent" ? "100" : undefined}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>

          <div><label className="block text-sm font-medium text-gray-700 mb-2">Kiểu giảm</label><select name="discountType" value={formData.discountType} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg"><option value="percent">Phần trăm</option><option value="fixed">Số tiền cố định</option></select></div>
          {/* Điều kiện event */}
          {formData.type === "event" && <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Đơn hàng tối thiểu (VNĐ) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="minOrderAmount"
                value={formData.minOrderAmount}
                onChange={handleChange}
                min="0"
                step="1000"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>}
          {formData.type === "voucher" && <div><label className="block text-sm font-medium text-gray-700 mb-2">Mã voucher</label><input name="voucherCode" value={formData.voucherCode} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg" required /></div>}
          {formData.type === "product" && <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Sản phẩm áp dụng <span className="text-red-500">*</span></label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setShowProductPicker(true)} className="rounded-lg border border-blue-600 px-4 py-2 font-medium text-blue-700 hover:bg-blue-50">Chọn sản phẩm</button>
              <span className="text-sm text-gray-600">Đã chọn {formData.productIdsText ? formData.productIdsText.split(",").filter(Boolean).length : 0} sản phẩm</span>
            </div>
          </div>}
          <div><label className="block text-sm font-medium text-gray-700 mb-2">Giảm tối đa (VNĐ, tùy chọn)</label><input type="number" name="maxDiscount" value={formData.maxDiscount} onChange={handleChange} min="0" step="1000" disabled={formData.discountType === "fixed"} className="w-full px-4 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100" /></div>

          {/* Thời gian */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Ngày bắt đầu</label>
              <input
                type="date"
                name="startDate"
                value={formData.startDate}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Ngày kết thúc</label>
              <input
                type="date"
                name="endDate"
                value={formData.endDate}
                onChange={handleChange}
                required
                min={formData.startDate}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Giới hạn sử dụng */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Giới hạn lượt sử dụng <span className="text-gray-500 text-xs">(để trống = không giới hạn)</span>
            </label>
            <input
              type="number"
              name="usageLimit"
              value={formData.usageLimit}
              onChange={handleChange}
              min={formData.usedCount}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Đã sử dụng: {formData.usedCount} lượt
            </p>
          </div>

          {/* Mô tả */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Mô tả</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="3"
              placeholder="Mô tả chi tiết về chương trình khuyến mãi..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Trạng thái */}
          <div className="flex items-center">
            <input
              type="checkbox"
              name="active"
              checked={formData.active}
              onChange={handleChange}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label className="ml-2 block text-sm text-gray-700">Kích hoạt</label>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold"
            >
              {loading ? "Đang cập nhật..." : "Cập nhật"}
            </button>
          </div>
        </form>
      </div>
      {showProductPicker && <ProductPickerModal
        selectedIds={formData.productIdsText.split(",").filter(Boolean).map(Number)}
        onChange={(ids) => setFormData((previous) => ({ ...previous, productIdsText: ids.join(",") }))}
        onClose={() => setShowProductPicker(false)}
      />}
    </div>
  );
}
