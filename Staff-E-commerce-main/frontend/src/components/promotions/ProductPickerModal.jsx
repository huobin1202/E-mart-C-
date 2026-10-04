import React, { useEffect, useMemo, useState } from "react";

export default function ProductPickerModal({ selectedIds, onChange, onClose }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [firstProductsResponse, categoryResponse] = await Promise.all([
          fetch("/api/products/available?page=1&pageSize=100"),
          fetch("/api/categories/all"),
        ]);
        if (!firstProductsResponse.ok || !categoryResponse.ok) throw new Error("Không tải được sản phẩm hoặc danh mục.");
        const [firstPage, categoryData] = await Promise.all([firstProductsResponse.json(), categoryResponse.json()]);
        const allProducts = [...(firstPage.items || [])];
        for (let page = 2; page <= (firstPage.totalPages || 1); page += 1) {
          const response = await fetch(`/api/products/available?page=${page}&pageSize=100`);
          if (!response.ok) throw new Error("Không tải đủ danh sách sản phẩm.");
          const pageData = await response.json();
          allProducts.push(...(pageData.items || []));
        }
        if (!cancelled) {
          setProducts(allProducts);
          setCategories(categoryData || []);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Không tải được dữ liệu.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const filteredProducts = useMemo(() => {
    const term = appliedSearch.trim().toLocaleLowerCase();
    return products.filter((product) => {
      const matchesSearch = !term || [product.productName, product.name, product.sku]
        .some((value) => String(value || "").toLocaleLowerCase().includes(term));
      const matchesCategory = !categoryId || String(product.categoryId ?? product.category?.id ?? "") === categoryId;
      return matchesSearch && matchesCategory;
    });
  }, [products, appliedSearch, categoryId]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const visibleProducts = filteredProducts.slice((page - 1) * pageSize, page * pageSize);

  const toggleProduct = (id) => {
    const normalizedId = Number(id);
    onChange(selectedIds.includes(normalizedId)
      ? selectedIds.filter((selectedId) => selectedId !== normalizedId)
      : [...selectedIds, normalizedId]);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="product-picker-title" className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b px-6 py-5">
          <h3 id="product-picker-title" className="text-xl font-bold text-black">Chọn Sản Phẩm</h3>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg px-1 text-3xl leading-none text-gray-500 hover:text-gray-800">×</button>
        </header>

        <div className="space-y-3 px-5 pt-5">
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setAppliedSearch(search); setPage(1); }}>
            <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm sản phẩm..." className="min-w-0 flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none" />
            <button type="submit" className="rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-600">Tìm kiếm</button>
          </form>
          <select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1); }} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 sm:w-64">
            <option value="">Tất cả danh mục</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading && <p className="py-10 text-center text-gray-500">Đang tải danh sách sản phẩm...</p>}
          {!loading && error && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
          {!loading && !error && <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-gray-100 text-gray-800">
                <tr><th className="w-20 px-4 py-3 font-semibold">Mã</th><th className="px-4 py-3 font-semibold">Tên SP</th><th className="w-32 px-4 py-3 text-right font-semibold">Giá</th><th className="w-20 px-4 py-3 text-center font-semibold">Chọn</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleProducts.map((product) => {
              const id = Number(product.id);
              const checked = selectedIds.includes(id);
              const name = product.productName || product.name || `Sản phẩm #${id}`;
              return <tr key={id} className={checked ? "bg-blue-50/60" : "hover:bg-gray-50"}>
                <td className="truncate px-4 py-3 text-gray-700">{product.sku || id}</td>
                <td className="truncate px-4 py-3 font-medium text-gray-900" title={name}>{name}</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">{Number(product.price || 0).toLocaleString("vi-VN")}đ</td>
                <td className="px-4 py-3 text-center"><input type="checkbox" aria-label={`Chọn ${name}`} checked={checked} onChange={() => toggleProduct(id)} className="h-4 w-4 accent-blue-600" /></td>
              </tr>;
            })}
                {!visibleProducts.length && <tr><td colSpan="4" className="px-4 py-10 text-center text-gray-500">Không tìm thấy sản phẩm phù hợp.</td></tr>}
              </tbody>
            </table>
          </div>}
        </div>

        {!loading && !error && <nav aria-label="Phân trang sản phẩm" className="flex items-center justify-center gap-3 pb-4 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded bg-blue-500 px-4 py-2 text-white enabled:hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50">Prev</button>
          <span className="min-w-16 text-center">{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} className="rounded bg-blue-600 px-4 py-2 text-white enabled:hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Next</button>
        </nav>}

        <footer className="flex justify-end border-t bg-white px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg bg-purple-400 px-6 py-3 font-semibold text-white hover:bg-purple-500">Chọn Sản Phẩm ({selectedIds.length})</button>
        </footer>
      </section>
    </div>
  );
}
