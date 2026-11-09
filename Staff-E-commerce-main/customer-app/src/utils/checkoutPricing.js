export function repriceVoucher(voucher, subtotal) {
  if (!voucher || subtotal <= 0) return null;
  const promotion = voucher.promotion;
  if (!promotion || subtotal < Number(promotion.minOrderAmount || 0)) return null;
  const value = Number(promotion.value);
  if (!Number.isFinite(value) || value < 0) return null;
  let discount = Math.floor(promotion.discountType === "percent" ? subtotal * value / 100 : value);
  if (promotion.maxDiscount != null) discount = Math.min(discount, Math.floor(Number(promotion.maxDiscount)));
  return { ...voucher, discountAmount: Math.min(subtotal, Math.max(0, discount)) };
}
