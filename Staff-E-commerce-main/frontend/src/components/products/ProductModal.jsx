import React, { useEffect, useState } from "react";
import CustomSelect from "../ui/CustomSelect";
import { request } from "../../api/apiClient";
import { getAllCategories } from "../../api/categoryApi";

const ProductModal = ({
  title = null,
  product = null,
  mode = "view",
  onSave,
  onCancel,
  onDelete,
  saving = false,
  categories = [],
  suppliers = [],
  units = [],
}) => {
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});

  // Fallback options nếu component cha chưa tải xong
  const [categoryList, setCategoryList] = useState(Array.isArray(categories) ? categories : []);
  const [supplierList, setSupplierList] = useState(Array.isArray(suppliers) ? suppliers : []);
  const [unitList, setUnitList] = useState(Array.isArray(units) ? units : []);

  useEffect(() => {
    if (Array.isArray(categories) && categories.length > 0) {
      setCategoryList(categories);
    } else {
      getAllCategories()
        .then((data) => {
          const list = Array.isArray(data) ? data : (data?.items || data?.value || []);
          if (list.length > 0) setCategoryList(list);
        })
        .catch(() => {});
    }
  }, [categories]);

  useEffect(() => {
    if (Array.isArray(suppliers) && suppliers.length > 0) {
      setSupplierList(suppliers);
    } else {
      request("/suppliers")
        .then((data) => {
          const list = Array.isArray(data) ? data : (data?.items || []);
          if (list.length > 0) setSupplierList(list);
        })
        .catch(() => {});
    }
  }, [suppliers]);

  useEffect(() => {
    if (Array.isArray(units) && units.length > 0) {
      setUnitList(units);
    } else {
      request("/units")
        .then((data) => {
          const list = Array.isArray(data) ? data : (data?.items || []);
          if (list.length > 0) setUnitList(list);
        })
        .catch(() => {});
    }
  }, [units]);

  // Khởi tạo formData
  useEffect(() => {
    if (mode === "create") {
      setFormData({
        productName: "",
        price: "",
        sku: "",
        unitId: "",
        categoryId: "",
        supplierId: "",
        description: "",
        imageUrl: "",
        imageFile: null,
        isActive: true,
      });
      setErrors({});
    } else if (product) {
      const p = product;
      setFormData({
        id: p.id,
        productName: p.productName || p.product_name || p.name || "",
        price: p.price !== undefined && p.price !== null ? p.price : "",
        sku: p.sku || p.barcode || "",
        unitId: p.unitId || p.unit?.id || p.unit_id || "",
        categoryId: p.categoryId || p.category?.id || p.category_id || "",
        supplierId: p.supplierId || p.supplier?.id || p.supplier_id || "",
        description: p.description || "",
        imageUrl: p.imageUrl || p.image_url || "",
        imageFile: null,
        isActive: p.isActive !== undefined ? p.isActive : true,
        createdAt: p.created_at || p.createdAt || "",
      });
      setErrors({});
    }
  }, [mode, product]);

  // Khi ở mode edit, tải thông tin chi tiết đầy đủ từ backend để đảm bảo không thiếu field nào
  useEffect(() => {
    if (mode === "edit" && product?.id) {
      request(`/products/${product.id}`)
        .then((detail) => {
          if (detail) {
            setFormData((prev) => ({
              ...prev,
              id: detail.id,
              productName: prev.productName || detail.productName || "",
              price: prev.price !== "" && prev.price !== undefined ? prev.price : detail.price,
              sku: prev.sku || detail.sku || detail.barcode || "",
              unitId: prev.unitId || detail.unitId || detail.unit?.id || "",
              categoryId: prev.categoryId || detail.categoryId || detail.category?.id || "",
              supplierId: prev.supplierId || detail.supplierId || detail.supplier?.id || "",
              description: prev.description !== undefined && prev.description !== "" ? prev.description : (detail.description || ""),
              imageUrl: prev.imageUrl || detail.imageUrl || "",
              isActive: prev.isActive !== undefined ? prev.isActive : detail.isActive,
            }));
          }
        })
        .catch(() => {});
    }
  }, [mode, product?.id]);

  const modalTitle =
    title ||
    {
      create: "Thêm sản phẩm mới",
      edit: "Sửa sản phẩm",
      view: "Chi tiết sản phẩm",
    }[mode];

  // Validate dữ liệu trước khi lưu
  const validate = () => {
    const newErrors = {};

    const name = (formData.productName || (mode === "edit" ? product?.productName : ""))?.trim();
    if (!name) {
      newErrors.productName = "Tên sản phẩm không được để trống";
    }

    const priceVal = formData.price !== "" && formData.price !== undefined
      ? formData.price
      : (mode === "edit" ? product?.price : "");
    if (!priceVal || isNaN(priceVal) || Number(priceVal) <= 0) {
      newErrors.price = "Giá phải là số lớn hơn 0";
    }

    if (mode === "create") {
      const skuVal = formData.sku?.trim();
      if (!skuVal) {
        newErrors.sku = "SKU không được để trống";
      } else if (!/^[a-zA-Z0-9_-]+$/.test(skuVal)) {
        newErrors.sku = "SKU chỉ được chứa chữ, số, gạch dưới hoặc gạch ngang";
      }

      if (!formData.unitId || Number(formData.unitId) <= 0) {
        newErrors.unitId = "Đơn vị không được để trống";
      }

      const hasSupplier = !!formData.supplierId && formData.supplierId !== "";
      const hasCategory = !!formData.categoryId && formData.categoryId !== "";
      if (!hasSupplier && !hasCategory) {
        newErrors.supplierOrCategory = "Phải chọn ít nhất Nhà cung cấp hoặc Danh mục";
      }
    } else {
      // Ở chế độ sửa: chỉ kiểm tra SKU nếu người dùng chủ động sửa
      if (formData.sku && !/^[a-zA-Z0-9_-]+$/.test(formData.sku.trim())) {
        newErrors.sku = "SKU chỉ được chứa chữ, số, gạch dưới hoặc gạch ngang";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFieldChange = (field, value) => {
    if (mode === "view") return;
    setFormData((prev) => ({ ...prev, [field]: value }));

    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }

    if (field === "imageUrl" && value) {
      setFormData((prev) => ({ ...prev, imageFile: null }));
    }
  };

  const handleSave = async () => {
    if (mode === "view") return;
    if (!validate()) return;

    let finalImageUrl = formData.imageUrl;

    // Nếu có file upload từ máy
    if (formData.imageFile) {
      try {
        const productId = mode === "edit" && product?.id ? product.id : null;
        const uploadedUrl = await uploadImage(formData.imageFile, productId);
        finalImageUrl = uploadedUrl;
      } catch (error) {
        console.error("Lỗi upload ảnh:", error);
        alert("Lỗi upload ảnh. Vui lòng thử lại.");
        return;
      }
    }

    const resolvedName = formData.productName?.trim() || product?.productName || product?.name || "Sản phẩm";
    const resolvedPrice = Number(formData.price) || Number(product?.price) || 0;
    const resolvedSku = formData.sku?.trim() || product?.sku || product?.barcode || `SKU-${product?.id || Date.now()}`;
    const resolvedUnitId = formData.unitId ? Number(formData.unitId) : (product?.unitId ? Number(product.unitId) : (unitList[0]?.id || 1));
    const resolvedCategoryId = formData.categoryId ? Number(formData.categoryId) : (product?.categoryId ? Number(product.categoryId) : (product?.category?.id ? Number(product.category.id) : null));
    const resolvedSupplierId = formData.supplierId ? Number(formData.supplierId) : (product?.supplierId ? Number(product.supplierId) : (product?.supplier?.id ? Number(product.supplier.id) : null));

    const saveData = {
      ...(product || {}),
      ...formData,
      id: mode === "edit" ? (product?.id || formData.id) : undefined,
      productName: resolvedName,
      price: resolvedPrice,
      sku: resolvedSku,
      unitId: resolvedUnitId,
      categoryId: resolvedCategoryId,
      supplierId: resolvedSupplierId,
      imageUrl: finalImageUrl || product?.imageUrl || "",
      description: formData.description !== undefined ? formData.description : (product?.description || ""),
      isActive: formData.isActive !== undefined ? formData.isActive : (product?.isActive !== undefined ? product.isActive : true),
    };

    onSave?.(saveData, mode);
  };

  // Hàm upload ảnh với productId
  const uploadImage = async (file, productId = null) => {
    const formData = new FormData();
    formData.append("image", file);

    // Thêm productId vào query string nếu có
    const url = productId
      ? `http://localhost:5099/api/products/upload-image?productId=${productId}`
      : "http://localhost:5099/api/products/upload-image";

    const response = await fetch(url, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error("Upload failed");
    const data = await response.json();
    return data.imageUrl;
  };

  // Hàm getImageUrl để hiển thị ảnh
  const getImageUrl = (imageUrl) => {
    if (!imageUrl) {
      return "http://localhost:5099/assets/images/products/default.jpg";
    }

    // Nếu là đường dẫn tương đối từ backend
    if (imageUrl.startsWith("/assets/")) {
      return `http://localhost:5099${imageUrl}`;
    }

    // Nếu là blob URL (preview khi chọn file từ máy)
    if (imageUrl.startsWith("blob:")) {
      return imageUrl;
    }

    // Nếu là URL đầy đủ từ internet
    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      return imageUrl;
    }

    return "http://localhost:5099/assets/images/products/default.jpg";
  };

  function getImageSource() {
    // 1) Nếu có imageUrl trong formData
    if (formData.imageUrl && formData.imageUrl.trim() !== "") {
      return getImageUrl(formData.imageUrl);
    }

    // 2) Nếu có product.id, thử load ảnh theo pattern product-{id}.jpg
    if (product?.id) {
      // Thêm timestamp để force reload ảnh mới sau khi upload
      return `http://localhost:5099/assets/images/products/product-${
        product.id
      }.jpg?t=${Date.now()}`;
    }

    // 3) Fallback - ảnh mặc định
    return "http://localhost:5099/assets/images/products/default.jpg";
  }

  const isEditing = mode === "edit" || mode === "create";
  const isView = mode === "view";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-md w-full max-w-4xl p-4 shadow-lg">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold">{modalTitle}</h3>
          {onDelete && mode !== "create" && (
            <button
              className="text-red-600 text-sm hover:text-red-800"
              onClick={onDelete}
            >
              Xóa
            </button>
          )}
        </div>

        <div className="flex gap-4">
          {/* --- CỘT TRÁI: ẢNH SẢN PHẨM --- */}
          <div className="w-1/3">
            <label className="text-xs text-gray-600 mb-2 block">
              Hình ảnh sản phẩm
            </label>
            {isView ? (
              <div children>
                <div className="border rounded bg-gray-50 aspect-square flex items-center justify-center">
                  <img
                    // src={getImageSource()}
                    src={getImageSource()}
                    alt={formData.productName}
                    className="w-full h-full object-cover rounded"
                    onError={(e) => {
                      // fallback cuối nếu ảnh không tồn tại
                      e.target.src =
                        "http://localhost:5099/assets/images/products/default.jpg";
                    }}
                  />
                </div>
                <label className="text-xs text-gray-600 mb-2 block">
                  Ngày tạo: {formData.createdAt}
                </label>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="border rounded bg-gray-50 aspect-square flex items-center justify-center">
                  {formData.imageUrl ? (
                    <img
                      src={getImageUrl(formData.imageUrl)}
                      alt={formData.productName || "Preview"}
                      className="w-full h-full object-cover rounded"
                      onError={(e) => {
                        e.target.src =
                          "http://localhost:5099/assets/images/products/default.jpg";
                      }}
                    />
                  ) : (
                    <div className="text-gray-400 text-sm">Chưa có ảnh</div>
                  )}
                </div>
                {/* Input file ẩn */}
                <input
                  type="file"
                  id="image-upload"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      // Tạo URL tạm thời để preview
                      const imageUrl = URL.createObjectURL(file);
                      setFormData((prev) => ({
                        ...prev,
                        imageFile: file,
                        imageUrl: imageUrl,
                      }));
                    }
                  }}
                />
                {/* Button chọn ảnh */}
                <button
                  type="button"
                  onClick={() =>
                    document.getElementById("image-upload").click()
                  }
                  className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50 hover:border-indigo-300 transition-colors"
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    {formData.imageFile ? "Chọn ảnh khác" : "Chọn ảnh từ máy"}
                  </div>
                </button>

                <div className="relative">
                  <input
                    type="text"
                    className="w-full border px-2 py-1 rounded text-sm pr-20"
                    placeholder="Hoặc nhập URL ảnh..."
                    value={
                      formData.imageFile
                        ? ""
                        : formData.imageUrl?.startsWith("blob:")
                        ? ""
                        : formData.imageUrl || ""
                    }
                    onChange={(e) =>
                      handleFieldChange("imageUrl", e.target.value)
                    }
                    disabled={!!formData.imageFile}
                  />
                  <div className="absolute right-1 top-1 text-xs text-gray-400">
                    URL
                  </div>
                </div>

                {formData.imageFile && (
                  <button
                    type="button"
                    onClick={() => {
                      // Revoke blob URL để tránh memory leak
                      if (formData.imageUrl?.startsWith("blob:")) {
                        URL.revokeObjectURL(formData.imageUrl);
                      }
                      setFormData((prev) => ({
                        ...prev,
                        imageFile: null,
                        imageUrl: product?.imageUrl || "", // Reset về ảnh cũ nếu có
                      }));
                    }}
                    className="w-full text-xs text-red-600 hover:text-red-800"
                  >
                    Xóa file đã chọn
                  </button>
                )}

                <p className="text-xs text-gray-500">
                  Chọn ảnh từ máy hoặc nhập URL hình ảnh
                </p>
              </div>
            )}
          </div>
          <div className="w-2/3">
            <div className="grid grid-cols-2 gap-3">
              {/* --- TÊN SẢN PHẨM --- */}
              <div>
                <label className="text-xs text-gray-600">Tên sản phẩm *</label>
                {isView ? (
                  <div className="p-2 border rounded bg-gray-50">
                    {formData.productName || "—"}
                  </div>
                ) : (
                  <>
                    <input
                      className={`w-full border px-2 py-1 rounded ${
                        errors.productName ? "border-red-500" : ""
                      }`}
                      value={formData.productName || ""}
                      onChange={(e) =>
                        handleFieldChange("productName", e.target.value)
                      }
                    />
                    {errors.productName && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors.productName}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* --- SKU --- */}
              <div>
                <label className="text-xs text-gray-600">SKU</label>
                {isView ? (
                  <div className="p-2 border rounded bg-gray-50">
                    {formData.sku}
                  </div>
                ) : (
                  <>
                    <input
                      className={`w-full border px-2 py-1 rounded ${
                        errors.sku ? "border-red-500" : ""
                      }`}
                      value={formData.sku}
                      onChange={(e) => handleFieldChange("sku", e.target.value)}
                    />
                    {errors.sku && (
                      <p className="text-xs text-red-500 mt-1">{errors.sku}</p>
                    )}
                  </>
                )}
              </div>

              {/* --- GIÁ --- */}
              <div>
                <label className="text-xs text-gray-600">Giá *</label>
                {isView ? (
                  <div className="p-2 border rounded bg-gray-50">
                    {formatPrice(formData.price) || "—"}
                  </div>
                ) : (
                  <>
                    <input
                      type="number"
                      className={`w-full border px-2 py-1 rounded ${
                        errors.price ? "border-red-500" : ""
                      }`}
                      value={formData.price || ""}
                      onChange={(e) =>
                        handleFieldChange("price", e.target.value)
                      }
                    />
                    {errors.price && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors.price}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* --- ĐƠN VỊ --- */}
              <div>
                <label className="text-xs text-gray-600">Đơn vị *</label>
                {isView ? (
                  <div className="p-2 border rounded bg-gray-50">
                    {product?.unitName ||
                      unitList.find((u) => u.id === Number(formData.unitId))?.name ||
                      "—"}
                  </div>
                ) : (
                  <>
                    <CustomSelect
                      options={unitList.map((u) => ({
                        value: u.id,
                        label: `${u.name} (${u.code})`,
                      }))}
                      value={
                        formData.unitId
                          ? unitList
                              .filter((u) => u.id === Number(formData.unitId))
                              .map((u) => ({
                                value: u.id,
                                label: `${u.name} (${u.code})`,
                              }))[0] || null
                          : null
                      }
                      onChange={(option) =>
                        handleFieldChange("unitId", option?.value || "")
                      }
                      placeholder="-- Chọn đơn vị --"
                      error={!!errors.unitId}
                      isSearchable={true}
                    />
                    {errors.unitId && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors.unitId}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* --- NHÀ CUNG CẤP --- */}
              <div>
                <label className="text-xs text-gray-600">Nhà cung cấp *</label>
                {isView ? (
                  <div className="p-2 border rounded bg-gray-50">
                    {supplierList.find((s) => s.id === Number(formData.supplierId))
                      ?.name || product?.supplier?.name || "—"}
                  </div>
                ) : (
                  <>
                    <select
                      className={`w-full border px-2 py-1 rounded ${
                        errors.supplierId || errors.supplierOrCategory
                          ? "border-red-500"
                          : ""
                      }`}
                      value={formData.supplierId !== undefined && formData.supplierId !== null ? String(formData.supplierId) : ""}
                      onChange={(e) =>
                        handleFieldChange("supplierId", e.target.value)
                      }
                    >
                      <option value="">-- Chọn nhà cung cấp --</option>

                      {supplierList.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                    {errors.supplierOrCategory && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors.supplierOrCategory}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* --- DANH MỤC --- */}
              <div>
                <label className="text-xs text-gray-600">Danh mục *</label>
                {isView ? (
                  <div className="p-2 border rounded bg-gray-50">
                    {categoryList.find((c) => c.id === Number(formData.categoryId))
                      ?.name || product?.category?.name || "—"}
                  </div>
                ) : (
                  <>
                    <select
                      className={`w-full border px-2 py-1 rounded ${
                        errors.categoryId || errors.supplierOrCategory
                          ? "border-red-500"
                          : ""
                      }`}
                      value={formData.categoryId !== undefined && formData.categoryId !== null ? String(formData.categoryId) : ""}
                      onChange={(e) =>
                        handleFieldChange("categoryId", e.target.value)
                      }
                    >
                      <option value="">-- Chọn danh mục --</option>

                      {categoryList.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    {errors.supplierOrCategory && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors.supplierOrCategory}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* --- MÔ TẢ --- */}
              <div>
                <label className="text-xs text-gray-600">Mô tả</label>
                {isView ? (
                  <div className="p-2 border rounded bg-gray-50">
                    {formData.description || "Không có mô tả"}
                  </div>
                ) : (
                  <textarea
                    className="w-full border px-2 py-1 rounded"
                    value={formData.description || ""}
                    onChange={(e) =>
                      handleFieldChange("description", e.target.value)
                    }
                    rows={3}
                  />
                )}
              </div>

              {/* --- CHECKBOX ĐANG HOẠT ĐỘNG --- */}
              <div>
                <label className="text-xs text-gray-600">
                  Trạng thái hoạt động
                </label>
                {(() => {
                  const statusColor = formData.isActive
                    ? "bg-green-500"
                    : "bg-red-500";
                  const statusText = formData.isActive
                    ? "Đang hoạt động"
                    : "Ngừng hoạt động";
                  return isView ? (
                    <div className="flex items-center gap-2 p-2 py-2.5 border rounded bg-gray-50">
                      <div
                        className={`w-3 h-3 rounded-full ${statusColor}`}
                      ></div>
                      <span className="text-sm">{statusText}</span>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isActive || false}
                        onChange={(e) =>
                          handleFieldChange("isActive", e.target.checked)
                        }
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700">
                        Đang hoạt động
                      </span>
                    </label>
                  );
                })()}
              </div>

              {/* --- BUTTONS --- */}
              <div className="col-span-2 flex items-center justify-end gap-2">
                <button className="px-3 py-1 rounded border" onClick={onCancel}>
                  Hủy
                </button>
                {!isView && (
                  <button
                    className="px-3 py-1 rounded bg-indigo-600 text-white"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving
                      ? "Đang lưu..."
                      : mode === "create"
                      ? "Thêm mới"
                      : "Lưu"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const formatPrice = (v) => {
  if (v == null) return "—";
  try {
    return Intl.NumberFormat("vi-VN").format(Number(v)) + " ₫";
  } catch {
    return v;
  }
};

export default ProductModal;
