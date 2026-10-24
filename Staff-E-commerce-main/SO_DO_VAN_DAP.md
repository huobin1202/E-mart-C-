# Sơ đồ vấn đáp kiến trúc GUI - BUS - DAO

Tài liệu này được đối chiếu với mã nguồn hiện tại ngày 2026-10-24.

## Câu 1. Câu truy vấn, lệnh truy xuất Database và vị trí viết hàm

Đây là một nhóm câu hỏi liên quan với nhau, dùng để giải thích đầy đủ đường đi của dữ liệu trong kiến trúc GUI - BUS - DAO.

Ba ý hỏi thuộc cùng Câu 1:

1. **Câu 1.1:** Câu truy vấn nằm ở đâu?
2. **Câu 1.2:** Lệnh truy xuất Database nằm ở đâu?
3. **Câu 1.3:** Viết hàm ở đâu?

Phần trả lời chi tiết của Câu 1.2 và Câu 1.3 được đặt bên dưới các mục kiến trúc, Cache và hiệu năng để đối chiếu đúng file/dòng code.

### 1.1. Câu truy vấn nằm ở đâu?

DAO/Repository là tầng duy nhất truy cập `AppDbContext` và thực hiện đọc/ghi dữ liệu:

- [ProductRepository.cs](backend/Repository/ProductRepository.cs): `GetAllForCacheAsync()` dòng 22, `CreateAsync()` dòng 73, `UpdateAsync()` dòng 84, `DeleteAsync()` dòng 92.
- [OrderRepository.cs](backend/Repository/OrderRepository.cs): `GetAllForCacheAsync()` dòng 171, `GetAllOnlineOrdersAsync()` dòng 37 và các hàm cập nhật trạng thái đơn hàng.
- [CategoryRepository.cs](backend/Repository/CategoryRepository.cs): `GetAllAsync()` dòng 19, `CreateAsync()` dòng 31, `UpdateAsync()` dòng 38, `DeleteAsync()` dòng 45.
- [CustomerRepository.cs](backend/Repository/CustomerRepository.cs): `GetAllAsync()` dòng 23, `AddAsync()` dòng 51, `UpdateAsync()` dòng 59, `DeleteAsync()` dòng 67.
- Các Repository còn lại trong [backend/Repository/](backend/Repository/) giữ cùng quy tắc: mỗi thao tác đọc/ghi là một hàm riêng theo đối tượng.

Các hàm tìm kiếm từ khóa kiểu `LIKE`/`Contains(keyword)` đã được loại khỏi Repository. Những `.Contains(...)` còn lại là kiểm tra tập ID trong các giao dịch, không phải tìm kiếm người dùng.

### 1.2. Lệnh truy xuất Database ở đâu?

Khi giảng viên hỏi “lệnh truy xuất Database nằm ở đâu?”, trả lời theo nguyên tắc:

> Lệnh truy xuất Database nằm ở tầng DAO/Repository. BUS không tự mở kết nối và GUI không truy cập Database trực tiếp.

Cụ thể:

- Lấy danh sách sản phẩm: [ProductRepository.cs](backend/Repository/ProductRepository.cs:22), hàm `GetAllForCacheAsync()`. Các lệnh LINQ như `_context.Products`, `Include()`, `ToListAsync()` được EF Core dịch thành SQL và thực thi tại Database.
- Lấy danh sách hóa đơn: [InvoiceRepository.cs](backend/Repository/InvoiceRepository.cs:18), các hàm đọc hóa đơn và map sang `InvoiceDTO`.
- Lấy danh sách đơn hàng: [OrderRepository.cs](backend/Repository/OrderRepository.cs:171), hàm `GetAllForCacheAsync()`.
- Thêm/sửa/xóa sản phẩm: [ProductRepository.cs](backend/Repository/ProductRepository.cs:73), [ProductRepository.cs](backend/Repository/ProductRepository.cs:84), [ProductRepository.cs](backend/Repository/ProductRepository.cs:92).
- Thêm/sửa/xóa các đối tượng khác được tổ chức tương tự trong thư mục [backend/Repository/](backend/Repository/).

Luồng thực thi là:

```text
GUI gọi API
  → Controller tiếp nhận request
  → BUS/Service xử lý nghiệp vụ và kiểm tra Cache
  → DAO/Repository thực thi _context...ToListAsync/SaveChangesAsync
  → Database trả dữ liệu về DAO
```

### 1.3. Viết hàm ở đâu?

Khi giảng viên hỏi “hàm được viết ở đâu?”, phân loại theo trách nhiệm:

| Loại hàm | Vị trí | Ví dụ |
|---|---|---|
| Hàm truy xuất Database | DAO/Repository | `GetAllForCacheAsync()`, `CreateAsync()`, `UpdateAsync()`, `DeleteAsync()` trong [ProductRepository.cs](backend/Repository/ProductRepository.cs:22) |
| Hàm nghiệp vụ, Cache, tìm kiếm RAM | BUS/Service | `GetPaginatedProductsAsync()` và `SearchProductsAsync()` trong [ProductService.cs](backend/Services/ProductService.cs:351) |
| Hàm tiếp nhận HTTP và trả response | Controller | `GetPaginatedProducts()` trong [ProductsController.cs](backend/Controllers/ProductsController.cs:22) |
| Hàm xử lý sự kiện/gọi API giao diện | GUI React | `request()` trong [apiClient.js](frontend/src/api/apiClient.js:119), các handler trong [ProductList.jsx](frontend/src/pages/products/ProductList.jsx:243) |

Nguyên tắc trả lời ngắn gọn:

- Cần lấy/ghi Database: viết hàm ở DAO.
- Cần lọc, tìm kiếm RAM, kiểm tra nghiệp vụ, cập nhật Cache: viết hàm ở BUS.
- Cần bắt sự kiện nút bấm, nhập liệu, chọn dòng: viết hàm ở GUI.
- Không viết SQL, `DbContext`, `Connection` hoặc `Repository` trực tiếp trong GUI/BUS.

## 2. GUI gọi xuống BUS ở đâu?

- React GUI gọi qua API client tập trung tại [apiClient.js](frontend/src/api/apiClient.js:119), hàm `request()`.
- Ví dụ màn hình sản phẩm gọi API BUS qua `request()` tại [ProductList.jsx](frontend/src/pages/products/ProductList.jsx:243), dòng xóa; dòng 276, dòng tạo; dòng 313, dòng cập nhật.
- Ở backend, Controller chỉ nhận request và gọi Service/BUS, không khởi tạo Repository. Ví dụ [ProductsController.cs](backend/Controllers/ProductsController.cs:12) inject `ProductService`, và gọi BUS tại dòng 44, 122, 143, 250, 276.
- Luồng hóa đơn: [InvoiceController.cs](backend/Controllers/InvoiceController.cs:12) inject `InvoiceService`; BUS gọi [InvoiceRepository.cs](backend/Repository/InvoiceRepository.cs).

## 3. Cache 15 phút và tìm kiếm RAM ở đâu?

- Cơ chế dùng chung nằm tại [BusMemoryCache.cs](backend/Services/BusMemoryCache.cs:21), `GetOrCreateAsync()`.
- Kiểm tra cache còn hạn nằm tại [BusMemoryCache.cs](backend/Services/BusMemoryCache.cs:69), điều kiện dùng `DateTimeOffset.UtcNow - _lastFetchTime <= ttl`.
- Mỗi BUS đặt TTL 15 phút, ví dụ [ProductService.cs](backend/Services/ProductService.cs:17), [OrderService.cs](backend/Services/OrderService.cs:22), [InventoryService.cs](backend/Services/InventoryService.cs:82), [StorefrontService.cs](backend/Services/StorefrontService.cs:14).
- Tìm kiếm sản phẩm trên RAM tại [ProductService.cs](backend/Services/ProductService.cs:350), tìm kiếm đơn hàng trên RAM tại [OrderService.cs](backend/Services/OrderService.cs:173), và các BUS khác lọc từ kết quả `GetOrCreateAsync()` tương tự.
- Đồng bộ CRUD cache dùng `AddOrUpdate()`/`RemoveWhere()` tại [BusMemoryCache.cs](backend/Services/BusMemoryCache.cs:108) và [BusMemoryCache.cs](backend/Services/BusMemoryCache.cs:93). Giảm tồn kho cập nhật trực tiếp cache tại [InventoryService.cs](backend/Services/InventoryService.cs:63).

## 4. Đo thời gian và RAM ở đâu?

- Đo thời gian và RAM cho mọi lần cache hit/cache miss tại [BusMemoryCache.cs](backend/Services/BusMemoryCache.cs:25), sử dụng `Stopwatch` và `GC.GetTotalMemory(false)`.
- Log phân biệt nguồn `RAM Cache` hoặc `Database` tại [BusMemoryCache.cs](backend/Services/BusMemoryCache.cs:57), gồm milliseconds và MB.
- Bộ đo BUS dùng chung bổ sung tại [BusPerformance.cs](backend/Services/BusPerformance.cs:10), đang được dùng trong [CategoryService.cs](backend/Services/CategoryService.cs:42).


## Kết luận audit

- Không phát hiện SQL hoặc đối tượng kết nối CSDL trong Controller/Service.
- Không phát hiện GUI gọi trực tiếp Repository/DAO.
- Không còn DAO tìm kiếm từ khóa bằng `LIKE`/`Contains(keyword)`.
- Backend build hiện tại: 0 lỗi biên dịch; vẫn còn cảnh báo nullable/legacy cần xử lý riêng nếu yêu cầu tuyệt đối 0 warning.
- Các endpoint ghi dữ liệu chưa được gọi trong smoke test để tránh làm thay đổi cơ sở dữ liệu thật.
