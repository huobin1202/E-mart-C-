import test from "node:test";
import assert from "node:assert/strict";
import { auditActionLabel, auditActor, auditBody, auditSummary, auditTarget, auditResult } from "../src/utils/auditDisplay.js";

test("Vietnamese actions and order target for business transitions", () => {
  assert.equal(auditActionLabel({ action: "CONFIRM_TRANSFER_Orders", entityType: "Orders" }), "Xác nhận chuyển khoản");
  assert.equal(auditActionLabel({ action: "ADJUST_Inventory_Adjustment", entityType: "Inventory_Adjustment" }), "Điều chỉnh tồn kho");
  assert.equal(auditTarget({ entityType: "Orders", entityId: "31" }), "Đơn hàng #31");
});

test("old unknown entries are not claimed to be business creates", () => {
  assert.equal(auditActionLabel({ action: "CREATE_Unknown", entityType: "Unknown" }), "Chưa xác định (nhật ký cũ)");
  assert.equal(auditTarget({ entityType: "Unknown", entityId: "0" }), "Chưa xác định");
  assert.equal(auditActor({ username: "Unknown" }), "Hệ thống / chưa xác định");
});

test("failure and partial imports remain visible", () => {
  assert.equal(auditSummary({ payload: JSON.stringify({ succeeded: false, statusCode: 409 }) }), "Không thành công (409)");
  assert.equal(auditSummary({ payload: JSON.stringify({ succeeded: true, outcome: "partial" }) }), "Hoàn thành một phần, có dòng dữ liệu lỗi");
  assert.match(auditResult({ payload: JSON.stringify({ result: { created: 3, rolledBack: false } }) }), /Đã tạo: 3/);
});

test("legacy raw/truncated payloads and omitted bodies are readable", () => {
  assert.equal(auditBody({ payload: "legacy...[truncated]" }), "legacy...[truncated]");
  assert.equal(auditBody({ payload: JSON.stringify({ body: "[Empty Body]" }) }), "Không có dữ liệu gửi kèm.");
  assert.equal(auditActionLabel({ action: "PAYMENT_SUCCESS", entityType: "Payment" }), "Thanh toán thành công");
  assert.equal(auditSummary({ payload: null }), "Không có nội dung bổ sung");
});
