import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getCategoryById } from "../../api/categoryApi";

export default function CategoryDetailModal({ categoryId, onClose }) {
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!categoryId) return;

    const fetchCategoryDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getCategoryById(categoryId);
        setCategory(data);
      } catch (err) {
        setError(err.message || "Error loading category details");
      } finally {
        setLoading(false);
      }
    };

    fetchCategoryDetail();
  }, [categoryId]);

  if (!categoryId) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800">
            Chi Tiết Danh Mục
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
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error}</p>
            </div>
          ) : category ? (
            <div className="space-y-4">
              {/* ID */}
              <div className="flex">
                <span className="font-semibold text-gray-700 w-40">ID:</span>
                <span className="text-gray-600">{category.id}</span>
              </div>

              {/* Name */}
              <div className="flex">
                <span className="font-semibold text-gray-700 w-40">
                  Tên Danh Mục:
                </span>
                <span className="text-gray-600">{category.name}</span>
              </div>

              {/* Slug */}
              <div className="flex">
                <span className="font-semibold text-gray-700 w-40">Slug:</span>
                <span className="text-gray-600">{category.slug || "-"}</span>
              </div>

              {/* Description */}
              <div className="flex">
                <span className="font-semibold text-gray-700 w-40">Mô Tả:</span>
                <span className="text-gray-600">
                  {category.description || "-"}
                </span>
              </div>

              {/* Status */}
              <div className="flex">
                <span className="font-semibold text-gray-700 w-40">
                  Trạng Thái:
                </span>
                <span>
                  {category.isActive ? (
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-sm font-semibold">
                      Hoạt Động
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-semibold">
                      Ngừng Hoạt Động
                    </span>
                  )}
                </span>
              </div>

              {/* Created At */}
              <div className="flex">
                <span className="font-semibold text-gray-700 w-40">
                  Ngày Tạo:
                </span>
                <span className="text-gray-600">
                  {category.createdAt
                    ? new Date(category.createdAt).toLocaleString("vi-VN")
                    : "-"}
                </span>
              </div>

              {/* Updated At */}
              <div className="flex">
                <span className="font-semibold text-gray-700 w-40">
                  Cập Nhật Lần Cuối:
                </span>
                <span className="text-gray-600">
                  {category.updatedAt
                    ? new Date(category.updatedAt).toLocaleString("vi-VN")
                    : "-"}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
