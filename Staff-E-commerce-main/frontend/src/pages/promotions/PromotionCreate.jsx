import React, { useEffect, useState } from "react";
import { createPromotion } from "../../api/promotionApi";

export default function PromotionCreate({ onCancel, onSuccess }) {
  const [formData, setFormData] = useState({
    name: "",
    type: "event",
    discountType: "percent",
    value: "",
    minOrderAmount: "",
    voucherCode: "",
    productIdsText: "",
    maxDiscount: "",
    usageLimit: "",
    description: "",
    startDate: "",
    endDate: "",
    active: true,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    fetch("/api/products/available?page=1&pageSize=100")
      .then((res) => res.ok ? res.json() : Promise.reject(new Error("Không tải được danh sách sản phẩm")))
      .then((data) => setProducts(data.items || []))
      .catch((err) => setError(err.message));
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => {
      const newData = {
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      };
      
      return newData;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Validate
      if (!formData.name || !formData.value || (formData.type === "event" && !formData.minOrderAmount) || (formData.type === "voucher" && !formData.voucherCode) || (formData.type === "product" && !formData.productIdsText.trim())) {
        throw new Error("Vui lòng điền đầy đủ thông tin bắt buộc");
      }

      // Convert to proper types
      const payload = {
        name: formData.name,
        type: formData.type,
        discountType: formData.discountType,
        value: parseFloat(formData.value),
        minOrderAmount: formData.type === "event" ? parseFloat(formData.minOrderAmount || 0) : 0,
        voucherCode: formData.type === "voucher" ? formData.voucherCode.trim().toUpperCase() : null,
        productIds: formData.type === "product" ? formData.productIdsText.split(",").map((id) => Number(id.trim())).filter(Number.isInteger) : [],
        maxDiscount: formData.maxDiscount ? parseFloat(formData.maxDiscount) : null,
        usageLimit: formData.usageLimit ? parseInt(formData.usageLimit) : null,
        description: formData.description || "",
        startDate: formData.startDate || null,
        endDate: formData.endDate || null,
        active: formData.active,
        status: formData.active ? "active" : "disabled",
      };

      await createPromotion(payload);
      alert("Tạo khuyến mãi thành công!");
      if (onSuccess) onSuccess();
    } catch (err) {
      let errorMessage = err.message || "Có lỗi xảy ra khi tạo khuyến mãi";
      
      if (errorMessage.toLowerCase().includes('already exists')) errorMessage = "Mã voucher đã tồn tại. Vui lòng chọn mã khác.";
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-blue-600 p-6 rounded-t-xl">
          <h2 className="text-2xl font-bold text-white">Tạo mã khuyến mãi mới</h2>
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

          {/* Mã khuyến mãi */}
          <div><label className="block text-sm font-medium text-gray-700 mb-2">Tên chương trình *</label><input name="name" value={formData.name} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg" required /></div>
          {formData.type !== "voucher" && <p className="text-sm text-gray-500">Mã nội bộ sẽ được hệ thống tạo tự động. Chỉ voucher mới có mã khách hàng nhập.</p>}

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
          {/* Điều kiện theo loại chương trình */}
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
          {formData.type === "product" && <div><label className="block text-sm font-medium text-gray-700 mb-2">Sản phẩm áp dụng</label><div className="max-h-40 overflow-y-auto rounded-lg border p-3 space-y-2">{products.map((product) => { const selected = formData.productIdsText.split(",").map((id) => id.trim()).includes(String(product.id)); return <label key={product.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected} onChange={(e) => { const ids = formData.productIdsText.split(",").map((id) => id.trim()).filter(Boolean); const next = e.target.checked ? [...ids, String(product.id)] : ids.filter((id) => id !== String(product.id)); setFormData((prev) => ({ ...prev, productIdsText: next.join(",") })); }} /><span>{product.name} (#{product.id})</span></label>; })}{products.length === 0 && <p className="text-sm text-gray-500">Không có sản phẩm để chọn.</p>}</div></div>}
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
              min="0"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
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
            <label className="ml-2 block text-sm text-gray-700">Kích hoạt ngay</label>
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
              {loading ? "Đang tạo..." : "Tạo khuyến mãi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
