import { useState } from "react";
import { request } from "../../api/apiClient";
import { useAuth } from "../../hook/useAuth";

export default function OnlinePaymentPanel({ order, onChange }) {
  const { permissions } = useAuth();
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const awaitingRefund = order.status === "cancelled" && order.paymentStatus === "paid";
  const canConfirm = order.paymentMethod === "card" && order.paymentStatus === "pending" && ["pending", "processing"].includes(order.status);
  if (!awaitingRefund && !canConfirm) return null;
  async function submit() {
    if (busy || !reference.trim()) return;
    if (!window.confirm(awaitingRefund ? "Xác nhận đã thực hiện hoàn đủ tiền cho khách theo mã giao dịch này?" : "Xác nhận đã kiểm tra ngân hàng và nhận đủ tiền theo mã giao dịch này?")) return;
    setBusy(true); setError("");
    try {
      await request(`/orders/${order.id}/${awaitingRefund ? "refund" : "confirm-online-payment"}`, {
        method: "POST", body: { amount: order.totalAmount, reference: reference.trim() },
      });
      setReference(""); await onChange?.();
    } catch (e) { setError(e.message || "Không thể ghi nhận giao dịch."); }
    finally { setBusy(false); }
  }
  return <section className="my-3 space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
    <p className="font-semibold text-amber-900">{awaitingRefund ? "Đơn đã hủy · Còn phải hoàn tiền cho khách" : "Chờ đối soát chuyển khoản ngân hàng"}</p>
    {permissions.includes("payments.write") && <>
      <label className="block">{awaitingRefund ? "Mã giao dịch hoàn tiền" : "Mã giao dịch tiền vào"}<input maxLength={200} value={reference} onChange={e => setReference(e.target.value)} disabled={busy} className="mt-1 block w-full rounded border bg-white p-2" /></label>
      <button disabled={busy || !reference.trim()} onClick={submit} className="rounded bg-primary-600 px-3 py-2 text-white disabled:opacity-50">{busy ? "Đang lưu…" : awaitingRefund ? "Xác nhận đã hoàn đủ tiền" : "Xác nhận đã nhận đủ tiền"}</button>
    </>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </section>;
}
