import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getCategoryById, updateCategory } from "../../api/categoryApi";

export default function CategoryEditModal({ onClose, categoryId, onSave }) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Validation rules
  const validateForm = () => {
    const newErrors = {};

    // Validate Name
    if (!formData.name || formData.name.trim() === "") {
      newErrors.name = "Tên danh mục không được để trống";
    } else if (formData.name.trim().length < 2) {
      newErrors.name = "Tên danh mục phải từ 2 ký tự trở lên";
    } else if (formData.name.length > 191) {
      newErrors.name = "Tên danh mục không được vượt quá 191 ký tự";
    }

    // Validate Description
    if (formData.description && formData.description.trim().length > 500) {
      newErrors.description = "Mô tả không được vượt quá 500 ký tự";
    }

    return newErrors;
  };

  useEffect(() => {
    if (!categoryId) return;

    const fetchCategoryDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getCategoryById(categoryId);
        setFormData({
          name: data.name || "",
          description: data.description || "",
        });
      } catch (err) {
        setError(err.message || "Error loading category details");
      } finally {
        setLoading(false);
      }
    };

    fetchCategoryDetail();
  }, [categoryId]);

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
      const updatedData = await updateCategory(categoryId, formData);
      setSuccessMessage("Cập nhật thông tin danh mục thành công!");
      setErrors({});

      // Gọi callback để cập nhật danh sách
      if (onSave) {
        onSave(updatedData);
      }

      onClose();
    } catch (err) {
      setError(err.message || "Error updating category");
    } finally {
      setSaving(false);
    }
  };

  if (!categoryId) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800">
            Chỉnh Sửa Thông Tin Danh Mục
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

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Mô Tả
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
                  placeholder="Nhập mô tả"
                />
                {errors.description && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.description}
                  </p>
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
