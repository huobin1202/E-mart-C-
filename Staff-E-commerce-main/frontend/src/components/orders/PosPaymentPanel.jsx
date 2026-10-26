import { useCallback, useEffect, useRef, useState } from "react";
import { confirmPosCash, confirmPosPayment, createPosPaymentLink, getPosCheckout } from "../../api/posCheckoutApi";
import { request } from "../../api/apiClient";
import { useAuth } from "../../hook/useAuth";
import OnlinePaymentPanel from "./OnlinePaymentPanel";

export default function PosPaymentPanel({ order, onChange }) {
  const [reference, setReference] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const { permissions } = useAuth();
  const canPay = permissions.includes("payments.write");
  const [payUrl, setPayUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const listener = useRef(onChange);
  useEffect(() => { listener.current = onChange; }, [onChange]);
  const refresh = useCallback(async () => {
    const latest = await getPosCheckout(order.id);
    listener.current?.(latest);
    return latest;
  }, [order.id]);

  useEffect(() => {
    if (order.paymentStatus !== "pending" || order.status !== "pending" || order.paymentMethod !== "e_wallet") return;
    let active = true;
    const timer = window.setInterval(async () => {
      try { const latest = await getPosCheckout(order.id); if (active) listener.current?.(latest); }
      catch { /* Manual refresh remains available after a transient error. */ }
    }, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [order.id, order.paymentStatus, order.paymentMethod, order.status]);

  async function run(action) {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(e.message || "Không thể xử lý thanh toán."); }
    finally { setBusy(false); }
  }

  if (order.paymentStatus === "paid" && order.status === "completed") return <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">Đã thanh toán · Hoàn thành</p>;
  if (order.paymentStatus === "paid" && order.status === "pending" && order.isLegacy) return <div className="space-y-2 rounded-lg bg-emerald-50 p-3 text-sm"><p>Đơn cũ đã ghi nhận thanh toán.</p><button disabled={busy || !permissions.includes("orders.write")} onClick={() => run(async () => { await request(`/orders/${order.id}/complete`, { method: "POST" }); await refresh(); })} className="rounded border bg-white px-3 py-2 disabled:opacity-50">Hoàn tất đơn đã thu tiền</button>{error && <p role="alert" className="text-red-700">{error}</p>}</div>;
  if (order.status === "cancelled" && order.paymentStatus === "paid") return <OnlinePaymentPanel order={order} onChange={refresh} />;
  if (order.status === "cancelled") return <p className="rounded-lg bg-gray-100 p-3 text-sm text-gray-600">Đơn đã hủy. Tồn kho và điểm đã dùng đã được hoàn lại.</p>;
  if (order.status !== "pending" || order.paymentStatus !== "pending") return <p className="rounded bg-gray-50 p-3 text-sm">Đơn không còn chờ thanh toán.</p>;
  return <section className="my-3 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
    <p className="font-semibold text-amber-900">Đơn đã lưu · Chờ thanh toán</p>
    <p className="text-amber-800">Đang xử lý đơn {order.orderNumber}. Thanh toán hoặc hủy trên chính đơn này.</p>
    {order.isLegacy && order.paymentMethod === "cash" && <div className="space-y-2">
      <label className="block font-medium">Tiền khách đưa<input type="number" min={order.totalAmount} value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} disabled={busy || !canPay} className="mt-1 block w-full rounded border bg-white p-2" /></label>
      <button disabled={busy || !canPay || cashReceived === "" || !Number.isFinite(Number(cashReceived)) || Number(cashReceived) < order.totalAmount} onClick={() => run(async () => {
        if (!window.confirm(`Xác nhận đã thu đủ ${Number(order.totalAmount).toLocaleString("vi-VN")} ₫ tiền mặt?`)) return;
        listener.current?.(await confirmPosCash(order.id, Number(cashReceived)));
      })} className="rounded bg-primary-600 px-3 py-2 text-white disabled:opacity-50">Xác nhận thu tiền mặt</button>
    </div>}
    {canPay && order.paymentMethod === "card" && <div className="space-y-2">
      <label className="block font-medium">Mã giao dịch trên máy POS/ngân hàng<input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} disabled={busy} className="mt-1 block w-full rounded border bg-white p-2" /></label>
      <button type="button" disabled={busy || !reference.trim()} onClick={() => run(async () => {
        if (!window.confirm(`Xác nhận đã thu đủ ${Number(order.totalAmount).toLocaleString("vi-VN")} ₫ theo mã giao dịch này?`)) return;
        listener.current?.(await confirmPosPayment(order.id, order.totalAmount, reference.trim()));
      })} className="rounded bg-primary-600 px-3 py-2 text-white disabled:opacity-50">Xác nhận đã thu đủ tiền</button>
    </div>}
    {canPay && order.paymentMethod === "e_wallet" && <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={busy} onClick={() => run(async () => { const result = await createPosPaymentLink(order.id); setPayUrl(result.payUrl); })} className="rounded bg-primary-600 px-3 py-2 text-white disabled:opacity-50">{busy ? "Đang xử lý…" : "Tạo liên kết MoMo"}</button>
      {payUrl && <a href={payUrl} target="_blank" rel="noreferrer" className="font-semibold text-primary-700 underline">Mở thanh toán MoMo</a>}
    </div>}
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={busy} onClick={() => run(refresh)} className="rounded border bg-white px-3 py-2 disabled:opacity-50">Kiểm tra thanh toán</button>
      <button type="button" disabled={busy || !permissions.includes("orders.write")} onClick={() => run(async () => {
        if (!window.confirm("Hủy đơn chưa thanh toán và hoàn lại hàng, điểm đã dùng?")) return;
        const cancelled = await request(`/orders/${order.id}/cancel`, { method: "POST" });
        if (cancelled !== true) throw new Error("Không thể hủy đơn. Hãy kiểm tra lại trạng thái thanh toán.");
        await refresh();
      })} className="rounded border border-red-300 bg-white px-3 py-2 text-red-700 disabled:opacity-50">Hủy đơn</button>
    </div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </section>;
}
