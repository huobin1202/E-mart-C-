import useDialogFocus from "../ui/useDialogFocus";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getProductSelectionLocks } from "../../api/promotionApi";

export default function ProductPickerModal({ selectedIds, onChange, onClose, startDate, endDate, excludePromotionId }) {
  const dialogRef = useRef(null);
  useDialogFocus(dialogRef, { onClose });
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectionLocks, setSelectionLocks] = useState({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [firstProductsResponse, categoryResponse, locks] = await Promise.all([
          fetch("/api/products/paginated?page=1&pageSize=100&status=1"),
          fetch("/api/categories/all"),
          getProductSelectionLocks({ startDate, endDate, excludePromotionId }),
        ]);
        if (!firstProductsResponse.ok || !categoryResponse.ok) throw new Error("Không tải được sản phẩm hoặc danh mục.");
        const [firstPage, categoryData] = await Promise.all([firstProductsResponse.json(), categoryResponse.json()]);
        const allProducts = [...(firstPage.items || [])];
        for (let page = 2; page <= (firstPage.totalPages || 1); page += 1) {
          const response = await fetch(`/api/products/paginated?page=${page}&pageSize=100&status=1`);
          if (!response.ok) throw new Error("Không tải đủ danh sách sản phẩm.");
          const pageData = await response.json();
          allProducts.push(...(pageData.items || []));
        }
        if (!cancelled) {
          setProducts(allProducts);
          setCategories(categoryData || []);
          setSelectionLocks(Object.fromEntries((locks || []).map((lock) => [Number(lock.productId), lock])));
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Không tải được dữ liệu.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [startDate, endDate, excludePromotionId]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return products.filter((product) => {
      const matchesSearch = !term || [product.productName, product.name, product.sku]
        .some((value) => String(value || "").toLocaleLowerCase().includes(term));
      const matchesCategory = !categoryId || String(product.categoryId ?? product.category?.id ?? "") === categoryId;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, categoryId]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const visibleProducts = filteredProducts.slice((page - 1) * pageSize, page * pageSize);

  const toggleProduct = (id) => {
    const normalizedId = Number(id);
    if (selectionLocks[normalizedId] && !selectedIds.includes(normalizedId)) return;
    onChange(selectedIds.includes(normalizedId)
      ? selectedIds.filter((selectedId) => selectedId !== normalizedId)
      : [...selectedIds, normalizedId]);
  };

  const selectProducts = (scope) => {
    const candidates = (scope === "all" ? products : filteredProducts)
      .map((product) => Number(product.id))
      .filter((id) => !selectionLocks[id] || selectedIds.includes(id));
    onChange([...new Set([...selectedIds, ...candidates])]);
  };

  const clearProducts = (scope) => {
    const candidates = new Set((scope === "all" ? products : filteredProducts).map((product) => Number(product.id)));
    onChange(selectedIds.filter((id) => !candidates.has(Number(id))));
  };

  const selectableFilteredIds = useMemo(() => filteredProducts
    .map((product) => Number(product.id))
    .filter((id) => !selectionLocks[id] || selectedIds.includes(id)), [filteredProducts, selectionLocks, selectedIds]);
  const allFilteredSelected = selectableFilteredIds.length > 0
    && selectableFilteredIds.every((id) => selectedIds.includes(id));
  const someFilteredSelected = selectableFilteredIds.some((id) => selectedIds.includes(id));

  const toggleAllFiltered = () => {
    if (allFilteredSelected) clearProducts("filtered");
    else selectProducts("filtered");
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="product-picker-title" className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b px-5 py-3">
          <h3 id="product-picker-title" className="text-xl font-bold text-black">Chọn Sản Phẩm</h3>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg px-1 text-3xl leading-none text-gray-500 hover:text-gray-800">×</button>
        </header>

        <div className="flex flex-wrap gap-2 px-5 pt-3">
          <div className="min-w-64 flex-1">
            <input data-dialog-autofocus value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} aria-label="Tìm sản phẩm" placeholder="Tìm sản phẩm..." className="min-w-0 flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none" />
          </div>
          <select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1); }} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 sm:w-64">
            <option value="">Tất cả danh mục</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {loading && <p className="py-10 text-center text-gray-500">Đang tải danh sách sản phẩm...</p>}
          {!loading && error && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
          {!loading && !error && <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-gray-100 text-gray-800">
                <tr><th className="w-20 px-4 py-2 font-semibold">Mã</th><th className="px-4 py-2 font-semibold">Tên SP</th><th className="w-32 px-4 py-2 text-right font-semibold">Giá</th><th className="w-20 px-4 py-2 text-center font-semibold"><label className="inline-flex cursor-pointer items-center gap-2" title="Tích để chọn hoặc bỏ chọn tất cả sản phẩm đang lọc">Chọn<input type="checkbox" aria-label="Chọn hoặc bỏ chọn tất cả sản phẩm đang lọc" checked={allFilteredSelected} ref={(node) => { if (node) node.indeterminate = !allFilteredSelected && someFilteredSelected; }} onChange={toggleAllFiltered} className="h-4 w-4 accent-primary-600" /></label></th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleProducts.map((product) => {
              const id = Number(product.id);
              const checked = selectedIds.includes(id);
              const lock = selectionLocks[id];
              const disabled = Boolean(lock) && !checked;
              const name = product.productName || product.name || `Sản phẩm #${id}`;
              const lockDescription = lock
                ? `Đang áp dụng: ${lock.promotionName} · Hết hạn: ${lock.endDate ? new Date(lock.endDate).toLocaleDateString("vi-VN") : "Không xác định"}`
                : "";
              return <tr key={id} className={disabled ? "bg-gray-50 text-gray-400" : checked ? "bg-primary-50/60" : "hover:bg-gray-50"}>
                <td className="truncate px-4 py-2 text-gray-700">{product.sku || id}</td>
                <td className="px-4 py-2" title={name}>
                  <div className={`truncate font-medium ${disabled ? "text-gray-500" : "text-gray-900"}`}>{name}</div>
                  {lock && <div className="mt-1 text-xs leading-4 text-amber-700">{lockDescription}</div>}
                </td>
                <td className="px-4 py-2 text-right font-bold text-gray-900">{Number(product.price || 0).toLocaleString("vi-VN")}đ</td>
                <td className="px-4 py-2 text-center"><input type="checkbox" aria-label={disabled ? `${name}: ${lockDescription}` : `Chọn ${name}`} checked={checked} disabled={disabled} onChange={() => toggleProduct(id)} className="h-4 w-4 accent-primary-600 disabled:cursor-not-allowed disabled:opacity-45" /></td>
              </tr>;
            })}
                {!visibleProducts.length && <tr><td colSpan="4" className="px-4 py-10 text-center text-gray-500">Không tìm thấy sản phẩm phù hợp.</td></tr>}
              </tbody>
            </table>
          </div>}
        </div>

        {!loading && !error && <nav aria-label="Phân trang sản phẩm" className="flex items-center justify-center gap-3 pb-2 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded bg-primary-600 px-4 py-2 text-white enabled:hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50">Prev</button>
          <span className="min-w-16 text-center">{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} className="rounded bg-primary-600 px-4 py-2 text-white enabled:hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50">Next</button>
        </nav>}

        <footer className="flex justify-end border-t bg-white px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg bg-primary-600 px-6 py-2.5 font-semibold text-white hover:bg-primary-700">Chọn Sản Phẩm ({selectedIds.length})</button>
        </footer>
      </section>
    </div>
  );
}
