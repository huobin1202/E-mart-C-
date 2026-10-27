import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getCustomerById, updateCustomer } from "../../api/customerApi";

export default function CustomerEditModal({ onClose, customerId, onSave }) {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    address: "",
    dateOfBirth: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Validation rules - sử dụng regex từ backend
  const validateForm = () => {
    const newErrors = {};

    // Validate Full Name - Bắt buộc
    if (!formData.fullName || formData.fullName.trim() === "") {
      newErrors.fullName = "Tên khách hàng không được để trống";
    } else {
      const fullNameRegex =
        /^[a-zA-Z\sÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂưăạảấầẩẫậắằẳẵặẹẻẽềềểỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪễệỉịọỏốồổỗộớờởỡợụủứừỬỮỰỲỴÝỶỸửữựỳỵỷỹ]+$/;

      if (!fullNameRegex.test(formData.fullName.trim())) {
        newErrors.fullName =
          "Tên khách hàng chỉ được chứa chữ cái, khoảng trắng";
      } else if (formData.fullName.trim().length < 3) {
        newErrors.fullName = "Tên khách hàng phải từ 3 ký tự trở lên";
      } else if (formData.fullName.length > 150) {
        newErrors.fullName = "Tên khách hàng không được vượt quá 150 ký tự";
      }
    }

    // Validate Email - Optional
    if (formData.email && formData.email.trim() !== "") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        newErrors.email = "Email không hợp lệ";
      } else if (formData.email.length > 255) {
        newErrors.email = "Email không được vượt quá 255 ký tự";
      }
    }

    // Validate Phone - Optional, regex: (0 hoặc +84) + [35789] + 8 chữ số
    if (formData.phone && formData.phone.trim() !== "") {
      const phoneRegex = /^(0|\+84)[35789]\d{8}$/;
      if (!phoneRegex.test(formData.phone.trim())) {
        newErrors.phone =
          "Số điện thoại phải bắt đầu bằng 0 hoặc +84, theo sau bởi 3, 5, 7, 8 hoặc 9, và có 8 chữ số sau đó";
      }
    }

    // Validate Address
    if (formData.address && formData.address.trim().length > 500) {
      newErrors.address = "Địa chỉ không được vượt quá 500 ký tự";
    }

    return newErrors;
  };

  useEffect(() => {
    if (!customerId) return;

    const fetchCustomerDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getCustomerById(customerId);
        setFormData({
          fullName: data.fullName || "",
          email: data.email || "",
          phone: data.phone || "",
          address: data.address || "",
          dateOfBirth: data.dateOfBirth ? data.dateOfBirth.slice(0, 10) : "",
        });
      } catch (err) {
        setError(err.message || "Error loading customer details");
      } finally {
        setLoading(false);
      }
    };

    fetchCustomerDetail();
  }, [customerId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: undefined,
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving || loading) return;

    // Validate form first
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    setErrors({});

    try {
      const updatedData = await updateCustomer(customerId, formData);
      setSuccessMessage("Cập nhật thông tin khách hàng thành công!");
      setErrors({});

      // Gọi callback để cập nhật danh sách
      if (onSave) {
        onSave(updatedData);
      }

      onClose();
    } catch (err) {
      setError(err.message || "Error updating customer");
    } finally {
      setSaving(false);
    }
  };

  if (!customerId) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800">
            Chỉnh Sửa Thông Tin Khách Hàng
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition"
          >
            <X size={24} className="text-gray-600" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">
              <p className="text-gray-500">Đang tải...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800">{error}</p>
                </div>
              )}

              {successMessage && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <p className="text-emerald-800">{successMessage}</p>
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Ngày sinh</label>
                <input type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Tên Khách Hàng <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  required
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 transition ${
                    errors.fullName
                      ? "border-red-500 bg-red-50 focus:ring-red-500"
                      : "border-gray-300 focus:ring-primary-500"
                  }`}
                  placeholder="Nhập tên khách hàng"
                />
                {errors.fullName && (
                  <p className="mt-1 text-sm text-red-600">{errors.fullName}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 transition ${
                    errors.email
                      ? "border-red-500 bg-red-50 focus:ring-red-500"
                      : "border-gray-300 focus:ring-primary-500"
                  }`}
                  placeholder="Nhập email"
                />
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Số Điện Thoại
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 transition ${
                    errors.phone
                      ? "border-red-500 bg-red-50 focus:ring-red-500"
                      : "border-gray-300 focus:ring-primary-500"
                  }`}
                  placeholder="Nhập số điện thoại"
                />
                {errors.phone && (
                  <p className="mt-1 text-sm text-red-600">{errors.phone}</p>
                )}
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Địa Chỉ
                </label>
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  rows="3"
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 transition ${
                    errors.address
                      ? "border-red-500 bg-red-50 focus:ring-red-500"
                      : "border-gray-300 focus:ring-primary-500"
                  }`}
                  placeholder="Nhập địa chỉ"
                />
                {errors.address && (
                  <p className="mt-1 text-sm text-red-600">{errors.address}</p>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
            disabled={saving}
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || loading}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
          >
            {saving ? "Đang lưu..." : "Lưu Thay Đổi"}
          </button>
        </div>
      </div>
    </div>
  );
}
