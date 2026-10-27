import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { createCategory } from "../../api/categoryApi";

const CategoryAddModal = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [error, setError] = useState("");

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFormData({
        name: "",
        description: "",
      });
      setErrors({});
      setSuccessMessage("");
      setError("");
    }
  }, [isOpen]);

  // Validation function
  const validateForm = () => {
    const newErrors = {};

    // Name validation - Required
    if (!formData.name.trim()) {
      newErrors.name = "Tên danh mục là bắt buộc";
    } else if (formData.name.trim().length < 2) {
      newErrors.name = "Tên danh mục phải có ít nhất 2 ký tự";
    } else if (formData.name.length > 191) {
      newErrors.name = "Tên danh mục không được vượt quá 191 ký tự";
    }

    // Description validation - Optional
    if (formData.description && formData.description.length > 500) {
      newErrors.description = "Mô tả không được vượt quá 500 ký tự";
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
      const categoryData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
      };
      console.log("Sending category data:", categoryData);

      const response = await createCategory(categoryData);
      console.log("Response:", response);

      if (response) {
        setSuccessMessage("Thêm danh mục thành công!");
        setErrors({});

        // Reset form
        setFormData({
          name: "",
          description: "",
        });

        onSuccess?.();
        onClose();
      }
    } catch (err) {
      console.error("Error creating category:", err);
      setError(err.message || "Lỗi khi thêm danh mục");
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
            Thêm Danh Mục Mới
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
            id="category-add-form"
            onSubmit={handleSubmit}
            className="space-y-6"
          >
            {/* Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Tên Danh Mục <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 transition ${
                  errors.name
                    ? "border-red-500 bg-red-50 focus:ring-red-500"
                    : "border-gray-300 focus:ring-primary-500"
                }`}
                placeholder="Nhập tên danh mục"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600">{errors.name}</p>
              )}
            </div>

            {/* Description (Optional) */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Mô Tả{" "}
                <span className="text-gray-400 text-xs">(Không bắt buộc)</span>
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows="4"
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 transition ${
                  errors.description
                    ? "border-red-500 bg-red-50 focus:ring-red-500"
                    : "border-gray-300 focus:ring-primary-500"
                }`}
                placeholder="Nhập mô tả (nếu có)"
              />
              {errors.description && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.description}
                </p>
              )}
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
            form="category-add-form"
            disabled={loading}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
          >
            {loading ? "Đang thêm..." : "Thêm Danh Mục"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CategoryAddModal;
