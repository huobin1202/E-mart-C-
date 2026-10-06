import React, { useState, useEffect } from "react";
import { getProductByBarcode } from "../../api/apiClient";

export default function DetailOrderForm({
  openProductModal,
  isCreateMode,
  listOrderProducts,
  setListOrderProducts,
  selectedProduct,
  setSelectedProduct,
  setCurrentOrder
}) {
  const [current, setCurrent] = useState({
    id: "",
    product: "",
    price: 0,
    qty: 1,
    total: 0,
  });

  const [mode, setMode] = useState("add"); // add | edit
  const [editIndex, setEditIndex] = useState(null);
  const [barcodeInput, setBarcodeInput] = useState("");

  const handleBarcodeScan = async (e) => {
    if (e.key === "Enter" && barcodeInput.trim()) {
      e.preventDefault();
      try {
        const prod = await getProductByBarcode(barcodeInput.trim());
        if (prod) {
          setCurrent({
            id: prod.id,
            product: prod.productName,
            price: prod.price,
            qty: 1,
            total: prod.price,
            quantity: prod.inventory?.quantity || 999,
          });
          setBarcodeInput("");
        } else {
          alert(`Không tìm thấy sản phẩm có mã vạch: ${barcodeInput}`);
        }
      } catch (err) {
        alert(`Không tìm thấy sản phẩm có mã vạch: ${barcodeInput}`);
      }
    }
  };

  // Khi chọn sản phẩm từ ProductModal
  useEffect(() => {
    if (selectedProduct) {
      setCurrent({
        id: selectedProduct.id,
        product: selectedProduct.name,
        price: selectedProduct.price,
        qty: 1,
        total: selectedProduct.price,
        quantity: selectedProduct.quantity// Tổng số lượng sản phẩm của sản phầm nha khác qty
      });
    }
  }, [selectedProduct]);

  // Khi thay đổi qty hoặc price
  useEffect(() => {
    setCurrent(prev => ({ ...prev, total: prev.price * prev.qty }));
  }, [current.price, current.qty]);

  // Keep both total field names in sync: the API uses totalAmount while older
  // order-form code also reads total_amount.
  const updateCurrentOrderTotals = (updatedList) => {
    const subtotal = updatedList.reduce((sum, item) => sum + item.total, 0);
    setCurrentOrder((prev) => {
      const totalAmount = Math.max(0, subtotal - Number(prev?.discount || 0));
      return { ...prev, subtotal, totalAmount, total_amount: totalAmount };
    });
  };

  // Thêm sản phẩm
  const handleAdd = () => {
    if (!current.product) return;
    // Kiểm tra vượt quá số lượng tồn kho
    if (current.qty > current.quantity) {
      alert(`Số lượng mua (${current.qty}) vượt quá số lượng tồn kho (${current.quantity}) của sản phẩm!`);
      return;
    }

    const updatedList = [...listOrderProducts, current];
    setListOrderProducts(updatedList);
    updateCurrentOrderTotals(updatedList);
    resetForm();
  };

  // Lưu chỉnh sửa
  const handleSaveEdit = () => {
    if (editIndex === null) return;

     //  Kiểm tra vượt số lượng tồn kho
    if (current.qty > current.quantity) {
      alert(`Số lượng mua (${current.qty}) vượt quá số lượng tồn kho (${current.quantity}) của sản phẩm!`);
      return;
    }

    const updatedList = [...listOrderProducts];
    updatedList[editIndex] = current;
    setListOrderProducts(updatedList);
    updateCurrentOrderTotals(updatedList);
    resetForm();
  };

  // Xóa sản phẩm
  const handleDelete = (index) => {
    const updatedList = listOrderProducts.filter((_, i) => i !== index);
    setListOrderProducts(updatedList);
    updateCurrentOrderTotals(updatedList);
    if (editIndex === index) resetForm();
  };

  // Chọn sản phẩm để chỉnh sửa
  const handleEdit = (index) => {
    setCurrent(listOrderProducts[index]);
    setMode("edit");
    setEditIndex(index);
  };

  const resetForm = () => {
    setCurrent({ id: "", product: "", price: 0, qty: 1, total: 0, quantity:0 });
    setSelectedProduct(null);
    setMode("add");
    setEditIndex(null);
  };

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-xl mb-6 border-2 border-gray-400">
      <h4 className="text-xl font-bold text-gray-800 mb-4">CHI TIẾT ĐƠN HÀNG</h4>

      {isCreateMode === "create" && (
        <div className="space-y-4 mb-4">
          {/* Ô quét mã vạch */}
          <div className="bg-white p-3 rounded-lg border border-indigo-200">
            <label className="block text-xs font-bold text-indigo-700 mb-1">
              📟 Quét mã vạch (Barcode):
            </label>
            <input
              type="text"
              placeholder="Quét mã vạch hoặc nhập mã rồi nhấn Enter..."
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={handleBarcodeScan}
              className="w-full px-3 py-1.5 border border-indigo-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sản phẩm</label>
            <div className="flex gap-2">
              <input
                readOnly
                placeholder="Chưa chọn sản phẩm..."
                value={current.product || "Vui lòng chọn sản phẩm"}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-sm font-medium"
              />
              <button
                className="px-3 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                onClick={openProductModal}
              >
                Chọn
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Giá</label>
              <input
                type="number"
                value={current.price}
                onChange={e => setCurrent({ ...current, price: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Số lượng</label>
              {/* <input
                type="number"
                min="1"
                value={current.qty}
                onChange={e => setCurrent({ ...current, qty: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              /> */}
              <input
                type="number"
                min="1"
                max={current.quantity}
                value={current.qty}
                onChange={e => {
                  const value = Number(e.target.value);
                  if (value > current.quantity) {
                    alert(`Bạn chỉ có thể mua tối đa ${current.quantity} sản phẩm này!`);
                    return;
                  }
                  setCurrent({ ...current, qty: value });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tổng tiền</label>
              <input
                type="text"
                readOnly
                value={current.total.toLocaleString()}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-sm font-medium"
              />
            </div>
          </div>

          <div className="flex gap-3">
            {mode === "add" ? (
              <button
                onClick={handleAdd}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
              >
                Thêm chi tiết
              </button>
            ) : (
              <>
                <button
                  onClick={handleSaveEdit}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
                >
                  Lưu chỉnh sửa
                </button>
                <button
                  onClick={resetForm}
                  className="px-5 py-2.5 bg-gray-600 text-white rounded-lg font-bold hover:bg-gray-700"
                >
                  Hủy
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="mb-6">
        <h4 className="text-xl font-bold text-gray-800 mb-3">DANH SÁCH SẢN PHẨM</h4>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gradient-to-r from-gray-100 to-gray-200">
              <tr>
                <th className="px-5 py-3 text-left font-bold">Mã SP</th>
                <th className="px-5 py-3 text-left font-bold">Tên SP</th>
                <th className="px-5 py-3 text-center font-bold">SL</th>
                <th className="px-5 py-3 text-right font-bold">Giá</th>
                <th className="px-5 py-3 text-right font-bold">Tổng</th>
                {isCreateMode === "create" && <th className="px-5 py-3 text-center font-bold">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {listOrderProducts.length === 0 ? (
                <tr>
                  <td colSpan={isCreateMode === "create" ? 6 : 5} className="text-center py-4 text-gray-500 italic">
                    Chưa có sản phẩm nào
                  </td>
                </tr>
              ) : (
                listOrderProducts.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-3">{item.id}</td>
                    <td className="px-5 py-3">{item.product}</td>
                    <td className="px-5 py-3 text-center">{item.qty}</td>
                    <td className="px-5 py-3 text-right">{Number(item.price).toLocaleString()}</td>
                    <td className="px-5 py-3 text-right font-bold text-blue-600">{Number(item.total).toLocaleString()}</td>
                    {isCreateMode === "create" && (
                      <td className="px-5 py-3 text-center space-x-2">
                        <button onClick={() => handleEdit(index)} className="text-xs text-blue-600 hover:underline font-medium">Sửa</button>
                        <button onClick={() => handleDelete(index)} className="text-xs text-red-600 hover:underline font-medium">Xóa</button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
