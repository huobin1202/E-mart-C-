// src/hook/useProducts.js
import { useEffect, useState } from "react";
import { getProductsAll, getProductsPaginated } from "../api/apiClient";

export default function useProducts({
  page = 1,
  pageSize = 12,
  search = "",
  usePaginationEndpoint = true,
} = {}) {
  const [items, setItems] = useState([]); // list of products or Items from paginated
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState({
    totalItems: 0,
    currentPage: 1,
    pageSize,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        if (usePaginationEndpoint) {
          const data = await getProductsPaginated(page, pageSize, search);
          // Expecting { Items, TotalItems, CurrentPage, PageSize, TotalPages, HasNext, HasPrevious } or similar
          const normalizedItems =
            data.items ??
            data.Items ??
            data.Items ??
            data.Items ??
            data.Items ??
            [];
          if (!cancelled) {
            setItems(normalizedItems);
            setMeta({
              totalItems:
                data.totalItems ?? data.TotalItems ?? data.TotalItems ?? 0,
              currentPage: data.currentPage ?? data.CurrentPage ?? page,
              pageSize: data.pageSize ?? data.PageSize ?? pageSize,
              totalPages: data.totalPages ?? data.TotalPages ?? 1,
              hasNext: data.hasNext ?? data.HasNext ?? false,
              hasPrevious: data.hasPrevious ?? data.HasPrevious ?? false,
            });
          }
        } else {
          const list = await getProductsAll();
          // if backend returns an array
          const arr = Array.isArray(list)
            ? list
            : list.items ?? list.Items ?? [];
          // implement client side paging
          const start = (page - 1) * pageSize;
          const pageItems = arr.slice(start, start + pageSize);
          if (!cancelled) {
            setItems(pageItems);
            setMeta({
              totalItems: arr.length,
              currentPage: page,
              pageSize,
              totalPages: Math.max(1, Math.ceil(arr.length / pageSize)),
              hasNext: page * pageSize < arr.length,
              hasPrevious: page > 1,
            });
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Lỗi khi tải dữ liệu");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, search, usePaginationEndpoint]);

  return { items, loading, error, meta };
}
