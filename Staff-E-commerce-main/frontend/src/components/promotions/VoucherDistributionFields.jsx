export default function VoucherDistributionFields({ formData, onChange, editing = false, claimedCount = 0 }) {
  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100";
  return <fieldset className="min-w-0 space-y-3 rounded-lg border border-primary-200 bg-primary-50/40 p-3">
    <legend className="px-2 text-sm font-semibold text-primary-900">Phát hành voucher</legend>
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="voucher-visibility">Hình thức</label>
      <select id="voucher-visibility" name="visibility" value={formData.visibility} onChange={onChange} disabled={editing && (claimedCount > 0 || formData.sendToCustomers)} className={inputClass}>
        <option value="public">Public — Hiển thị ở trang Nhận voucher</option>
        <option value="only-code">Only-code — Chỉ nhận bằng cách nhập mã</option>
      </select>
      <p className="mt-1 text-sm text-gray-500">{formData.visibility === "only-code" ? "Không xuất hiện ở trang săn voucher. Khách nhập mã vào Kho voucher để nhận." : "Khách bấm Lưu mã ở trang Nhận voucher để thêm vào kho."}</p>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="voucher-claim-end">Ngày kết thúc nhận *</label>
        <input id="voucher-claim-end" type="date" name="claimEndDate" value={formData.claimEndDate} min={formData.startDate} max={formData.endDate || undefined} onChange={onChange} required className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="voucher-claim-limit">Tổng số voucher cho phép nhận *</label>
        <input id="voucher-claim-limit" type="number" name="claimLimit" value={formData.claimLimit} min={Math.max(1, claimedCount)} step="1" onChange={onChange} required className={inputClass} />
        <p className="mt-1 text-sm text-gray-500">Mỗi khách nhận và dùng tối đa 1 lần.{editing && ` Đã nhận: ${claimedCount}.`}</p>
      </div>
    </div>
    {!editing ? <label className="flex items-start gap-2 text-sm text-gray-700">
      <input type="checkbox" name="sendToCustomers" checked={formData.visibility === "public" && formData.sendToCustomers} disabled={formData.visibility !== "public"} onChange={onChange} className="mt-1 h-4 w-4" />
      <span><strong>Sent to customer</strong> — Cấp sẵn vào kho của tất cả khách hàng hiện có.
        <span className="mt-1 block text-sm text-gray-500">Tính vào giới hạn nhận. Khách đăng ký sau tự lưu mã. Với ngày bắt đầu trong tương lai, voucher được cấp sẵn và chờ đến ngày sử dụng.</span>
      </span>
    </label> : <p className="text-sm text-gray-600">{formData.sendToCustomers ? "Đã chọn cấp sẵn cho khách hàng khi tạo." : "Khách tự nhận mã vào kho."} Chỉnh sửa không phát lại voucher.</p>}
  </fieldset>;
}
