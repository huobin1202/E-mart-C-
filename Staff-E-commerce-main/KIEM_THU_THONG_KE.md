# Kiểm thử mục 5 — báo cáo thống kê

## Chức năng đã triển khai

- Dashboard: tổng tiền và số hóa đơn hôm nay theo lịch Việt Nam. Biểu đồ doanh thu và số lượng sản phẩm bán dùng cùng cache hóa đơn.
- Trang Báo cáo (`/reports`): chọn từ ngày, đến ngày; các ngày biên đều được tính; chọn cột tháng, quý hoặc năm, tối đa 21 năm.
- Pivot thu/chi/lợi nhuận; nhân viên × năm; sản phẩm × quý/năm; khách hàng × năm. Mỗi Pivot đối tượng có tổng hàng, tổng cột và TC. Pivot tài chính không cộng dọc ba chỉ tiêu vì lợi nhuận đã bằng thu trừ chi.
- Xuất Excel bốn sheet gồm tên báo cáo, khoảng ngày, quy tắc tính và tổng cộng. Workbook chỉ xuất nếu nguồn cache vẫn đúng phiên bản đang xem; nếu hết hạn hoặc CRUD thay nguồn, cần bấm Xem báo cáo lại.
- Nút In / Lưu PDF dùng hộp thoại in trình duyệt; chọn Save as PDF / Lưu dưới dạng PDF. Bản in ẩn điều hướng và bộ lọc, giữ tiêu đề, khoảng ngày, chỉ tiêu và các bảng.
- Danh sách sản phẩm và khách hàng có nút Xuất Excel toàn bộ danh sách cache. Header xuất tương thích trường nhập, giữ kiểu số và chuỗi. Nhập dùng modal sẵn có với file CSV/XLSX, xác thực Bearer, kiểm tra tại BUS; Excel sai kiểu dữ liệu báo lỗi trước khi ghi. File XLS cũ cần lưu lại dưới dạng XLSX.

## Quy tắc số liệu

- Chỉ tính hóa đơn `invoice_status = issued` và `payment_status = paid`. Hóa đơn hủy, chưa thanh toán hoặc đã hoàn tiền bị loại khỏi tập thu; không ghi dòng âm tại ngày hoàn tiền. Số liệu quá khứ có thể thay đổi sau hoàn tiền.
- Ngày báo cáo = `issued_at` UTC cộng 7 giờ. Các ngày không có hóa đơn hiển thị 0.
- Tổng thu = `Invoice.TotalAmount`, không trừ giảm giá hoặc cộng thuế/phí thêm lần nữa.
- Tổng chi = tổng `PurchaseOrderDetail.line_total` của các phiếu nhập `completed`, theo `updated_at` (thời điểm hoàn tất ở luồng hiện tại). Dùng chi tiết phiếu nhập để khớp số tiền đang hiển thị ở màn hình Phiếu nhập; không dùng trường tổng đầu phiếu nếu dữ liệu cũ bị lệch. Đây là chi nhập hàng, chưa gồm lương, thuê mặt bằng hoặc chi vận hành; lợi nhuận hiển thị = tổng thu − chi nhập hàng, không phải lợi nhuận kế toán theo giá vốn hàng bán.
- Nhân viên dùng `employee_id`; khách hàng dùng `customer_id`; ID giúp phân biệt người trùng tên. Nhóm chưa gán nhân viên và khách lẻ vẫn được tính.
- Sản phẩm dùng chi tiết hóa đơn, phân bổ tổng thực thu theo tỷ trọng `TotalPrice`. Làm tròn 2 chữ số và dồn chênh lệch vào dòng cuối để khớp tổng hóa đơn; hóa đơn không có chi tiết vào nhóm riêng.
- Dữ liệu nguồn hóa đơn, chi tiết và chi nhập hàng được cache 10 phút. Thay ngày/chế độ/làm mới dùng RAM. Filter CRUD hiện có xóa cache sau request ghi để lần đọc kế tiếp nạp lại.

## Kiểm thử tự động

Tại thư mục gốc repository:

```powershell
dotnet build Staff-E-commerce-main/tests/InvoiceStatisticsRegression/InvoiceStatisticsRegression.csproj --no-restore -o .tmp/invoice-statistics-regression
dotnet .tmp/invoice-statistics-regression/InvoiceStatisticsRegression.dll
```

Lần đầu cần restore project kiểm thử nếu chưa có assets. Bộ kiểm thử kiểm tra ranh giới ngày Việt Nam/quý/năm, khoảng ngày đóng, nhiều năm, dữ liệu rỗng, phân bổ giảm giá/thuế/phí qua tổng hóa đơn, tổng Pivot, cache đồng thời/TTL/clear, nội dung workbook và từ chối xuất khi cache đã thay đổi.

## Nghiệm thu với ứng dụng và Database thực tế

1. Đăng nhập tài khoản có quyền `reports.read`. Mở Dashboard, đối chiếu tiền và số hóa đơn hôm nay với hóa đơn issued/paid cùng ngày Việt Nam.
2. Mở Báo cáo, chọn khoảng ngày chứa hóa đơn đã biết; đối chiếu Tổng thu và Số hóa đơn. Thử một ngày duy nhất, ngày cuối quý và khoảng nhiều năm.
3. Chuyển tháng/quý/năm. Tổng thu không đổi với cùng khoảng ngày. Tổng Pivot nhân viên, khách hàng và sản phẩm đều khớp Tổng thu; kiểm tra khách lẻ, nhân viên chưa gán, tên trùng.
4. Thử ngày bắt đầu sau ngày kết thúc: có thông báo, không thay kết quả đã áp dụng. Dữ liệu trống vẫn hiện cấu trúc bảng.
5. Xem log `[BUS Cache] Type: ReportSnapshot`: lần đầu Database, các lần lọc tiếp theo RAM Cache. Sau 10 phút hoặc sau thao tác ghi hóa đơn/nhập hàng, lần đọc sau là Database.
6. Xuất Excel, mở cả bốn sheet và đối chiếu tổng, khoảng ngày, số lẻ. Sửa dữ liệu nguồn rồi xuất từ báo cáo cũ: nhận thông báo cần xem lại báo cáo.
7. Bấm In / Lưu PDF, kiểm tra preview ngang A3 và chọn Lưu dưới dạng PDF. Bảng rộng được tách thành từng nhóm tối đa tám cột thời gian; TC toàn kỳ giữ nguyên ở mỗi nhóm.
8. Tại Sản phẩm/Khách hàng, xuất Excel, kiểm tra header/chuỗi điện thoại, dùng file trên Database thử nghiệm để nhập lại. Thử giá âm, email sai và ô số chứa chữ: phải báo lỗi. Không dùng file mẫu thử nghiệm để cập nhật hàng loạt Database chính.
9. Tài khoản thiếu quyền báo cáo/đọc sản phẩm/đọc khách hàng phải bị từ chối endpoint tương ứng.

Chưa đánh dấu nghiệm thu giao diện hoặc Database thật chỉ dựa vào kết quả build và kiểm thử tự động.

## Kết quả kiểm tra ngày 04/11/2026

- Backend build thành công; còn các cảnh báo nullable có sẵn trong dự án.
- Frontend production build thành công; ESLint các component/API thống kê mới và các thay đổi Dashboard không có lỗi.
- Bộ kiểm thử hồi quy: **28 kiểm tra đạt**, bao gồm đọc lại workbook thực xuất từ controller và đối chiếu tổng thu/lợi nhuận.
- Kiểm tra component bằng trình duyệt với dữ liệu giả lập: hiển thị chỉ tiêu và bảng, định dạng tiền Việt Nam, từ chối khoảng ngày ngược và giữ báo cáo đã áp dụng, chuyển sang bảng dành cho bản in.
- Chưa kiểm tra luồng đăng nhập → báo cáo, nhập Excel hoặc đối chiếu số liệu với Database thực tế; các bước nghiệm thu trên vẫn cần thực hiện trên môi trường chạy backend mới.

## Bổ sung: bộ lọc riêng của Pivot sản phẩm

> Cập nhật theo yêu cầu đã làm rõ: dùng **sắp xếp theo giá**, đã bỏ hai ô lọc khoảng giá. Các kết quả kiểm tra khoảng giá bên dưới là lịch sử của bản trước.

- Các lựa chọn hiện tại: Tên sản phẩm A–Z, Giá tăng dần, Giá giảm dần; giá bán hiện tại hiện dưới tên sản phẩm để kiểm tra thứ tự. Nhấn Áp dụng hoặc Enter.
- Sắp xếp kết hợp với tìm kiếm/danh mục, không loại thêm dòng và không thay đổi tổng tiền. Những dòng không có thông tin giá ở cuối khi sắp xếp giá. Khi giá bằng nhau, xếp theo tên.
- Excel/PDF giữ thứ tự đã áp dụng, cùng mô tả sắp xếp. Nút Xem báo cáo giữ lựa chọn sắp xếp; Xóa lọc trở lại Tên sản phẩm A–Z.
- Xác minh bản sắp xếp: **44 kiểm tra backend và 2 kiểm tra API frontend đạt**, backend/frontend build và ESLint đạt. Kiểm tra trên Database thật: cả tăng dần và giảm dần giữ 31 dòng, tổng 14.336.500đ; chọn Đồ uống cùng giá giảm dần hiển thị 9 dòng từ 50.000đ xuống 8.000đ. Backend đã được khởi động lại với bản mới.

- Bộ lọc nằm dưới tiêu đề Sản phẩm × quý và năm, không áp dụng sang tổng thu/chi, nhân viên hoặc khách hàng.
- Tìm tên có dấu/không dấu (kể cả đ/Đ), SKU trên hóa đơn; kết hợp danh mục và khoảng giá bán hiện tại từ–đến (đồng, bao gồm hai biên). Khi sản phẩm không còn trong danh mục hiện tại, giá dùng đơn giá trên chi tiết hóa đơn làm dự phòng.
- Nhấn Lọc sản phẩm hoặc Enter để áp dụng. Xóa lọc bỏ toàn bộ điều kiện sản phẩm, giữ khoảng ngày. Đổi thời gian chung giữ bộ lọc sản phẩm đã áp dụng.
- Kết quả rỗng hiển thị thông báo và tổng 0. Khoảng giá âm/ngược bị từ chối, giữ báo cáo đã áp dụng. Màn hình hiện số dòng và tổng sau lọc.
- Excel/PDF dùng cùng điều kiện đã áp dụng và ghi điều kiện ở bảng sản phẩm. Thay đổi nội dung đang nhập chưa áp dụng không thay đổi dữ liệu xuất.
- Sửa request gửi `categoryId=undefined` khi chọn tất cả/xóa lọc; thông báo lỗi API hiện cạnh bộ lọc. Backend đang chạy cần chứa các tham số lọc mới.

### Kết quả xác minh bộ lọc

- Backend/frontend build thành công; ESLint các tập tin frontend thay đổi đạt.
- **42 kiểm tra hồi quy backend đạt**, gồm kết hợp SKU/danh mục/khoảng giá, hai biên giá, không ảnh hưởng các Pivot khác, dữ liệu rỗng, phân bổ tiền và workbook sau lọc.
- **2 kiểm tra API frontend đạt**: không gửi undefined/null/giá trị trống; giữ giá 0 và chuyển đúng bộ lọc/snapshot sang xuất Excel.
- Đã khởi động lại backend và kiểm tra trực tiếp trên trang đang đăng nhập với Database thật: `ban chai` → chỉ Bàn chải Colgate (25.000đ doanh thu); danh mục Đồ uống, giá 15.000–20.000đ → Coca Cola lon và Red Bull (3.679.448,86đ doanh thu). Tổng quan và Pivot nhân viên vẫn giữ 14.336.500đ.
- Đã kiểm tra Enter để tìm SKU `8900000000001`, từ khóa không tồn tại (0 dòng, tổng 0), giá từ lớn hơn giá đến (báo lỗi và giữ kết quả trước), giữ bộ lọc sau nút Xem báo cáo, xóa lọc (khôi phục 31 dòng, tổng 14.336.500đ).
- Xuất Excel với bộ lọc Đồ uống/15.000–20.000đ từ API thật thành công, cùng snapshot. Kiểm tra nội dung và tổng workbook được bao phủ bởi bộ hồi quy backend.
