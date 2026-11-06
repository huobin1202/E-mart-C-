import React, { useState, useEffect } from "react";
import { updatePromotion } from "../../api/promotionApi";
import ProductPickerModal from "../../components/promotions/ProductPickerModal";
import VoucherDistributionFields from "../../components/promotions/VoucherDistributionFields";
import ModalShell from "../../components/ui/ModalShell";
import { Field, FormError, FormSection } from "../../components/promotions/PromotionFormParts";

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
    visibility: "public",
    sendToCustomers: false,
    claimEndDate: "",
    claimLimit: "",
    productIdsText: "",
    maxDiscount: "",
    usageLimit: "",
    startDate: "",
    endDate: "",
    active: true,
    description: "",
    usedCount: 0,
    status: "active",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showProductPicker, setShowProductPicker] = useState(false);

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
        visibility: promotion.visibility || "public",
        sendToCustomers: promotion.sendToCustomers || false,
        claimEndDate: (promotion.claimEndDate || promotion.endDate || "").split("T")[0],
        claimLimit: promotion.claimLimit ?? "",
        productIdsText: (promotion.productIds || []).join(", "),
        maxDiscount: promotion.maxDiscount || "",
        usageLimit: promotion.usageLimit || "",
        startDate: promotion.startDate ? promotion.startDate.split("T")[0] : "",
        endDate: promotion.endDate ? promotion.endDate.split("T")[0] : "",
        active: promotion.active,
        description: promotion.description || "",
        usedCount: promotion.usedCount || 0,
        status: promotion.status || (promotion.active ? "active" : "disabled"),
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
        usageLimit: formData.type !== "voucher" && formData.usageLimit ? parseInt(formData.usageLimit) : null,
        visibility: formData.visibility,
        sendToCustomers: formData.sendToCustomers,
        claimStartDate: formData.type === "voucher" ? formData.startDate : null,
        claimEndDate: formData.type === "voucher" ? formData.claimEndDate : null,
        claimLimit: formData.type === "voucher" ? Number(formData.claimLimit) : null,
        startDate: formData.startDate || null,
        endDate: formData.endDate || null,
        active: formData.active,
        status: formData.active ? "active" : "disabled",
        description: formData.description || "",
        usedCount: formData.usedCount,
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

  const inputClass = "w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100";
  const formId = "promotion-edit-form";

  return (
    <>
      <ModalShell
        title="Chỉnh sửa khuyến mãi"
        subtitle={formData.code ? <span className="font-mono">{formData.code}</span> : undefined}
        onClose={loading ? undefined : onCancel}
        closeOnBackdrop={false}
        busy={loading}
        size="2xl"
        footer={<>
          <button type="button" onClick={onCancel} disabled={loading} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50">Hủy</button>
          <button type="submit" form={formId} disabled={loading} className="rounded-lg bg-primary-600 px-5 py-2 font-semibold text-white hover:bg-primary-700 disabled:opacity-50">{loading ? "Đang cập nhật..." : "Cập nhật"}</button>
        </>}
      >
        <form id={formId} onSubmit={handleSubmit}>
          <FormError message={error} />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="space-y-3">
              <FormSection title="Thông tin chung">
                <Field label="Tên chương trình" htmlFor="promo-edit-name">
                  <input id="promo-edit-name" name="name" value={formData.name} onChange={handleChange} className={inputClass} required />
                </Field>
                <Field label={<>Loại chương trình <span className="text-red-500">*</span></>} htmlFor="promo-edit-type">
                  <select id="promo-edit-type" name="type" value={formData.type} onChange={handleChange} className={inputClass}>
                    <option value="event">Sự kiện</option>
                    <option value="voucher">Voucher</option>
                    <option value="product">Theo sản phẩm</option>
                  </select>
                </Field>
                <Field label="Mô tả" htmlFor="promo-edit-description">
                  <textarea id="promo-edit-description" name="description" value={formData.description} onChange={handleChange} rows="2"
                    placeholder="Mô tả chi tiết về chương trình khuyến mãi..." className={inputClass} />
                </Field>
              </FormSection>

              <FormSection title="Giá trị ưu đãi">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Kiểu giảm" htmlFor="promo-edit-discount-type">
                    <select id="promo-edit-discount-type" name="discountType" value={formData.discountType} onChange={handleChange} className={inputClass}>
                      <option value="percent">Phần trăm</option>
                      <option value="fixed">Số tiền cố định</option>
                    </select>
                  </Field>
                  <Field label={<>Giá trị {formData.discountType === "percent" ? "(%)" : "(VNĐ)"} <span className="text-red-500">*</span></>} htmlFor="promo-edit-value">
                    <input id="promo-edit-value" type="number" name="value" value={formData.value} onChange={handleChange} min="0"
                      step={formData.discountType === "percent" ? "1" : "1000"} max={formData.discountType === "percent" ? "100" : undefined}
                      className={inputClass} required />
                  </Field>
                  <Field label="Giảm tối đa (VNĐ, tùy chọn)" htmlFor="promo-edit-max-discount" className="sm:col-span-2">
                    <input id="promo-edit-max-discount" type="number" name="maxDiscount" value={formData.maxDiscount} onChange={handleChange} min="0" step="1000"
                      disabled={formData.discountType === "fixed"} className={inputClass} />
                  </Field>
                </div>
              </FormSection>
            </div>

            <div className="space-y-3">
              <FormSection title="Điều kiện áp dụng">
                {formData.type === "event" && <Field label={<>Đơn hàng tối thiểu (VNĐ) <span className="text-red-500">*</span></>} htmlFor="promo-edit-min-order">
                  <input id="promo-edit-min-order" type="number" name="minOrderAmount" value={formData.minOrderAmount} onChange={handleChange} min="0" step="1000" className={inputClass} required />
                </Field>}
                {formData.type === "voucher" && <Field label="Mã voucher" htmlFor="promo-edit-voucher-code">
                  <input id="promo-edit-voucher-code" name="voucherCode" value={formData.voucherCode} onChange={handleChange} className={inputClass} required />
                </Field>}
                {formData.type === "product" && <Field label={<>Sản phẩm áp dụng <span className="text-red-500">*</span></>}>
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => setShowProductPicker(true)} className="rounded-lg border border-primary-600 px-4 py-2 font-medium text-primary-700 hover:bg-primary-50">Chọn sản phẩm</button>
                    <span className="text-sm text-gray-600">Đã chọn {formData.productIdsText ? formData.productIdsText.split(",").filter(Boolean).length : 0} sản phẩm</span>
                  </div>
                </Field>}
              </FormSection>

              <FormSection title="Thời hạn">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={formData.type === "voucher" ? "Ngày bắt đầu nhận / sử dụng" : "Ngày bắt đầu"} htmlFor="promo-edit-start">
                    <input id="promo-edit-start" type="date" name="startDate" value={formData.startDate} onChange={handleChange} required className={inputClass} />
                  </Field>
                  <Field label={formData.type === "voucher" ? "Ngày hết hạn sử dụng" : "Ngày kết thúc"} htmlFor="promo-edit-end">
                    <input id="promo-edit-end" type="date" name="endDate" value={formData.endDate} onChange={handleChange} required min={formData.startDate} className={inputClass} />
                  </Field>
                </div>
              </FormSection>

              {formData.type === "voucher" && <VoucherDistributionFields formData={formData} onChange={handleChange} editing claimedCount={promotion.claimedCount || 0} />}
              <FormSection title="Số lượng và trạng thái">
                {formData.type !== "voucher" && <Field label={<>Giới hạn lượt sử dụng <span className="text-sm font-normal text-gray-500">(để trống = không giới hạn)</span></>} htmlFor="promo-edit-usage-limit"
                  hint={`Đã sử dụng: ${formData.usedCount} lượt`}>
                  <input id="promo-edit-usage-limit" type="number" name="usageLimit" value={formData.usageLimit} onChange={handleChange} min={formData.usedCount} className={inputClass} />
                </Field>}
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" name="active" checked={formData.active} onChange={handleChange} className="h-4 w-4 rounded border-gray-300" />
                  Kích hoạt
                </label>
              </FormSection>
            </div>
          </div>
        </form>
      </ModalShell>
      {showProductPicker && <ProductPickerModal
        selectedIds={formData.productIdsText.split(",").filter(Boolean).map(Number)}
        onChange={(ids) => setFormData((previous) => ({ ...previous, productIdsText: ids.join(",") }))}
        startDate={formData.startDate}
        endDate={formData.endDate}
        excludePromotionId={formData.id}
        onClose={() => setShowProductPicker(false)}
      />}
    </>
  );
}
