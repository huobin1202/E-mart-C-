import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getCustomerById } from "../../api/customerApi";

export default function CustomerDetailModal({ onClose, customerId }) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!customerId) return;

    const fetchCustomerDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getCustomerById(customerId);
        setCustomer(data);
      } catch (err) {
        setError(err.message || "Error loading customer details");
      } finally {
        setLoading(false);
      }
    };

    fetchCustomerDetail();
  }, [customerId]);

  if (!customerId) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800">
            Chi Tiết Khách Hàng
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
              <p className="text-red-800">Lỗi: {error}</p>
            </div>
          ) : customer ? (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1">
                    Tên Khách Hàng
                  </label>
                  <p className="text-lg text-gray-800">{customer.fullName}</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1">
                    Email
                  </label>
                  <p className="text-lg text-gray-800">
                    {customer.email || "-"}
                  </p>
                </div>
              </div>

              {/* Contact Info */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1">
                    Số Điện Thoại
                  </label>
                  <p className="text-lg text-gray-800">
                    {customer.phone || "-"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1">
                    Ngày Sinh
                  </label>
                  <p className="text-lg text-gray-800">
                    {customer.dateOfBirth ? new Date(customer.dateOfBirth).toLocaleDateString("vi-VN") : "-"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1">
                    Trạng Thái
                  </label>
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                      customer.isActive
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {customer.isActive ? "Hoạt Động" : "Ngừng Hoạt Động"}
                  </span>
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">
                  Địa Chỉ
                </label>
                <p className="text-lg text-gray-800">
                  {customer.address || "-"}
                </p>
              </div>

              {/* Created Date */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1">
                    Ngày Tạo
                  </label>
                  <p className="text-lg text-gray-800">
                    {customer.createdAt
                      ? new Date(customer.createdAt).toLocaleDateString("vi-VN")
                      : "-"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1">
                    Cập Nhật Lần Cuối
                  </label>
                  <p className="text-lg text-gray-800">
                    {customer.updatedAt
                      ? new Date(customer.updatedAt).toLocaleDateString("vi-VN")
                      : "-"}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
