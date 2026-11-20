import { formatPrice } from "../../utils/formatPrice";

export default function PosProductPrice({ product }) {
  const discounted = product.discountPrice != null && Number(product.discountPrice) < Number(product.price);

  return (
    <span className="flex flex-col gap-0.5">
      {discounted && (
        <span className="text-xs font-normal text-gray-500">
          Giá gốc: <del>{formatPrice(product.price)}</del>
        </span>
      )}
      <span className="font-bold text-emerald-700">
        {discounted ? "Giá giảm: " : "Giá: "}{formatPrice(product.discountPrice ?? product.price)}
      </span>
    </span>
  );
}
