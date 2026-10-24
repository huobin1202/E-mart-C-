# QA Auditor – Cross-check GUI/BUS/DAO

Ngày audit: 2026-10-24  
Phạm vi: backend ASP.NET Core, GUI React tại `frontend`, các luồng đọc dữ liệu và cache.

## Tổng kết

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| 1. Build/zero compile error | [PASS - ĐẠT] | `dotnet build store-management.sln --no-restore`: 0 Error; frontend `npm run build`: PASS; `npm run lint`: 0 error, còn 2 warning Hook tại `frontend/src/hook/useAudit.js:31` và `frontend/src/pages/reports/ReportsPage.jsx:55`. |
| 2. GUI/BUS/DAO | [PASS - ĐẠT] | Controller inject Service, ví dụ `backend/Controllers/ProductsController.cs:12`; GUI gọi API client tại `frontend/src/api/apiClient.js:119`; không có SQL/DbConnection trong `backend/Controllers`, `backend/Services`, `frontend/src`, `customer-app/src`. |
| 3. Cache RAM 15 phút | [PASS - ĐẠT có phạm vi] | Cache dùng chung tại `backend/Services/BusMemoryCache.cs:21`, TTL tại `backend/Services/ProductService.cs:17`, tìm kiếm RAM tại `backend/Services/ProductService.cs:351`; các service giao dịch/command-only không có danh sách đọc để cache. |
| 4. Đo hiệu năng | [PASS - ĐẠT] | `Stopwatch`/`GC.GetTotalMemory` tại `backend/Services/BusMemoryCache.cs:25`, log `Database`/`RAM Cache` tại `backend/Services/BusMemoryCache.cs:57`. Runtime đã ghi nhận cả hai nguồn. |
| 5. Sơ đồ vấn đáp | [PASS - ĐẠT sau khi bổ sung] | [SO_DO_VAN_DAP.md](SO_DO_VAN_DAP.md) đã được tạo và đối chiếu số dòng với mã nguồn hiện tại. |

## Vi phạm đã phát hiện và đã sửa

1. `CategoryRepository`, `CustomerRepository`, `InventoryRepository` còn các hàm lọc/tìm kiếm ở database. Đã xóa các hàm dead/search cũ; lọc hiện ở BUS trên cache.
2. `ProductService.GetAvailableProductsAsync` từng gọi DAO phân trang trực tiếp. Đã chuyển sang lọc `ProductDTO` từ cache tại `backend/Services/ProductService.cs:327`.
3. Giảm tồn kho từng xóa cache khiến lần xem sau đọc lại toàn bộ DB. Đã bổ sung `BusMemoryCache.UpdateWhere()` và đồng bộ số lượng RAM tại `backend/Services/InventoryService.cs:63`.
4. Thiếu đo hiệu năng cho các cache khác ngoài Category. Đã đưa đo thời gian/RAM vào `BusMemoryCache`, phân biệt rõ Database và RAM Cache.
5. Frontend có 7 lỗi ESLint unused. Đã sửa các import/biến/hàm không sử dụng; hiện còn 0 lỗi ESLint.
6. Thiếu `SO_DO_VAN_DAP.md`. Đã bổ sung tài liệu bản đồ vấn đáp.

## Kiểm tra SQL/search

Không còn `LIKE` hoặc `Contains(keyword)` trong Repository. Các `.Contains(...)` còn lại chỉ dùng để kiểm tra tập ID trong giao dịch, ví dụ `productIds.Contains(id)`, không phải tìm kiếm giao diện.

Các câu SQL khởi tạo schema/migration tại `backend/Data` và kiểm tra bảo mật tại `backend/Security` là hạ tầng khởi động, không thuộc GUI/BUS/DAO nghiệp vụ. Không di chuyển chúng vì có thể làm thay đổi thứ tự khởi tạo schema và vi phạm yêu cầu giữ nguyên CSDL.

## Điểm còn cần xử lý nếu yêu cầu tuyệt đối 0 warning

- Hai React Hook warning tại `useAudit.js:31` và `ReportsPage.jsx:55`.
- 22 cảnh báo nullable/legacy trong backend khi build đầy đủ compiler analysis; không có lỗi biên dịch.
- Hai warning Vite về annotation của thư viện SignalR và cảnh báo chunk JS lớn; không phải lỗi mã nguồn ứng dụng.

Vì vậy, kết luận QA nghiêm ngặt là: luồng nghiệp vụ hiện đã tuân thủ GUI → BUS → DAO và cache RAM cho các BUS danh sách; chưa nên ghi “100% không cảnh báo” cho toàn project cho tới khi xử lý các warning nêu trên.

## Kiểm thử route bổ sung

- Đã gọi 68 GET route bằng JWT admin: 66 route trả HTTP 200, 0 lỗi 5xx.
- Hai HTTP 404 là dữ liệu hợp lệ không tồn tại: barcode mẫu không có giá trị và không có online order ID tương ứng trong database.
- Đã gọi 31 route ghi dữ liệu không kèm JWT: 30 route bị chặn HTTP 401 đúng; route tạo đơn storefront trả HTTP 400 do validation payload, không ghi dữ liệu.
- Các endpoint báo cáo có đủ tham số ngày đều trả HTTP 200.
- Các endpoint cache được gọi lặp lại; log xác nhận lần đầu `Nguồn: Database`, lần sau `Nguồn: RAM Cache`.
