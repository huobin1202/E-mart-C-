

export default function OrderTable(  {showOrder,listOrders,
  cancelOrder,
  currentPage,
  totalPages,
  onPrev,
  onNext}) {
  

  return (
    <div className="bg-white rounded-xl shadow-xl overflow-hidden">
      <div className="p-6 border-b bg-gradient-to-r from-gray-100 to-gray-200">
        <h3 className="text-2xl font-bold text-gray-800">DANH SÁCH ĐƠN HÀNG</h3>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-100 to-gray-200">
            <tr>
              <th className="px-6 py-4 text-left font-bold">Mã đơn</th>
              <th className="px-6 py-4 text-left font-bold">Ngày mua hàng</th>
              <th className="px-6 py-4 text-left font-bold">Khách</th>
              <th className="px-6 py-4 text-left font-bold">NV</th>
              <th className="px-6 py-4 text-right font-bold">Tiền</th>
              <th className="px-6 py-4 text-center font-bold">Trạng thái</th>
              <th className="px-6 py-4 text-center font-bold">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y">
              {Array.isArray(listOrders) && listOrders.length > 0 ? (
                listOrders.map((item, index) => {
                  // Định dạng tiền VND
                  const formattedAmount = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.totalAmount);

                  return (
                    <tr key={index} className="hover:bg-gray-50 transition">
                      {/* Mã đơn: giảm độ đậm */}
                      <td className="px-6 py-4 font-medium">{item.orderNumber}</td>

                      
                      {/* Ngày mua hàng: format dd/MM/yyyy và màu theo trạng thái */}
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-sm font-medium ${
                          item.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          item.status === 'paid' ? 'bg-blue-100 text-blue-600' :
                          item.status === 'processing' ? 'bg-indigo-100 text-indigo-700' :
                          item.status === 'completed' ? 'bg-green-100 text-green-600' :
                          item.status === 'cancelled' ? 'bg-red-100 text-red-600' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {new Date(item.createdAt).toLocaleDateString('vi-VN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          })}
                        </span>
                      </td>

                      {/* Khách */}
                      <td className="px-6 py-4"> {item.customerName?.trim() ? item.customerName : "Khách vãng lai"}</td>

                      {/* NV */}
                      <td className="px-6 py-4">{item.userName}</td>

                      {/* Tiền: format VND */}
                      <td className="px-6 py-4 text-right font-bold text-green-700">{formattedAmount}</td>

                      {/* Trạng thái: màu riêng */}
                      <td className="px-6 py-4 text-center">
                        <span className={`px-3 py-1 text-sm font-bold rounded-full ${
                          item.status === 'pending' ? 'text-yellow-800 bg-yellow-100' :
                          item.status === 'paid' ? 'text-blue-600 bg-blue-100' :
                          item.status === 'processing' ? 'text-indigo-700 bg-indigo-100' :
                          item.status === 'completed' ? 'text-green-600 bg-green-100' :
                          item.status === 'cancelled' ? 'text-red-600 bg-red-100' :
                          'text-gray-600 bg-gray-100'
                        }`}>
                          {item.status === "pending" ? "Chưa xử lý" :
                            item.status === "processing" ? "Đang xử lý" :
                            item.status === "completed" ? "Hoàn thành" :
                            item.status === "cancelled" ? "Đã hủy" : item.status}
                        </span>
                      </td>


                      {/* Thao tác */}
                      <td className="px-6 py-4 text-center space-x-2">
                        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
                         onClick={() => showOrder(index)}
                        >
                          Xem
                        </button>
                        {item.status === "pending" && (
                          <button 
                            className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700"
                            onClick={() => cancelOrder(item.id)}
                          >
                            Hủy
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-4">
                    Không có đơn hàng
                  </td>
                </tr>
              )}
            </tbody>

        </table>
      </div>

      <div className="flex items-center justify-between p-5 border-t bg-gray-50">
        <button 
          onClick={onPrev}
          disabled={currentPage === 1}
          className="px-6 py-3 border rounded-lg disabled:opacity-50 font-bold">Trước</button>

        <span className="text-sm font-bold"> Trang <strong>{currentPage}</strong> / <strong>{totalPages}</strong></span>

        <button 
          onClick={onNext}
          disabled={currentPage === totalPages}
          className="px-6 py-3 border rounded-lg disabled:opacity-50 font-bold">Sau</button>
      </div>
    </div>
  );
}
