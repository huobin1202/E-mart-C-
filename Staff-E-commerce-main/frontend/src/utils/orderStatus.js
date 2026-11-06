export const orderStatusLabels = {
  pending: "Chờ xử lý", processing: "Đang xử lý", delivering: "Đang giao hàng",
  completed: "Hoàn thành", cancelled: "Đã hủy", refunded: "Đã hoàn tiền",
};
export const paymentStatusLabels = {
  pending: "Chờ thanh toán", paid: "Đã thanh toán", failed: "Thanh toán thất bại", refunded: "Đã hoàn tiền",
};
export const paymentMethodLabels = { cash: "Tiền mặt", e_wallet: "MoMo", other: "MoMo", card: "Thẻ/ngân hàng (đơn cũ)" };
export const saleChannelLabel = (type) => ({ mobile: "Đơn trên app", pos: "Tại quầy" }[type] || "Chưa xác định");
export const canProcessOrder = (order) => ["pending", "processing", "delivering"].includes(order.status);

const orderStatusBadgeClasses = {
  completed: "bg-emerald-50 text-emerald-700",
  processing: "bg-sky-50 text-sky-700",
  delivering: "bg-indigo-50 text-indigo-700",
  pending: "bg-amber-50 text-amber-700",
  cancelled: "bg-red-50 text-red-700",
  refunded: "bg-gray-100 text-gray-700",
};
export const orderStatusBadgeClass = (status) => orderStatusBadgeClasses[status] || "bg-gray-100 text-gray-700";
// A POS order waiting at the counter reads "Chờ thanh toán" rather than the generic pending label.
export const orderStatusText = (order) =>
  order.status === "pending" && order.orderType === "pos" ? "Chờ thanh toán" : orderStatusLabels[order.status] || order.status;
