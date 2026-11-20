export function catalogForAudience(products, isMember) {
  if (isMember) return products;
  return products.map((product) => {
    if (!(Number(product.discountAmount) > 0) && Number(product.price) === Number(product.originalPrice ?? product.price)) return product;
    return { ...product, price: product.originalPrice ?? product.price, discountAmount: 0, discountPercent: 0, promotionName: null, promotionEndsAt: null };
  });
}

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
