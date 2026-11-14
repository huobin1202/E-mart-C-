import { useEffect, useRef, useState } from "react";
import { request } from "../../api/apiClient";

const EMPTY_IDS = [];
const normalizeSearch = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export default function PromotionProducts({ productIds = EMPTY_IDS }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("default");
  const listRef = useRef(null);

  useEffect(() => { listRef.current?.scrollTo({ top: 0 }); }, [search, category, sort]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const ids = [...new Set(productIds)];
      const results = [];
      // Limit concurrent requests, including for large promotions.
      for (let index = 0; index < ids.length && !cancelled; index += 6) {
        const batch = await Promise.all(ids.slice(index, index + 6).map(async (id) => {
          try { return { id, product: await request(`/products/${id}`) }; }
          catch { return { id, product: null }; }
        }));
        results.push(...batch);
      }
      if (!cancelled) { setProducts(results); setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [productIds, attempt]);

  const failed = products.some(({ product }) => !product);
  const categoryKey = (product) => String(product.categoryId ?? product.category?.id ?? "none");
  const categories = [...new Map(products.filter(({ product }) => product).map(({ product }) => [
    categoryKey(product), product.category?.name || (categoryKey(product) === "none" ? "Chưa phân loại" : `Danh mục #${categoryKey(product)}`)
  ])).entries()].sort((a, b) => a[1].localeCompare(b[1], "vi"));
  const query = normalizeSearch(search.trim());
  const filteredProducts = products.filter(({ id, product }) => {
    const matchesCategory = !category || (product && categoryKey(product) === category);
    return matchesCategory && (!query || [product?.productName || `Sản phẩm #${id}`, product?.sku, product?.barcode, id]
      .some((value) => normalizeSearch(value).includes(query)));
  }).sort((a, b) => {
    if (sort === "default") return 0;
    if (!a.product || !b.product) return Number(!a.product) - Number(!b.product);
    if (sort === "name") return a.product.productName.localeCompare(b.product.productName, "vi", { numeric: true });
    return (Number(a.product.price) - Number(b.product.price)) * (sort === "price-desc" ? -1 : 1);
  });
  const hasFilters = search !== "" || category !== "" || sort !== "default";
  return (
    <section aria-labelledby="promotion-products-title" className="min-w-0 overflow-hidden rounded-lg border border-primary-200">
      <div className="flex items-center justify-between gap-2 bg-primary-50 px-3 py-2">
        <h3 id="promotion-products-title" className="text-sm font-semibold text-primary-900">Sản phẩm áp dụng</h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-primary-700">{new Set(productIds).size} sản phẩm</span>
      </div>
      {!loading && products.length > 0 && <div className="space-y-1.5 border-b bg-white px-3 py-2">
        <div className="flex flex-wrap gap-2">
          <input type="search" aria-label="Tìm sản phẩm áp dụng" placeholder="Tên, mã SP, mã vạch..." value={search} onChange={(event) => setSearch(event.target.value)} className="h-8 min-w-36 flex-1 rounded-md border border-gray-300 px-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
          <select aria-label="Danh mục sản phẩm áp dụng" value={category} onChange={(event) => setCategory(event.target.value)} className="h-8 min-w-0 max-w-full rounded-md border border-gray-300 bg-white px-2 text-xs">
            <option value="">Tất cả danh mục</option>
            {categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select aria-label="Sắp xếp sản phẩm áp dụng" value={sort} onChange={(event) => setSort(event.target.value)} className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs">
            <option value="default">Sắp xếp: Mặc định</option><option value="name">Tên A–Z</option><option value="price-asc">Giá tăng dần</option><option value="price-desc">Giá giảm dần</option>
          </select>
        </div>
        <div className="flex min-h-5 items-center justify-between gap-2 text-xs text-gray-500">
          <span role="status">Đang hiển thị {filteredProducts.length}/{products.length} sản phẩm</span>
          {hasFilters && <button type="button" className="font-medium text-primary-700 hover:underline" onClick={() => { setSearch(""); setCategory(""); setSort("default"); }}>Xóa bộ lọc</button>}
        </div>
      </div>}
      {loading ? <p role="status" className="px-3 py-4 text-sm text-gray-500">Đang tải sản phẩm áp dụng...</p>
        : !products.length ? <p className="px-3 py-4 text-sm text-gray-500">Chưa có sản phẩm áp dụng.</p>
          : <div ref={listRef} tabIndex={0} role="region" aria-label="Danh sách sản phẩm áp dụng" className="max-h-[45dvh] md:max-h-[calc(96dvh-22rem)] overflow-auto overscroll-contain">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500"><tr><th className="px-3 py-2 font-medium">Sản phẩm</th><th className="px-3 py-2 font-medium">Mã SP</th><th className="px-3 py-2 text-right font-medium">Giá gốc</th></tr></thead>
              <tbody className="divide-y divide-gray-100">{filteredProducts.map(({ id, product }) => <tr key={id}>
                <td className="px-3 py-2 font-medium text-gray-900"><span className="break-words">{product?.productName || `Sản phẩm #${id}`}</span>{!product && <p className="text-xs font-normal text-amber-700">Không tải được thông tin sản phẩm.</p>}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{product?.sku || `#${id}`}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-medium">{product ? `${Number(product.price).toLocaleString("vi-VN")}đ` : "—"}</td>
              </tr>)}
              {!filteredProducts.length && <tr><td colSpan={3} className="px-3 py-6 text-center text-sm text-gray-500">Không tìm thấy sản phẩm phù hợp.</td></tr>}
              </tbody>
            </table>
          </div>}
      {!loading && failed && <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-amber-700"><span>Một số sản phẩm chưa tải được.</span><button type="button" className="font-semibold underline" onClick={() => setAttempt((value) => value + 1)}>Thử lại</button></div>}
    </section>
  );
}
