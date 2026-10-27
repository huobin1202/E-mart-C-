import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { createCustomer } from "../../api/customerApi";

const CustomerAddModal = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    address: "",
    dateOfBirth: "",
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [error, setError] = useState("");

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFormData({
        fullName: "",
        email: "",
        phone: "",
        address: "",
        dateOfBirth: "",
      });
      setErrors({});
      setSuccessMessage("");
      setError("");
    }
  }, [isOpen]);

  // Validation function - sử dụng regex từ backend
  const validateForm = () => {
    const newErrors = {};

    // Full Name validation - Bắt buộc
    if (!formData.fullName.trim()) {
      newErrors.fullName = "Tên khách hàng là bắt buộc";
    } else {
      // Regex: cho phép chữ cái (Latin + tiếng Việt), khoảng trắng và dấu nháy đơn
      const fullNameRegex =
        /^[a-zA-Z\sÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂưăạảấầẩẫậắằẳẵặẹẻẽềềểỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪễệỉịọỏốồổỗộớờởỡợụủứừỬỮỰỲỴÝỶỸửữựỳỵỷỹ]+$/;

      if (!fullNameRegex.test(formData.fullName.trim())) {
        newErrors.fullName =
          "Tên khách hàng chỉ được chứa chữ cái, khoảng trắng";
      } else if (formData.fullName.length > 150) {
        newErrors.fullName = "Tên khách hàng không được vượt quá 150 ký tự";
      } else if (formData.fullName.trim().length < 3) {
        newErrors.fullName = "Tên khách hàng phải có ít nhất 3 ký tự";
      }
    }

    // Phone validation - Bắt buộc, regex: (0 hoặc +84) + [35789] + 8 chữ số
    if (!formData.phone.trim()) {
      newErrors.phone = "Số điện thoại là bắt buộc";
    } else {
      const phoneRegex = /^(0|\+84)[35789]\d{8}$/;
      if (!phoneRegex.test(formData.phone.trim())) {
        newErrors.phone =
          "Số điện thoại phải bắt đầu bằng 0 hoặc +84, theo sau bởi 3, 5, 7, 8 hoặc 9, và có 8 chữ số sau đó";
      }
    }

    return newErrors;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setSuccessMessage("");

    // Validate form
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      console.log("Validation errors:", validationErrors);
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    try {
      const customerData = {
        fullName: formData.fullName.trim(),
        email: formData.email.trim() || null,
        phone: formData.phone.trim(),
        address: formData.address.trim() || null,
        dateOfBirth: formData.dateOfBirth || null,
      };
      console.log("Sending customer data:", customerData);

      const response = await createCustomer(customerData);
      console.log("Response:", response);

      if (response) {
        setSuccessMessage("Thêm khách hàng thành công!");
        setErrors({});

        // Reset form
        setFormData({
          fullName: "",
          email: "",
          phone: "",
          address: "",
          dateOfBirth: "",
        });

        onSuccess?.();
        onClose();
      }
    } catch (err) {
      console.error("Error creating customer:", err);
      setError(err.message || "Lỗi khi thêm khách hàng");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800">
            Thêm Khách Hàng Mới
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
          {successMessage && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
              <p className="text-emerald-800">{successMessage}</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          <form
            id="customer-add-form"
            onSubmit={handleSubmit}
            className="space-y-6"
          >
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

            {/* Phone */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Số Điện Thoại <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                required
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 transition ${
                  errors.phone
                    ? "border-red-500 bg-red-50 focus:ring-red-500"
                    : "border-gray-300 focus:ring-primary-500"
                }`}
                placeholder="Nhập số điện thoại (VD: 0812345678 hoặc +84812345678)"
              />
              {errors.phone && (
                <p className="mt-1 text-sm text-red-600">{errors.phone}</p>
              )}
            </div>

            {/* Email (Optional) */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email{" "}
                <span className="text-gray-400 text-xs">(Không bắt buộc)</span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Nhập email (nếu có)"
              />
            </div>

            {/* Address (Optional) */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Địa Chỉ{" "}
                <span className="text-gray-400 text-xs">(Không bắt buộc)</span>
              </label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleChange}
                rows="3"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Nhập địa chỉ (nếu có)"
              />
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
            disabled={loading}
          >
            Hủy
          </button>
          <button
            type="submit"
            form="customer-add-form"
            disabled={loading}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
          >
            {loading ? "Đang thêm..." : "Thêm Khách Hàng"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomerAddModal;
