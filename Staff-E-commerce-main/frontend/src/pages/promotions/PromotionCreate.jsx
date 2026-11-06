import React, { useState } from "react";
import { createPromotion } from "../../api/promotionApi";
import ProductPickerModal from "../../components/promotions/ProductPickerModal";
import VoucherDistributionFields from "../../components/promotions/VoucherDistributionFields";
import ModalShell from "../../components/ui/ModalShell";
import { Field, FormError, FormSection } from "../../components/promotions/PromotionFormParts";

export default function PromotionCreate({ onCancel, onSuccess }) {
  const [formData, setFormData] = useState({
    name: "",
    type: "event",
    discountType: "percent",
    value: "",
    minOrderAmount: "",
    voucherCode: "",
    visibility: "public",
    sendToCustomers: false,
    claimEndDate: "",
    claimLimit: "",
    maxDiscount: "",
    usageLimit: "",
    description: "",
    startDate: "",
    endDate: "",
    active: true,
    productIds: [],
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showProductPicker, setShowProductPicker] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => {
      const newData = {
        ...prev,
        [name]: type === "checkbox" ? checked : value,
        ...(name === "visibility" && value === "only-code" ? { sendToCustomers: false } : {}),
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
      if (!formData.name || !formData.value || (formData.type === "event" && !formData.minOrderAmount) || (formData.type === "voucher" && !formData.voucherCode.trim()) || (formData.type === "product" && formData.productIds.length === 0)) {
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
        productIds: formData.type === "product" ? formData.productIds : [],
        maxDiscount: formData.maxDiscount ? parseFloat(formData.maxDiscount) : null,
        usageLimit: formData.type !== "voucher" && formData.usageLimit ? parseInt(formData.usageLimit) : null,
        visibility: formData.visibility,
        sendToCustomers: formData.type === "voucher" && formData.visibility === "public" && formData.sendToCustomers,
        claimStartDate: formData.type === "voucher" ? formData.startDate : null,
        claimEndDate: formData.type === "voucher" ? formData.claimEndDate : null,
        claimLimit: formData.type === "voucher" ? Number(formData.claimLimit) : null,
        description: formData.description || "",
        startDate: formData.startDate || null,
        endDate: formData.endDate || null,
        active: formData.type === "voucher" || formData.active,
        status: formData.type === "voucher" || formData.active ? "active" : "disabled",
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

  const inputClass = "w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100";
  const formId = "promotion-create-form";

  return (
    <>
      <ModalShell
        title="Tạo khuyến mãi mới"
        subtitle={formData.type !== "voucher" ? "Mã nội bộ sẽ được hệ thống tạo tự động. Chỉ voucher mới có mã khách hàng nhập." : undefined}
        onClose={loading ? undefined : onCancel}
        closeOnBackdrop={false}
        busy={loading}
        size="2xl"
        footer={<>
          <button type="button" onClick={onCancel} disabled={loading} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50">Hủy</button>
          <button type="submit" form={formId} disabled={loading} className="rounded-lg bg-primary-600 px-5 py-2 font-semibold text-white hover:bg-primary-700 disabled:opacity-50">{loading ? "Đang tạo..." : "Tạo khuyến mãi"}</button>
        </>}
      >
        <form id={formId} onSubmit={handleSubmit}>
          <FormError message={error} />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="space-y-3">
              <FormSection title="Thông tin chung">
                <Field label="Tên chương trình *" htmlFor="promo-name">
                  <input id="promo-name" name="name" value={formData.name} onChange={handleChange} className={inputClass} required />
                </Field>
                <Field label={<>Loại chương trình <span className="text-red-500">*</span></>} htmlFor="promo-type">
                  <select id="promo-type" name="type" value={formData.type} onChange={handleChange} className={inputClass}>
                    <option value="event">Sự kiện</option>
                    <option value="voucher">Voucher</option>
                    <option value="product">Theo sản phẩm</option>
                  </select>
                </Field>
                <Field label="Mô tả" htmlFor="promo-description">
                  <textarea id="promo-description" name="description" value={formData.description} onChange={handleChange} rows="2"
                    placeholder="Mô tả chi tiết về chương trình khuyến mãi..." className={inputClass} />
                </Field>
              </FormSection>

              <FormSection title="Giá trị ưu đãi">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Kiểu giảm" htmlFor="promo-discount-type">
                    <select id="promo-discount-type" name="discountType" value={formData.discountType} onChange={handleChange} className={inputClass}>
                      <option value="percent">Phần trăm</option>
                      <option value="fixed">Số tiền cố định</option>
                    </select>
                  </Field>
                  <Field label={<>Giá trị {formData.discountType === "percent" ? "(%)" : "(VNĐ)"} <span className="text-red-500">*</span></>} htmlFor="promo-value">
                    <input id="promo-value" type="number" name="value" value={formData.value} onChange={handleChange} min="0"
                      step={formData.discountType === "percent" ? "1" : "1000"} max={formData.discountType === "percent" ? "100" : undefined}
                      className={inputClass} required />
                  </Field>
                  <Field label="Giảm tối đa (VNĐ, tùy chọn)" htmlFor="promo-max-discount" className="sm:col-span-2">
                    <input id="promo-max-discount" type="number" name="maxDiscount" value={formData.maxDiscount} onChange={handleChange} min="0" step="1000"
                      disabled={formData.discountType === "fixed"} className={inputClass} />
                  </Field>
                </div>
              </FormSection>
            </div>

            <div className="space-y-3">
              <FormSection title="Điều kiện áp dụng">
                {formData.type === "event" && <Field label={<>Đơn hàng tối thiểu (VNĐ) <span className="text-red-500">*</span></>} htmlFor="promo-min-order">
                  <input id="promo-min-order" type="number" name="minOrderAmount" value={formData.minOrderAmount} onChange={handleChange} min="0" step="1000" className={inputClass} required />
                </Field>}
                {formData.type === "voucher" && <Field label="Mã voucher" htmlFor="promo-voucher-code">
                  <input id="promo-voucher-code" name="voucherCode" value={formData.voucherCode} onChange={handleChange} className={inputClass} required />
                </Field>}
                {formData.type === "product" && <Field label={<>Sản phẩm áp dụng <span className="text-red-500">*</span></>}>
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => setShowProductPicker(true)} className="rounded-lg border border-primary-600 px-4 py-2 font-medium text-primary-700 hover:bg-primary-50">Chọn sản phẩm</button>
                    <span className="text-sm text-gray-600">Đã chọn {formData.productIds.length} sản phẩm</span>
                  </div>
                </Field>}
              </FormSection>

              <FormSection title="Thời hạn">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={formData.type === "voucher" ? "Ngày bắt đầu nhận / sử dụng" : "Ngày bắt đầu"} htmlFor="promo-start">
                    <input id="promo-start" type="date" name="startDate" value={formData.startDate} onChange={handleChange} required className={inputClass} />
                  </Field>
                  <Field label={formData.type === "voucher" ? "Ngày hết hạn sử dụng" : "Ngày kết thúc"} htmlFor="promo-end">
                    <input id="promo-end" type="date" name="endDate" value={formData.endDate} onChange={handleChange} required min={formData.startDate} className={inputClass} />
                  </Field>
                </div>
              </FormSection>

              {formData.type === "voucher" ? <VoucherDistributionFields formData={formData} onChange={handleChange} /> : <FormSection title="Số lượng và trạng thái">
                <Field label={<>Giới hạn lượt sử dụng <span className="text-sm font-normal text-gray-500">(để trống = không giới hạn)</span></>} htmlFor="promo-usage-limit">
                  <input id="promo-usage-limit" type="number" name="usageLimit" value={formData.usageLimit} onChange={handleChange} min="0" className={inputClass} />
                </Field>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" name="active" checked={formData.active} onChange={handleChange} className="h-4 w-4 rounded border-gray-300" />
                  Kích hoạt ngay
                </label>
              </FormSection>}
            </div>
          </div>
        </form>
      </ModalShell>
      {showProductPicker && <ProductPickerModal
        selectedIds={formData.productIds}
        onChange={(productIds) => setFormData((previous) => ({ ...previous, productIds }))}
        startDate={formData.startDate}
        endDate={formData.endDate}
        onClose={() => setShowProductPicker(false)}
      />}
    </>
  );
}
