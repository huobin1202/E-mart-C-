# ĐẶC TẢ YÊU CẦU ĐỒ ÁN

> **Mục đích:** Tổng hợp đầy đủ các yêu cầu kỹ thuật của giảng viên và dùng làm checklist theo dõi tiến độ triển khai.
>
> **Quy ước:** Đánh dấu `[x]` sau khi hạng mục đã được triển khai và kiểm thử đạt yêu cầu.

---

## 1. Tối ưu truy vấn và tái sử dụng bộ nhớ (In-Memory Caching)

### 1.1. Cơ chế tái sử dụng

- [ ] Khi người dùng thực hiện tìm kiếm, lọc hoặc thống kê nhiều lần liên tiếp, hệ thống bắt buộc phải tái sử dụng dữ liệu trên bộ nhớ tạm, cụ thể là danh sách in-memory đã tải về.
- [ ] Không gửi câu truy vấn xuống cơ sở dữ liệu liên tục cho từng thao tác tìm kiếm, lọc hoặc thống kê trong cùng thời gian hiệu lực của cache.
- [ ] Xác nhận đây là yêu cầu bắt buộc; nếu không có cơ chế tái sử dụng bộ nhớ thì đồ án sẽ bị trừ điểm.

### 1.2. Thời gian sống của phiên/cache (Session/Cache TTL)

- [ ] Thiết lập thời gian hết hạn cho bộ nhớ tạm ở một trong các mức khoảng **5 phút, 10 phút hoặc 15 phút**.
- [ ] Chỉ cho phép đọc hoặc truy vấn lại dữ liệu mới từ Database sau khi hết thời gian hiệu lực đã cấu hình.
- [ ] Bảo đảm người dùng thao tác liên tục không làm hệ thống gửi hàng chục câu truy vấn xuống Database chỉ trong một phút.

### 1.3. Tiêu chí nghiệm thu

- [ ] Có thể chứng minh lần tải đầu tiên lấy dữ liệu từ Database.
- [ ] Có thể chứng minh các lần tìm kiếm, lọc hoặc thống kê tiếp theo trong thời gian TTL sử dụng dữ liệu từ bộ nhớ tạm.
- [ ] Có thể chứng minh dữ liệu được đọc lại từ Database sau khi cache hết hạn.

---

## 2. Chức năng Bộ lọc và Tìm kiếm nâng cao (Advanced Filter & Search)

> **Phạm vi triển khai:** Bộ lọc nâng cao dành cho **customer app**, mở từ nút **Tùy chọn tìm kiếm** trong danh sách sản phẩm. Giao diện popup nổi trên nền tối, ô từ khóa ở phía trên, nội dung bộ lọc cuộn độc lập và thanh thao tác cố định phía dưới; danh mục nhiều lựa chọn, thanh kéo và ô nhập khoảng giá, khuyến mãi, tình trạng, số kết quả xem trước và nút thiết lập lại/tìm kiếm. Theo điều chỉnh giao diện: bỏ trình tạo điều kiện AND/OR/NOT; dùng NOT theo từng nhóm để loại trừ lựa chọn (danh mục, khoảng giá, khuyến mãi, tình trạng, miền). Các nhóm kết hợp AND, nhiều danh mục/miền trong nhóm kết hợp OR; khoảng giá gồm hai biên. Bộ xử lý so sánh cũ vẫn được giữ, giao diện không còn nhập toán tử tùy ý. Lọc miền Bắc/Trung/Nam theo địa chỉ nhà cung cấp; miền chưa xác định không khớp khi chọn miền. Lọc trực tiếp trên danh sách đã tải trong bộ nhớ, không gọi API khi thay đổi điều kiện. Đã bỏ khung advanced search khỏi trang sản phẩm quản trị. Kiểm thử logic tự động và build đã đạt; cần nghiệm thu giao diện trên thiết bị thực tế.

### 2.1. Nguồn dữ liệu lọc

- [x] Thực hiện lọc trực tiếp trên danh sách in-memory đã được cache theo yêu cầu tại Phần 1.
- [x] Không gửi truy vấn xuống Database cho mỗi lần người dùng thay đổi điều kiện lọc khi cache vẫn còn hiệu lực.

### 2.2. Toán tử logic

- [x] Hỗ trợ toán tử `AND` để yêu cầu đồng thời thỏa mãn nhiều điều kiện.
- [x] Hỗ trợ toán tử `OR` để chấp nhận một trong nhiều điều kiện.
- [x] Hỗ trợ toán tử `NOT` để phủ định điều kiện lọc.

### 2.3. Toán tử so sánh

- [x] Hỗ trợ toán tử lớn hơn: `>`.
- [x] Hỗ trợ toán tử nhỏ hơn: `<`.
- [x] Hỗ trợ toán tử lớn hơn hoặc bằng: `>=`.
- [x] Hỗ trợ toán tử nhỏ hơn hoặc bằng: `<=`.
- [x] Hỗ trợ toán tử bằng: `==`.
- [x] Hỗ trợ toán tử khác: `!=` hoặc `<>`.

### 2.4. Lọc theo địa lý

- [x] Hỗ trợ phân loại dữ liệu theo ba miền: **Bắc, Trung, Nam**.
- [x] Hỗ trợ lọc và hiển thị dữ liệu theo từng miền **Bắc**, **Trung** hoặc **Nam**.

---

## 3. Thiết kế giao diện Main - Sub Form (Tính tiện dụng / Usability)

- [ ] Thiết kế giao diện theo mô hình **Main - Sub Form** nhằm đáp ứng yêu cầu về tính tiện dụng (Usability).

> Phần yêu cầu được cung cấp hiện chỉ xác định tên chức năng và mục tiêu về tính tiện dụng, chưa kèm mô tả chi tiết hoặc bảng mẫu bổ sung.

---

## 4. Tối ưu không gian hiển thị dữ liệu cho người quản lý (UI/UX cho Quản lý)

### 4.1. Phân biệt đối tượng sử dụng

- [ ] Phân biệt rõ mục tiêu thiết kế giữa giao diện khách hàng và giao diện người quản lý.
- [ ] Giao diện khách hàng cần đẹp, bắt mắt và có khả năng thu hút người dùng mua hàng.
- [ ] Giao diện **người quản lý** phải ưu tiên hiển thị được **nhiều dữ liệu nhất có thể**, đồng thời vẫn rõ ràng và dễ theo dõi.

### 4.2. Tối đa hóa số dòng hiển thị

- [ ] Thiết kế chiều cao dòng ở mức vừa phải để tăng số dòng dữ liệu có thể hiển thị trong một khung nhìn.
- [ ] Thiết kế khoảng cách `padding` và `margin` giữa các khung hoặc các dòng ở mức hợp lý.
- [ ] Không để dòng hoặc khoảng cách quá rộng gây lãng phí diện tích hiển thị.
- [ ] Bảo đảm dữ liệu cô đọng nhưng không gây rối mắt cho người quản lý.

### 4.3. Mục tiêu sử dụng

- [ ] Hiển thị được nhiều dòng hóa đơn nhất có thể trên một khung nhìn vì hệ thống có thể phát sinh hàng trăm hóa đơn mỗi ngày.
- [ ] Giúp người quản lý hạn chế tối đa thao tác cuộn chuột (scroll).
- [ ] Duy trì khả năng đọc, phân biệt và theo dõi dữ liệu rõ ràng khi mật độ hiển thị cao.

### 4.4. Đợt triển khai giao diện quản lý nhiều dòng

> Đã bổ sung code cho bốn danh sách **hóa đơn, sản phẩm, khách hàng, đơn hàng**; đang chờ kiểm thử trực tiếp và xác nhận. Chưa đánh dấu hoàn thành nghiệm thu.

- [ ] Kiểm tra chế độ **Dòng gọn** bật mặc định, giảm chiều cao dòng và khoảng trống nhưng vẫn đọc được dữ liệu, thao tác được các nút.
- [ ] Kiểm tra lựa chọn **10 / 25 / 50 / 100 dòng mỗi trang**, mặc định 25; đổi số dòng đưa về trang 1 và giữ các điều kiện lọc.
- [ ] Kiểm tra tiêu đề bảng cố định khi cuộn danh sách, bố cục tận dụng chiều rộng màn hình.
- [ ] Kiểm tra nút **Ẩn chi tiết / Hiện chi tiết** ở màn hình hóa đơn; chọn một hóa đơn sẽ mở lại chi tiết tương ứng.
- [ ] Chạy các bước trong [KIEM_THU_GIAO_DIEN_QUAN_LY.md](KIEM_THU_GIAO_DIEN_QUAN_LY.md) và xác nhận trước khi chuyển sang đợt tối ưu cache.

---

## 5. Chức năng Thống kê (Hiển thị nhanh & Báo cáo Pivot Table)

> Đã bổ sung trang **Báo cáo thống kê hóa đơn**, thống kê hóa đơn trong ngày trên Dashboard, bốn Pivot, xuất Excel và in/lưu PDF; thêm xuất Excel sản phẩm/khách hàng và sửa xác thực luồng nhập Excel. Xem [kiểm thử thống kê](KIEM_THU_THONG_KE.md) để chạy đối chiếu và nghiệm thu giao diện. Các checkbox nghiệm thu vẫn để mở cho đến khi kiểm tra trực tiếp với Database thực tế.

### 5.1. Thống kê nhanh (Realtime/Daily Summary)

- [ ] Hiển thị trực tiếp các chỉ số thường xuyên trong ngày ngay trên giao diện chính.
- [ ] Hiển thị **tổng tiền trong ngày**.
- [ ] Hiển thị **tổng số hóa đơn trong ngày**.
- [ ] Tái sử dụng dữ liệu từ bộ nhớ tạm tại Phần 1 để tính toán các chỉ số thống kê nhanh.
- [ ] Không truy vấn Database liên tục khi người dùng xem hoặc làm mới các chỉ số trong thời gian cache còn hiệu lực.

### 5.2. Các báo cáo thống kê chi tiết

#### Câu a — Tổng tiền hóa đơn theo khoảng ngày

- [ ] Cho phép người dùng chọn `ngày A` và `ngày B`.
- [ ] Tính tổng tiền hóa đơn phát sinh trong khoảng từ `ngày A` đến `ngày B`.
- [ ] Hiển thị rõ khoảng thời gian và tổng tiền tương ứng.

#### Câu b — Tổng tiền hóa đơn theo tháng, quý, năm và các năm

- [ ] Thống kê tổng tiền hóa đơn theo **tháng**.
- [ ] Thống kê tổng tiền hóa đơn theo **quý**.
- [ ] Thống kê tổng tiền hóa đơn theo **năm**.
- [ ] Hỗ trợ thống kê và so sánh **qua các năm**.
- [ ] Trình bày kết quả dưới dạng bảng chéo (Pivot Table).
- [ ] Các dòng của bảng gồm **Tổng thu**, **Tổng chi** và **Lợi nhuận**.
- [ ] Cột cuối của bảng là **Tổng cộng (TC)**.

**Bảng mẫu bắt buộc:**

| 2026          | quý 1 | q2 | q3 | ... | TC |
| ------------- | ----- | -- | -- | --- | -- |
| **tổng thu**  |       |    |    |     |    |
| **tổng chi**  |       |    |    |     |    |
| **lợi nhuận** |       |    |    |     |    |

#### Câu c — Tổng tiền hóa đơn theo nhân viên và năm

- [ ] Thống kê tổng tiền hóa đơn theo từng **nhân viên** và từng **năm**.
- [ ] Trình bày kết quả dưới dạng bảng hai chiều.
- [ ] Các dòng là danh sách nhân viên.
- [ ] Có dòng **Tổng cộng** ở cuối bảng.
- [ ] Các cột là danh sách các năm.
- [ ] Có cột **TC** ở cuối bảng.

**Bảng mẫu bắt buộc:**

| nhân viên:      | 2024 | 2025 | ... | ... | TC |
| --------------- | ---- | ---- | --- | --- | -- |
| **nhân viên 1** |      |      |     |     |    |
| **nhân viên 2** |      |      |     |     |    |
| **...**         |      |      |     |     |    |
| **Tổng cộng:**  | ..   |      |     |     |    |

#### Câu d — Tổng tiền hóa đơn theo sản phẩm, quý và năm

- [ ] Thống kê tổng tiền hóa đơn theo từng **sản phẩm**.
- [ ] Thống kê theo **quý** và **năm**.
- [ ] Trình bày kết quả dưới dạng bảng hai chiều.
- [ ] Các dòng là danh sách sản phẩm.
- [ ] Có dòng **Tổng cộng** ở cuối bảng.
- [ ] Các cột là danh sách các quý.
- [ ] Có cột **Tổng cộng** ở cuối bảng.

**Bảng mẫu bắt buộc:**

| sản phẩm:      | quý 1 | quý 2 | ... | ... | tổng cộng: |
| -------------- | ----- | ----- | --- | --- | ---------- |
| **sản phẩm 1** |       |       |     |     |            |
| **sản phẩm 2** |       |       |     |     |            |
| **...**        |       |       |     |     |            |
| **Tổng cộng:** | ..    |       |     |     |            |

### 5.3. Chuẩn hóa nguồn dữ liệu báo cáo theo hóa đơn

- [ ] Sử dụng **hóa đơn và chi tiết hóa đơn** làm nguồn đối chiếu cho tổng tiền, số hóa đơn và các Pivot liên quan.
- [ ] Thống nhất ngày hóa đơn, trạng thái được tính, giảm giá, thuế, phí và cách xử lý hoàn tiền giữa tổng quan, báo cáo chi tiết và file xuất.
- [ ] Xác định rõ nguồn **Tổng chi** và tính **Lợi nhuận = Tổng thu - Tổng chi** tại tầng BUS.
- [ ] Tái sử dụng dữ liệu đã cache cho thay đổi khoảng ngày, chế độ tháng/quý/năm và các chiều Pivot; nạp lại khi hết TTL hoặc dữ liệu nguồn thay đổi do CRUD.
- [ ] Đối chiếu tổng hàng, tổng cột và tổng cộng của các Pivot với cùng tập hóa đơn nguồn.

### 5.4. Pivot khách hàng × năm

- [ ] Các dòng là danh sách **khách hàng**, có dòng **Tổng cộng** ở cuối.
- [ ] Các cột là các **năm**, có cột **TC** ở cuối.
- [ ] Mỗi ô thể hiện tổng tiền hóa đơn của khách hàng trong năm tương ứng.

| Khách hàng | 2024 | 2025 | ... | TC |
| ---------- | ---- | ---- | --- | -- |
| **Khách hàng 1** | | | | |
| **Khách hàng 2** | | | | |
| **...** | | | | |
| **Tổng cộng** | | | | |

### 5.5. Đọc/ghi Excel và xuất PDF

- [ ] Hoàn thiện **nhập và xuất Excel sản phẩm**, kèm kiểm tra dữ liệu nhập tại BUS.
- [ ] Hoàn thiện **nhập và xuất Excel khách hàng**, kèm kiểm tra dữ liệu nhập tại BUS.
- [ ] Xuất **Excel báo cáo thống kê**, gồm các bảng Pivot, tiêu đề, bộ lọc thời gian và tổng cộng đang hiển thị.
- [ ] Xuất **PDF tại trang phân tích thống kê**, có tiêu đề, khoảng thời gian, số liệu và bảng báo cáo đọc được khi in.
- [ ] Đối chiếu dữ liệu Excel/PDF với kết quả hiển thị từ cùng dữ liệu báo cáo đã cache.

---

## Checklist nghiệm thu tổng thể

- [ ] Hoàn thành cơ chế cache in-memory và TTL 5, 10 hoặc 15 phút.
- [ ] Tìm kiếm, lọc và thống kê tái sử dụng dữ liệu trong cache.
- [ ] Hoàn thành bộ lọc nâng cao với `AND`, `OR`, `NOT` và đầy đủ toán tử so sánh.
- [ ] Hoàn thành lọc địa lý theo ba miền Bắc, Trung, Nam.
- [ ] Hoàn thành giao diện Main - Sub Form.
- [ ] Tối ưu mật độ hiển thị dữ liệu cho người quản lý.
- [ ] Hoàn thành thống kê nhanh trong ngày trên giao diện chính.
- [ ] Hoàn thành báo cáo tổng tiền theo khoảng ngày.
- [ ] Hoàn thành Pivot Table tổng thu, tổng chi và lợi nhuận theo thời gian.
- [ ] Hoàn thành Pivot Table theo nhân viên và năm.
- [ ] Hoàn thành Pivot Table theo sản phẩm, quý và năm.
- [ ] Chuẩn hóa các báo cáo theo hóa đơn và chi tiết hóa đơn.
- [ ] Hoàn thành Pivot Table theo khách hàng và năm.
- [ ] Hoàn thiện nhập/xuất Excel sản phẩm và khách hàng, xuất Excel thống kê.
- [ ] Hoàn thành xuất PDF tại trang phân tích thống kê.
- [ ] Kiểm thử và đối chiếu kết quả của từng báo cáo với dữ liệu nguồn.
