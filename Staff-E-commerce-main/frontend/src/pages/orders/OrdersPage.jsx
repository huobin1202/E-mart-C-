import React from "react";
import OrdersForm from "../../components/orders/OrderForm";
import OrderTable from "../../components/orders/OrderTable";
import CustomerModal from "../../components/orders/CustomerModal";
import ProductModal from "../../components/orders/ProductModal";
import { useOrders } from "../../hook/useOrders";

export default function OrdersPage() {
  const handleSearch = () => {
      setCurrentPage(1);
      loadOrdersAdvanced(1);
  };

  const handleFilterDate = () => {
    // Kiểm tra ngày
    if (selectedStartDate && selectedEndDate) {
      const start = new Date(selectedStartDate);
      const end = new Date(selectedEndDate);

      if (start > end) {
        alert("Ngày bắt đầu không được lớn hơn ngày kết thúc!");
        return; // dừng hàm
      }
    }

    // Reset trang về 1
    setCurrentPage(1);
    loadOrdersAdvanced(1);
  };

  
  const { 
    showCustomerModal,
    showProductModal,
    showOrderModal, 
    closeOrderModal,
    openCustomerModal,
    closeCustomerModal,
    openProductModal,
    closeProductModal,
    ordersFormMode,
    createNewOrder,
    currentOrder,
    setCurrentOrder ,
    payment,
    setPayment,
    updateCustomer,
    listOrderProducts,
    setListOrderProducts,
    selectedProduct, 
    setSelectedProduct,
    promotion,
    setPromotion,
    click_buttonCreateNewOrder,
    listOrders,
    currentPage,
 
    totalPages,
    setCurrentPage,
    
    setSelectedStatus,
    selectedStartDate,
    selectedEndDate,
    setSelectedStartDate,
    setSelectedEndDate,
    setSearchKeyword,
    loadOrdersAdvanced ,
    showOrder,
    cancelOrder,
    completePendingOrder


 

    
  } = useOrders();
  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6">

      {/* Lọc trạng thái + Tạo đơn hàng */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label className="text-sm font-bold text-gray-700 whitespace-nowrap">
            Lọc trạng thái:
          </label>
          <select
              onChange={(e) => {
                setCurrentPage(1);
                setSelectedStatus(e.target.value);
                console.log("Trạng thái đang được chọn",e.target.value );
              }}
            className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="pending">Chưa xử lý</option>
            <option value="processing">Đang xử lý</option>
            <option value="paid">Đã thanh toán</option>
            <option value="completed">Hoàn thành</option>
            <option value="cancelled">Đã hủy</option>
          </select>
        </div>

        <button
          onClick={createNewOrder}
          className="w-full sm:w-auto px-6 py-3 bg-purple-500 text-white rounded-lg font-bold hover:bg-blue-700 shadow-lg transition"
        >
          Tạo Đơn Hàng Mới
        </button>
      </div>

      {/* Tìm kiếm */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          onChange={(e) => setSearchKeyword(e.target.value)}
          placeholder="Tìm theo tên khách hoặc tên nhân viên"
          className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={handleSearch}
          className="px-6 py-3 bg-purple-500 text-white rounded-lg font-bold hover:bg-blue-700"
        >
          Tìm Kiếm
        </button>
      </div>

      {/* Lọc theo ngày */}
      <div className="flex gap-3 mb-6">
        <input
          type="date"
          
          onChange={(e) => setSelectedStartDate(e.target.value)}
          className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg"
        />
        <input
          type="date"
          
          onChange={(e) => setSelectedEndDate(e.target.value)}
          className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg"
        />
        <button
          onClick={handleFilterDate}
          className="px-6 py-3 bg-purple-500 text-white rounded-lg font-bold hover:bg-blue-700"
        >
          Lọc
        </button>
      </div>
      

      {/* Form đơn hàng */}
      {showOrderModal && <OrdersForm 
      onClose={closeOrderModal} 
      openCustomerModal={openCustomerModal}
      openProductModal={openProductModal} 
      mode = {ordersFormMode} 
      currentOrder={currentOrder}
      setCurrentOrder={setCurrentOrder}
      payment={payment}
      setPayment={setPayment}
      listOrderProducts={listOrderProducts}
      setListOrderProducts={setListOrderProducts}
      selectedProduct={selectedProduct}
      setSelectedProduct={setSelectedProduct}
      promotion={promotion}
      setPromotion={setPromotion}
      click_buttonCreateNewOrder={click_buttonCreateNewOrder}
      completePendingOrder={completePendingOrder}
     


      
     />}
  

      {/* Danh sách đơn hàng*/}
      <OrderTable
        cancelOrder={cancelOrder}
        showOrder={showOrder}
        listOrders={listOrders}
        currentPage={currentPage}
        totalPages={totalPages}
        onPrev={() => {
          if (currentPage > 1) {
            setCurrentPage(currentPage - 1);
          }
        }}
        onNext={() => {
          if (currentPage < totalPages) {
            setCurrentPage(currentPage + 1);
          }
        }}
      />


      {/* Modal chọn khách hàng */}
      {showCustomerModal && <CustomerModal 
      onClose={closeCustomerModal}  
      updateCustomer ={updateCustomer}
      />}

      {/* Modal chọn sản phẩm */}
      {showProductModal && <ProductModal 
      onClose={closeProductModal}       
      selectedProduct={selectedProduct}
      setSelectedProduct={setSelectedProduct} 
      />}

    </div>
  );
}
