const entities = {
  users: "Tài khoản", roles: "Vai trò", employees: "Nhân viên", customers: "Khách hàng",
  products: "Sản phẩm", categories: "Danh mục", units: "Đơn vị tính", suppliers: "Nhà cung cấp",
  inventory: "Tồn kho", inventory_adjustment: "Điều chỉnh tồn kho", inventoryadjustment: "Điều chỉnh tồn kho", purchaseorders: "Phiếu nhập",
  orders: "Đơn hàng", orderitem: "Mặt hàng đơn", payment: "Thanh toán", payments: "Thanh toán",
  invoice: "Hóa đơn", invoices: "Hóa đơn", promotions: "Khuyến mãi",
};
const operations = {
  CREATE: "Tạo", CREATE_TEMP: "Tạo đơn tạm", UPDATE: "Cập nhật", DELETE: "Xóa",
  CHECKOUT: "Chốt đơn hàng", ADD_ITEMS: "Thêm mặt hàng vào đơn", REMOVE_ITEMS: "Xóa mặt hàng của đơn", CONFIRM_PAYMENT: "Xác nhận thanh toán",
  CONFIRM_CASH: "Xác nhận tiền mặt", CONFIRM_TRANSFER: "Xác nhận chuyển khoản",
  CONFIRM: "Xác nhận", CANCEL: "Hủy", REJECT: "Từ chối", DELIVER: "Xác nhận giao hàng",
  REFUND: "Xác nhận hoàn tiền", COMPLETE: "Hoàn tất", CREATE_PAYMENT_LINK: "Tạo liên kết thanh toán",
  PAYMENT_CALLBACK: "Tiếp nhận thông báo thanh toán", SIMULATE_PAYMENT: "Thực hiện thanh toán giả lập",
  APPLY_PROMOTION: "Áp dụng khuyến mãi", CLAIM: "Nhận voucher", ADJUST: "Điều chỉnh tồn kho",
  UPLOAD_IMAGE: "Tải ảnh", SET_STATUS: "Đổi trạng thái", TOGGLE_STATUS: "Bật / tắt hoạt động",
  CHANGE_PASSWORD: "Đổi mật khẩu", LOGIN: "Đăng nhập", IMPORT: "Nhập dữ liệu",
};

export function auditEntityLabel(value) {
  const normalized = String(value || "").toLowerCase();
  return !normalized || normalized === "unknown" ? "Chưa xác định" : entities[normalized] || value;
}

export function auditActionLabel(log) {
  const action = log.action || "";
  if (/_unknown$/i.test(action)) return "Chưa xác định (nhật ký cũ)";
  const legacy = { PAYMENT_SUCCESS: "Thanh toán thành công", PAYMENT_REFUND_REQUIRED: "Cần hoàn tiền", payment_received: "Đã nhận thanh toán" };
  if (legacy[action]) return legacy[action];
  const entity = log.entityType || "";
  const suffix = `_${entity}`;
  const operation = entity && action.toLowerCase().endsWith(suffix.toLowerCase()) ? action.slice(0, -suffix.length) : action;
  return operations[operation] || action || "Chưa xác định";
}

export function auditPayload(log) {
  try { return JSON.parse(log.payload); } catch { return null; }
}

export function auditSummary(log) {
  const payload = auditPayload(log);
  if (payload?.outcome === "partial") return "Hoàn thành một phần, có dòng dữ liệu lỗi";
  if (typeof payload?.succeeded === "boolean") return payload.succeeded ? "Thành công" : `Không thành công${payload.statusCode ? ` (${payload.statusCode})` : ""}`;
  return log.payload || "Không có nội dung bổ sung";
}

export function auditResult(log) {
  const result = auditPayload(log)?.result;
  const labels = { status: "Trạng thái", paymentStatus: "Thanh toán", isActive: "Đang hoạt động", active: "Đang hoạt động",
    success: "Thành công", succeeded: "Thành công", totalRows: "Tổng dòng", created: "Đã tạo", updated: "Đã cập nhật",
    skipped: "Bỏ qua", hasErrors: "Có lỗi dữ liệu", rolledBack: "Đã hoàn tác dữ liệu" };
  return result && typeof result === "object" ? Object.entries(result).filter(([key]) => labels[key]).map(([key, value]) =>
    `${labels[key]}: ${typeof value === "boolean" ? value ? "Có" : "Không" : value}`).join(" · ") : "";
}

export function auditActor(log) {
  return !log.username || log.username === "Unknown" ? "Hệ thống / chưa xác định" : log.username;
}

export function auditTarget(log) {
  const id = log.entityId && log.entityId !== "0" ? ` #${log.entityId}` : "";
  return auditEntityLabel(log.entityType) + id;
}

export function auditBody(log) {
  const payload = auditPayload(log);
  const body = payload?.body;
  if (body === "[Empty Body]") return "Không có dữ liệu gửi kèm.";
  if (body === "[Authentication payload omitted]") return "Thông tin xác thực không được ghi vào nhật ký.";
  if (typeof body === "string" && body.startsWith("[Payload omitted:")) return "Nội dung tệp hoặc dữ liệu lớn không được ghi vào nhật ký.";
  const content = body ?? log.payload;
  if (!content) return "Không có nội dung bổ sung.";
  if (typeof content === "object") return JSON.stringify(content, null, 2);
  try { return JSON.stringify(JSON.parse(content), null, 2); } catch { return String(content); }
}
