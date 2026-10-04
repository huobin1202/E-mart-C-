import React from "react";
import DetailOrderForm from "./DetailOrderForm";
import PromotionSection from "./PromotionSection";

export default function OrdersForm({
  onClose,
  openCustomerModal,
  openProductModal,
  mode,
  currentOrder,
  setCurrentOrder,
  payment,
  setPayment,
  listOrderProducts,
  setListOrderProducts,
  selectedProduct,
  setSelectedProduct,
  promotion,
  setPromotion,
  click_buttonCreateNewOrder,
  completePendingOrder,
}) {
  const formMode = mode;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl p-6 mb-8 w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-6 border-b pb-4">
          <h1 className="text-3xl font-bold text-gray-800">
            {formMode != "create" ? "CHI TIẾT ĐƠN HÀNG" : "ĐƠN HÀNG MỚI"}
          </h1>
          <button
            className="text-gray-500 hover:text-gray-700"
            onClick={onClose}
          >
            <svg
              className="w-7 h-7"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Thông tin đơn hàng */}
        <div className="space-y-5 mb-6">
          {/* Mã đơn hàng */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              Mã đơn hàng
            </label>
            <input
              readOnly
              value={currentOrder?.orderNumber || " "}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 font-medium"
            />
          </div>

          {/* Khách hàng */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              Khách hàng
            </label>
            <div className="flex gap-2">
              <input
                value={`${currentOrder?.customerName || "Khách Hàng vãng lai"} (${
                  currentOrder?.customerId ?? 0
                })`}
                readOnly
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 font-medium"
              />
              {formMode == "create" && (
                <button
                  className="px-3 py-2.5 bg-gray-200 rounded-lg hover:bg-gray-300"
                  onClick={openCustomerModal}
                >
                  {/* Nút mở modal khách hàng */}
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Nhân viên */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              Nhân viên
            </label>
            {(() => {
              const staffName =
                currentOrder?.userName && currentOrder?.userId
                  ? `${currentOrder.userName} (${currentOrder.userId})`
                  : "Nhân Viên";
              return (
                <input
                  value={staffName}
                  readOnly
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 font-medium"
                />
              );
            })()}
          </div>

          {/* Ngày lập phiếu */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              Ngày lập phiếu
            </label>
            <input
              value={
                currentOrder?.createdAt
                  ? new Date(currentOrder.createdAt).toLocaleString("vi-VN", {
                      timeZone: "Asia/Ho_Chi_Minh",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : ""
              }
              readOnly
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 font-medium"
            />
          </div>

          {/* Ngày chỉnh sửa */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              Ngày chỉnh sửa
            </label>
            <input
              value={
                currentOrder?.updatedAt
                  ? new Date(currentOrder.updatedAt).toLocaleString("vi-VN", {
                      timeZone: "Asia/Ho_Chi_Minh",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : ""
              }
              readOnly
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 font-medium"
            />
          </div>

          {formMode != "create" && (
            <div>
              {/* Trạng thái đơn */}
              <label className="block text-sm font-bold text-gray-700 mb-1">
                Trạng thái đơn
              </label>
              <select
                value={currentOrder?.status || "pending"}
                disabled={mode !== "create"}
                className={`w-full px-4 py-2.5 border border-gray-300 rounded-lg font-bold ${
                  mode !== "create" ? "bg-gray-100 text-gray-600" : ""
                }`}
              >
                <option value="pending">Chưa xử lý</option>
                <option value="paid">Đã thanh toán</option>
                <option value="completed">Hoàn thành</option>
                <option value="canceled">Đã hủy</option>
              </select>
            </div>
          )}

          {/* Ghi chú */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-700 mb-1">
              Ghi chú
            </label>
            <textarea
              onChange={(e) =>
                setCurrentOrder({ ...currentOrder, note: e.target.value })
              }
              value={currentOrder?.note}
              rows="2"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg"
            ></textarea>
          </div>

          {/* Chi tiết đơn hàng */}
          <DetailOrderForm
            openProductModal={openProductModal}
            isCreateMode={formMode}
            listOrderProducts={listOrderProducts}
            setListOrderProducts={setListOrderProducts}
            selectedProduct={selectedProduct}
            setSelectedProduct={setSelectedProduct}
            setCurrentOrder={setCurrentOrder}
          />

          {/* Khuyến mãi */}
          <PromotionSection
            isCreateMode={formMode}
            promotion={promotion}
            setPromotion={setPromotion}
            currentOrder={currentOrder}
            setCurrentOrder={setCurrentOrder}
          />

          {/* Thanh toán */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            {/* Phương thức */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                Phương thức
              </label>
              {formMode === "create" ? (
                <select
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg font-medium"
                  value={payment.method}
                  onChange={(e) =>
                    setPayment({ ...payment, method: e.target.value })
                  }
                >
                  <option value="cash">Tiền mặt</option>
                  <option value="other">MoMo</option>
                </select>
              ) : (
               <input
                  readOnly
                  value={
                    payment?.method === "cash"
                      ? "Tiền mặt"
                      : payment?.method === "other"
                        ? "MoMo"
                        : payment?.method || "Không xác định"
                  }
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50"
                />

              )}
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                Mã GD
              </label>
              <input
                readOnly
                  value={payment?.transaction_ref || ""}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50"
              />

              <label className="block text-sm font-bold text-gray-700 mb-1 mt-3">
                Trạng thái
              </label>
              <input
                readOnly
                value={payment?.status || ""}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50"
              />
            </div>
          </div>

          {/* Tổng tiền */}
          <div className="bg-gradient-to-r from-gray-100 to-gray-200 p-6 rounded-xl mb-6 font-bold text-lg">
            <div className="flex justify-between mb-2">
              <span>Tổng trước giảm:</span>{" "}
              <span>{currentOrder.subtotal}₫</span>
            </div>
            <div className="flex justify-between mb-2">
              <span>Giảm giá:</span>{" "}
              <span className="text-green-600">{currentOrder.discount}₫</span>
            </div>
            <div className="flex justify-between text-xl text-blue-600">
              <span>Phải trả:</span>{" "}
              <span>{Math.max(0, Number(currentOrder.subtotal || 0) - Number(currentOrder.discount || 0))}₫</span>
            </div>
          </div>

          {/* Nút hành động */}
          <div className="flex flex-wrap gap-4 justify-end">
            {formMode == "create" && (
              <button
                onClick={click_buttonCreateNewOrder}
                className="px-7 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-lg"
              >
                Tạo Đơn Hàng
              </button>
            )}
            {formMode !== "create" && currentOrder?.status === "pending" && (
              <button
                onClick={() => completePendingOrder(currentOrder.id)}
                className="px-7 py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 shadow-lg"
              >
                Tạo Đơn Hàng
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
