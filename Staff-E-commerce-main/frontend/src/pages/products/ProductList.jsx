// Updated ProductList.jsx with role-based access control
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { advancedSearchProducts, BASE_URL, getProductsPaginated, request } from "../../api/apiClient";
import { ImageOff } from "lucide-react";
import { formatPrice } from "../../utils/formatPrice";
import ProductModal from "../../components/products/ProductModal";
import ImportModal from "../../components/import/ImportModal";
import ExportExcelButton from "../../components/import/ExportExcelButton";
import { getAllCategories } from "../../api/categoryApi";
import { useAuth } from "../../hook/useAuth";
import { getInventoryStats } from "../../api/inventoryApi";
import InventoryHistory from "../inventory/InventoryHistory";
import { useRealtimeNotifications } from "../../hooks/useRealtimeNotifications";
import TableDisplayControls from "../../components/ui/TableDisplayControls";

function ProductThumbnail({ imagePath, name }) {
  const [failedSource, setFailedSource] = useState(null);
  let source = "";
  if (imagePath?.trim()) {
    try { source = new URL(imagePath.trim(), `${new URL(BASE_URL).origin}/`).href; }
    catch { source = ""; }
  }
  return (
    <div className="product-thumbnail flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
      {source && failedSource !== source ? (
        <img src={source} alt={name} loading="lazy" className="h-full w-full object-contain" onError={() => setFailedSource(source)} />
      ) : <span title="Chưa có ảnh sản phẩm" role="img" aria-label="Chưa có ảnh sản phẩm"><ImageOff size={22} className="text-gray-400" /></span>}
    </div>
  );
}

export default function ProductList() {
  const navigate = useNavigate();
  // Get current user and role
  const { permissions } = useAuth();
  // Write actions follow the account's permissions, not the role name.
  const readOnly = !permissions.includes("products.write");

  // --- state
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [units, setUnits] = useState([]);

  const [meta, setMeta] = useState({
    totalItems: 0,
    currentPage: 1,
    pageSize: 25,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [compact, setCompact] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sortBy, setSortBy] = useState("id");
  const [status, setStatus] = useState("");
  const [stockStatus, setStockStatus] = useState("");
  const [activeTab, setActiveTab] = useState("products");
  const [stats, setStats] = useState({ total: 0, outOfStock: 0, lowStock: 0, inStock: 0 });

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [advancedConditions, setAdvancedConditions] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const latestProductRequest = useRef(0);

  // modal state
  const [modalState, setModalState] = useState({
    open: false,
    mode: null, // 'view' | 'edit' | 'create'
    product: null,
  });
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);

  // Import modal state
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Hàm fetch categories
  const fetchCategories = useCallback(async () => {
    try {
      const data = await getAllCategories();
      setCategories(Array.isArray(data) ? data : (data?.items || data?.value || []));
    } catch (error) {
      console.error("Lỗi khi tải danh mục:", error);
    }
  }, []);

  // Hàm fetch suppliers
  const fetchSuppliers = useCallback(async () => {
    try {
      const data = await request("/suppliers");
      setSuppliers(Array.isArray(data) ? data : (data?.items || []));
    } catch (error) {
      console.error("Lỗi khi tải nhà cung cấp:", error);
    }
  }, []);

  // Hàm fetch units
  const fetchUnits = useCallback(async () => {
    try {
      const data = await request("/units");
      setUnits(Array.isArray(data) ? data : (data?.items || []));
    } catch (error) {
      console.error("Lỗi khi tải đơn vị:", error);
    }
  }, []);

  // --- debounce search: chỉ cập nhật debouncedSearch (reset page về 1)
  useEffect(() => {
    const t = setTimeout(() => {
      // khi debounce hoàn tất, đặt debouncedSearch và reset page 1
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 450);

    return () => clearTimeout(t);
  }, [search]);

  // --- fetchProducts: stable function, nhận params (p, ps, q)
  const fetchProducts = useCallback(
    async (p = 1, ps = pageSize, q = "") => {
      const requestId = ++latestProductRequest.current;
      // small UX: show loader only if request > 150ms to avoid flicker
      let showLoader = true;
      const loaderTimer = setTimeout(() => {
        if (showLoader && requestId === latestProductRequest.current) setLoading(true);
      }, 150);

      setError(null);
      try {
        const data = advancedConditions.length > 0
          ? await advancedSearchProducts({
              page: p,
              pageSize: ps,
              search: q,
              categoryId: selectedCategory ? Number(selectedCategory) : null,
              supplierId: selectedSupplier ? Number(selectedSupplier) : null,
              minPrice: minPrice === "" ? null : Number(minPrice),
              maxPrice: maxPrice === "" ? null : Number(maxPrice),
              sortBy,
              status: status === "" ? null : Number(status),
              stockStatus,
              conditions: advancedConditions,
            })
          : await getProductsPaginated(
              p,
              ps,
              q,
              selectedCategory || null,
              selectedSupplier || null,
              minPrice || null,
              maxPrice || null,
              sortBy,
              status || null,
              stockStatus
            );
        const itemsArr = data.items ?? data.Items ?? [];
        if (requestId !== latestProductRequest.current) return;
        setItems(itemsArr);
        setMeta({
          totalItems: data.totalItems ?? data.TotalItems ?? itemsArr.length,
          currentPage: data.currentPage ?? data.CurrentPage ?? p,
          pageSize: data.pageSize ?? data.PageSize ?? ps,
          totalPages: data.totalPages ?? data.TotalPages ?? 1,
          hasNext: !!(data.hasNext ?? data.HasNext),
          hasPrevious: !!(data.hasPrevious ?? data.HasPrevious),
        });
      } catch (err) {
        console.error(err);
        if (requestId === latestProductRequest.current) {
          setError(err.message || "Lỗi khi tải sản phẩm");
        }
      } finally {
        showLoader = false;
        clearTimeout(loaderTimer);
        if (requestId === latestProductRequest.current) setLoading(false);
      }
    },
    [
      pageSize,
      selectedCategory,
      selectedSupplier,
      minPrice,
      maxPrice,
      sortBy,
      status,
      stockStatus,
      advancedConditions,
    ]
  );

  // --- gọi fetch chỉ 1 chỗ: khi page / pageSize / debouncedSearch thay đổi
  useEffect(() => {
    fetchCategories();
    fetchSuppliers();
    fetchUnits();
  }, [fetchCategories, fetchSuppliers, fetchUnits]);

  useEffect(() => {
    fetchProducts(page, pageSize, debouncedSearch);
  }, [page, pageSize, debouncedSearch, fetchProducts]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await getInventoryStats();
      setStats({ total: data.total || 0, outOfStock: data.outOfStock || 0, lowStock: data.lowStock || 0, inStock: data.inStock || 0 });
    } catch (err) {
      console.error("Lỗi khi tải thống kê số lượng sản phẩm:", err);
    }
  }, []);

  useRealtimeNotifications({
    StockUpdated: () => {
      fetchProducts(page, pageSize, debouncedSearch);
      fetchStats();
    },
    StockReserved: () => {
      fetchProducts(page, pageSize, debouncedSearch);
      fetchStats();
    },
  });

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const resetFilters = () => {
    setSearch("");
    setSelectedCategory("");
    setSelectedSupplier("");
    setMinPrice("");
    setMaxPrice("");
    setSortBy("newest");
    setStatus("");
    setStockStatus("");
    setAdvancedConditions([]);
    setPage(1);
  };

  const applyAdvancedSearch = (conditions) => {
    setAdvancedConditions(conditions);
    setPage(1);
  };

  const clearAdvancedSearch = () => {
    setAdvancedConditions([]);
    setPage(1);
  };

  // --- Mở modal
  const openModal = useCallback((mode, product = null) => {
    setModalState((current) => {
      if (
        mode === "view" &&
        current.open &&
        current.mode === "view" &&
        current.product?.id === product?.id
      ) {
        return { open: false, mode: null, product: null };
      }

      return {
        open: true,
        mode,
        product: product || {},
      };
    });
  }, []);

  // --- Đóng modal
  const closeModal = useCallback(() => {
    setModalState({
      open: false,
      mode: null,
      product: null,
    });
  }, []);

  // --- Xóa (sử dụng debouncedSearch để refresh consistent)
  const handleDelete = async (id, isActive) => {
    if (readOnly) {
      setNotification({
        type: "error",
        message: "Bạn không có quyền thực hiện thao tác này",
      });
      return;
    }

    if (
      !window.confirm(
        `Bạn có chắc chắn muốn ${
          isActive ? "vô hiệu" : "kích hoạt"
        } sản phẩm này?`
      )
    )
      return;
    try {
      setLoading(true);
      // Explicit target state: repeating the action can never flip the product back.
      await request(`/products/${id}/status?isActive=${!isActive}`, { method: "PATCH" });
      setNotification({
        type: "success",
        message: `${isActive ? "Vô hiệu" : "Kích hoạt"} sản phẩm thành công`,
      });
      await fetchProducts(page, pageSize, debouncedSearch);
    } catch (err) {
      console.error(err);
      setNotification({
        type: "error",
        message:
          `${isActive ? "Vô hiệu" : "Kích hoạt"} sản phẩm không thành công: ` +
          err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  // --- Lưu (create / edit)
  const handleSave = async (productData, mode) => {
    if (readOnly) {
      setNotification({
        type: "error",
        message: "Bạn không có quyền thực hiện thao tác này",
      });
      return;
    }

    setSaving(true);
    setNotification(null);
    try {
      if (mode === "create") {
        await request(`/products`, {
          method: "POST",
          body: JSON.stringify(productData),
        });

        setNotification({
          type: "success",
          message: "Thêm sản phẩm thành công",
        });
      } else {
        const payload = {
          id: productData.id,
          productName: productData.productName,
          price: Number(productData.price ?? 0),
          // Stock is not sent: it changes only through Kho hàng / phiếu nhập so recent sales are never overwritten.
          sku: productData.sku,
          unitId: productData.unitId ? Number(productData.unitId) : null,
          categoryId: productData.categoryId ? Number(productData.categoryId) : null,
          supplierId: productData.supplierId ? Number(productData.supplierId) : null,
          isActive: productData.isActive !== undefined ? !!productData.isActive : true,
          description: productData.description || "",
          imageUrl: productData.imageUrl || "", // Lưu URL đã upload
        };

        await request(`/products/${productData.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });

        setNotification({
          type: "success",
          message: "Cập nhật sản phẩm thành công",
        });
      }

      closeModal();
      await fetchProducts(page, pageSize, debouncedSearch);
    } catch (err) {
      console.error(err);
      const message = `${mode === "create" ? "Thêm" : "Cập nhật"} thất bại: ` + err.message;
      setNotification({ type: "error", message });
      // The create form is a full-screen overlay that hides page notifications; tell it to show the error too.
      return Promise.reject(new Error(message));
    } finally {
      setSaving(false);
    }
  };
  // --- helpers
  const getName = (p) => p.productName ?? p.product_name ?? p.model ?? "—";
  const getPrice = (p) => p.price ?? p.Price ?? 0;
  const getDiscountPrice = (p) => p.discountPrice ?? p.DiscountPrice ?? null;
  const getQty = (p) => p.stockQuantity ?? p.inventory?.quantity ?? p.Quantity ?? 0;
  const getQuantityBadge = (quantity) => {
    if (quantity === 0) return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">Hết hàng</span>;
    if (quantity < 10) return <span className="px-2 py-1 text-xs rounded-full bg-amber-100 text-amber-800">Sắp hết</span>;
    return <span className="px-2 py-1 text-xs rounded-full bg-emerald-100 text-emerald-800">Còn hàng</span>;
  };
  return (
    <div className="p-1 sm:p-2">
      <div className="w-full">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-gray-800">
            Danh sách sản phẩm
          </h1>

          <div className="flex flex-wrap items-center gap-2">
            <ExportExcelButton type="products" />
            <input
              type="text"
              placeholder="Tìm kiếm sản phẩm..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-2 border rounded-md focus:outline-none focus:ring focus:border-primary-300"
            />
      
            {!readOnly && (
              <>
                <button
                  className="px-3 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700"
                  onClick={() => setImportModalOpen(true)}
                >
                  Import
                </button>
                <button
                  className="px-3 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700"
                  onClick={() => openModal("create")}
                >
                  Thêm sản phẩm
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-1 mb-3 bg-gray-100 rounded-xl p-1 w-fit">
          <button onClick={() => setActiveTab("products")} className={`px-5 py-2 rounded-lg text-sm font-semibold ${activeTab === "products" ? "bg-white text-primary-700 shadow-sm" : "text-gray-600"}`}>📦 Danh sách sản phẩm</button>
          <button onClick={() => setActiveTab("history")} className={`px-5 py-2 rounded-lg text-sm font-semibold ${activeTab === "history" ? "bg-white text-primary-700 shadow-sm" : "text-gray-600"}`}>📋 Lịch sử biến động</button>
        </div>

        {activeTab === "history" ? <InventoryHistory /> : <>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <div className="bg-white px-3 py-2 rounded-md shadow-sm border-l-4 border-primary-500"><div className="text-sm text-gray-600">Tổng sản phẩm</div><div className="text-xl font-bold text-gray-800">{stats.total}</div></div>
          <div className="bg-white px-3 py-2 rounded-md shadow-sm border-l-4 border-red-500"><div className="text-sm text-gray-600">Hết hàng</div><div className="text-xl font-bold text-red-600">{stats.outOfStock}</div></div>
          <div className="bg-white px-3 py-2 rounded-md shadow-sm border-l-4 border-amber-500"><div className="text-sm text-gray-600">Sắp hết hàng</div><div className="text-xl font-bold text-amber-600">{stats.lowStock}</div></div>
          <div className="bg-white px-3 py-2 rounded-md shadow-sm border-l-4 border-emerald-500"><div className="text-sm text-gray-600">Còn hàng</div><div className="text-xl font-bold text-emerald-600">{stats.inStock}</div></div>
        </div>

        {/* BỘ LỌC */}
        <div className="bg-white p-4 rounded-md shadow-sm mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
            {/* Danh mục */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Danh mục
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring focus:border-primary-300 text-sm"
              >
                <option value="">Tất cả danh mục</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Nhà cung cấp */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Nhà cung cấp
              </label>
              <select
                value={selectedSupplier}
                onChange={(e) => {
                  setSelectedSupplier(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring focus:border-primary-300 text-sm"
              >
                <option value="">Tất cả nhà cung cấp</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Giá từ */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">Giá từ</label>
              <input
                type="number"
                placeholder="0"
                value={minPrice}
                onChange={(e) => {
                  setMinPrice(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring focus:border-primary-300 text-sm"
              />
            </div>

            {/* Giá đến */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Giá đến
              </label>
              <input
                type="number"
                placeholder="9999999"
                value={maxPrice}
                onChange={(e) => {
                  setMaxPrice(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring focus:border-primary-300 text-sm"
              />
            </div>

            {/* Sắp xếp */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Sắp xếp
              </label>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring focus:border-primary-300 text-sm"
              >
                <option value="">Mặc định</option>
                <option value="newest">Mới nhất</option>
                <option value="oldest">Cũ nhất</option>
                <option value="price_asc">Giá tăng dần</option>
                <option value="price_desc">Giá giảm dần</option>
                <option value="name_asc">Tên A-Z</option>
                <option value="name_desc">Tên Z-A</option>
                <option value="featured">Nổi bật</option>
                <option value="bestsellers">Bán chạy</option>
                <option value="budget">Giá thấp</option>
                <option value="quantity_asc">Số lượng thấp → cao</option>
                <option value="quantity_desc">Số lượng cao → thấp</option>
                <option value="updated_at_desc">Số lượng cập nhật mới nhất</option>
              </select>
            </div>

            {/* Trạng thái */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Trạng thái
              </label>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring focus:border-primary-300 text-sm"
              >
                <option value="">Mặc định</option>
                <option value="1"> Hoạt động</option>
                <option value="0"> Vô hiệu</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">Số lượng</label>
              <select value={stockStatus} onChange={(e) => { setStockStatus(e.target.value); setPage(1); }} className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring focus:border-primary-300 text-sm">
                <option value="">Tất cả</option><option value="out_of_stock">Hết hàng</option><option value="low_stock">Sắp hết (&lt; 10)</option><option value="in_stock">Còn hàng (≥ 10)</option>
              </select>
            </div>

            {/* Nút reset filters */}
            <div className="flex items-end">
              <button
                onClick={resetFilters}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Xóa bộ lọc
              </button>
            </div>
          </div>
        </div>

        {notification && (
          <div
            className={`mb-3 p-2 rounded ${
              notification.type === "success"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {notification.message}
          </div>
        )}

        <div className={`grid items-start gap-3 ${modalState.open && modalState.mode !== "create" ? "xl:grid-cols-[minmax(0,1.75fr)_minmax(320px,0.8fr)]" : "grid-cols-1"}`}>
        <section className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <TableDisplayControls pageSize={pageSize} compact={compact} onCompactChange={setCompact} disabled={loading}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
          <span className="text-sm text-gray-500">{meta.totalItems} sản phẩm</span>
        </div>
        <div className="management-table-scroll bg-white rounded-md shadow-sm" key={`${page}-${pageSize}`}>
          <table className="management-table min-w-full divide-y divide-gray-200" data-compact={compact}>
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                  Id
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">
                  Ảnh
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                  Tên
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  Giá / Giá giảm
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">
                  ĐVT
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">
                  Tồn
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                  Nhà cung cấp
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                  Danh mục
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">
                  Trạng thái
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">
                  Hành động
                </th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-6 text-center">
                    Đang tải...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-red-600">
                    {error}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-gray-500">
                    Không có sản phẩm
                  </td>
                </tr>
              ) : (
                items.map((p, idx) => (
                  <tr key={p.id ?? idx} onClick={() => openModal("view", p)} title="Bấm để xem hoặc ẩn chi tiết" className={`cursor-pointer hover:bg-primary-50/60 ${modalState.open && modalState.mode === "view" && modalState.product?.id === p.id ? "bg-primary-50" : ""}`}>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {(meta.currentPage - 1) * meta.pageSize + idx + 1}
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={(event) => { event.stopPropagation(); openModal("view", p); }} aria-label={`Xem chi tiết ${getName(p)}`} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-primary-600">
                        <ProductThumbnail imagePath={p.imageUrl || p.image_url || (p.id ? `/assets/images/products/product-${p.id}.jpg` : "")} name={getName(p)} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-800">
                      {getName(p)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <div className="text-primary-600 font-semibold">{formatPrice(getPrice(p))}</div>
                      {getDiscountPrice(p) != null && getDiscountPrice(p) < getPrice(p) && (
                        <div className="mt-1 text-red-600 font-semibold">
                          Giảm: {formatPrice(getDiscountPrice(p))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-gray-600">
                      {p.unitName || p.unitCode || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      <div className="flex flex-col items-center gap-1"><span className={getQty(p) === 0 ? "text-red-600 font-semibold" : getQty(p) < 10 ? "text-amber-600 font-semibold" : "text-emerald-600 font-semibold"}>{getQty(p)}</span>{getQuantityBadge(getQty(p))}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div>{p.supplier?.name || "—"}</div>
                      {p.region && (
                        <span className="mt-1 inline-flex rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
                          Miền {p.region}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {p.category?.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      {p.isActive ? (
                        <span className="text-emerald-600">Hoạt động</span>
                      ) : (
                        <span className="text-red-500">Vô hiệu</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-center" onClick={(event) => event.stopPropagation()}>
                      <div className="table-actions flex items-center justify-center gap-2">
                        {!readOnly && (
                          <>
                            <button
                              onClick={() => openModal("edit", p)}
                              className="px-2 py-1 bg-amber-100 rounded text-amber-800 hover:bg-amber-200"
                            >
                              Sửa
                            </button>
                            <button
                              onClick={() => handleDelete(p.id, p.isActive)}
                              className={`px-2 py-1  rounded ${
                                p.isActive
                                  ? "bg-red-100 text-red-800 hover:bg-red-200"
                                  : "text-emerald-800 bg-emerald-100 hover:bg-emerald-200"
                              } `}
                            >
                              {p.isActive ? "Vô hiệu" : "Kích hoạt"}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-gray-600">
            Hiển thị{" "}
            <strong>
              {meta.totalItems ? (meta.currentPage - 1) * meta.pageSize + 1 : 0} -{" "}
              {Math.min(meta.currentPage * meta.pageSize, meta.totalItems)}
            </strong>{" "}
            / {meta.totalItems} sản phẩm
          </div>

          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
              onClick={() => setPage(1)}
              disabled={loading || meta.currentPage === 1}
            >
              Đầu
            </button>
            <button
              className="px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
              onClick={() => setPage(Math.max(1, meta.currentPage - 1))}
              disabled={loading || !meta.hasPrevious}
            >
              Trước
            </button>

            <span className="px-3 py-1 rounded-md bg-white border">
              {meta.currentPage} / {Math.max(1, meta.totalPages)}
            </span>

            <button
              className="px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
              onClick={() =>
                setPage(Math.min(meta.totalPages, meta.currentPage + 1))
              }
              disabled={loading || !meta.hasNext}
            >
              Sau
            </button>
            <button
              className="px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
              onClick={() => setPage(meta.totalPages)}
              disabled={loading || !meta.hasNext}
            >
              Cuối
            </button>
          </div>
        </div>
        </section>

        {modalState.open && modalState.mode !== "create" && (
          <div className="management-detail-panel min-w-0">
            <ProductModal
              embedded
              mode={readOnly ? "view" : modalState.mode}
              product={modalState.product}
              onSave={handleSave}
              onCreatePurchaseOrder={!readOnly ? (product) => navigate("/purchase-orders", { state: { prefillProduct: product } }) : undefined}
              onCancel={closeModal}
              onDelete={() => {
                if (modalState.product?.id && !readOnly) {
                  handleDelete(modalState.product.id, modalState.product.isActive !== false);
                  closeModal();
                }
              }}
              saving={saving}
              categories={categories}
              suppliers={suppliers}
              units={units}
            />
          </div>
        )}
        </div>
        </>}
      </div>

      {/* Universal Modal */}
      {modalState.open && modalState.mode === "create" && (
        <ProductModal
          mode={readOnly ? "view" : modalState.mode}
          product={modalState.product}
          onSave={handleSave}
          onCreatePurchaseOrder={!readOnly ? (product) => navigate("/purchase-orders", { state: { prefillProduct: product } }) : undefined}
          onCancel={closeModal}
          onDelete={() => {
            if (modalState.product?.id && !readOnly) {
              handleDelete(modalState.product.id, modalState.product.isActive !== false);
              closeModal();
            }
          }}
          saving={saving}
          categories={categories}
          suppliers={suppliers}
          units={units}
        />
      )}

      {/* Import Modal */}
      {!readOnly && (
        <ImportModal
          isOpen={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          onSuccess={() => {
            // Refresh product list after successful import
            fetchProducts(page, pageSize, debouncedSearch);
            setNotification({
              type: "success",
              message: "Import sản phẩm thành công",
            });
          }}
          type="products"
        />
      )}

    </div>
  );
}
