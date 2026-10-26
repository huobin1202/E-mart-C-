# Rà soát project — 26/10/2026

## Cập nhật sau sửa P0/P1

Đã sửa trong working tree trên branch `phat-backend`, dựa trên commit `1acd65d`. Phạm vi gồm **19 mục P0/P1: R01–R14, R16–R20**, backend ASP.NET Core, web quản trị React và app khách hàng Expo. Chưa commit/push hoặc khởi động lại backend đang chạy. Các phần từ “Bản ghi rà soát ban đầu” trở xuống là bằng chứng trước sửa; số dòng tại đó thuộc bản cũ.

| Mục | Thay đổi đã thực hiện |
|---|---|
| R01 | Đăng ký công khai từ chối số điện thoại đã có hồ sơ, kể cả hồ sơ chưa có tài khoản; không tự nhận điểm/lịch sử của hồ sơ cũ. Kiểm tra và tạo tài khoản trong transaction. |
| R02 | Sửa mapping ActivityLog; controller nội bộ không có mapping bị từ chối. Khách hàng không đọc được nhật ký nội bộ. |
| R03 | Bỏ toàn bộ payload xác thực khỏi log; che đệ quy password/token/secret trong JSON khác; payload không phân tích được bị lược bỏ. Không tin X-User-Id/mặc định user 2. |
| R04 | Hub yêu cầu JWT và orders.read, chặn customer, bỏ broadcast công khai và tự tham gia nhóm. Kiểm tra lại quyền, phiên và hạn token trước mỗi lần gửi. |
| R05 | Checkout app/POS cùng khóa giao dịch SQL và Serializable; giảm tồn bằng UPDATE có điều kiện. Hai người mua món cuối chỉ một người thành công. |
| R06 | Sau yêu cầu ghi, tải lại các cache đã sử dụng bằng DbContext mới, trước response và trước phát realtime. Cache dùng snapshot danh sách, chống kết quả tải cũ ghi đè snapshot mới. |
| R07 | Đơn app lưu PointsUsed/PointsEarned. Hủy/hoàn điểm trong transaction, không lặp; cập nhật hồ sơ không ghi đè điểm vừa thay đổi bởi checkout. |
| R08 | Danh sách hóa đơn lọc completed trước đếm/phân trang; không công bố hóa đơn chưa commit vào cache. Processing/cancelled không lọt danh sách hoàn thành. |
| R09 | Có API/UI xác nhận đã nhận chuyển khoản, kiểm tra payments.write, đúng số tiền và mã giao dịch chống trùng. Ghi payment/order/invoice cùng transaction. Bank chỉ hiện khi có cấu hình thật. |
| R10 | Khuyến mãi sản phẩm trên app được kiểm tra trong khóa checkout, tăng lượt và ghi redemption một lần mỗi đơn; hủy hoàn lượt đúng một lần. |
| R11 | Sửa khuyến mãi giữ UsedCount mới nhất từ database; chặn API áp khuyến mãi ngoài checkout. Bật/tắt chỉ thay đổi trạng thái, giữ lượt dùng và liên kết sản phẩm. |
| R12 | Dùng ProductUpdateDTO và cập nhật entity đã tải; không gửi Cost/Barcode thì giữ nguyên. Barcode rỗng là yêu cầu xóa; tạo sản phẩm có lưu barcode. |
| R13 | Dùng SalePricing chung: giá làm tròn nguyên đồng, giảm giá làm tròn xuống và giới hạn theo giá trị đơn. App có kiểm tra trạng thái/thử lại MoMo và hủy đơn chưa nhận tiền. |
| R14 | users.write không đủ tạo/gán/sửa tài khoản admin hoặc hồ sơ nhân viên gắn admin; chỉ admin quản lý vai trò và tài khoản admin. Giữ kiểm tra quản trị viên cuối cùng. |
| R16 | Xác nhận/giao/hủy/hoàn tiền dùng chung khóa và transaction tới hết cập nhật hóa đơn. Giao/hủy lặp không cộng điểm/hoàn kho hai lần; đơn online không đi tắt qua complete POS cũ. |
| R17 | Callback kiểm tra chữ ký, đối tác, số tiền và request ID nếu có. Payment/order/invoice cập nhật nguyên khối; retry khôi phục được dữ liệu cũ payment completed nhưng order pending. Lưu URL/request ID MoMo để tái sử dụng lần thanh toán đang chờ. |
| R18 | Hủy đơn đã nhận tiền giữ cancelled + paid để hiển thị còn phải hoàn tiền. Có thao tác xác nhận đã hoàn đủ tiền với số tiền/mã đối soát, chống lặp; callback đến muộn không mở lại đơn đã hủy. |
| R19 | Hoàn tất/hủy phiếu nhập cùng khóa và transaction. Đồng bộ model EF công thức subtotal với SQL hiện có để database tạo theo model cũng nhập hàng được. |
| R20 | App lưu request GUID và nguyên nội dung yêu cầu theo khách trước khi gửi; mất response dùng lại yêu cầu đã lưu. Backend kiểm tra chủ đơn/hash và trả đúng đơn cũ, không trừ kho/điểm lần nữa. |

### Kiểm chứng sau sửa

- Backend/regression build ra `.tmp/p1-regression`, không ghi đè binary của backend đang chạy; không có lỗi biên dịch. Build đầy đủ còn 15 warning nullable ở mã hiện có và một số DTO/config thanh toán.
- Lần regression cuối hoàn tất, exit code 0: **311 kiểm tra qua**, gồm 75 phân quyền/tài khoản, 105 POS, 33 giao hàng và 98 P0/P1 bổ sung. Đã xác nhận nâng cấp schema thanh toán cũ, toggle khuyến mãi, chặn complete online qua luồng POS, tranh chấp phiếu nhập và bảo toàn điểm khi cập nhật hồ sơ. Log kết thúc bằng `TEMP_DATABASE_DELETED`.
- Frontend: build thành công; ESLint 0 error, 2 warning Hook hiện có; **21/21 test** qua, bao gồm khôi phục checkout sau mất response/lỗi storage.
- App khách hàng: Expo export **web và Android bundle** thành công. Đây là kiểm tra biên dịch/bundle, chưa phải APK hoặc chạy trên thiết bị thật.
- Regression dùng database SQL Server riêng `AuthorizationRegression_<guid>`, xóa trong `finally`; không sửa dữ liệu cửa hàng và không tạo giao dịch MoMo/ngân hàng thật.
- Có chủ động gây lỗi trùng số hóa đơn để chứng minh callback rollback payment/order cùng lúc, sau đó gửi lại xử lý được; lỗi được ghi trong log của kịch bản này là có chủ đích.

Bằng chứng: `.tmp/p1-regression.log`, `.tmp/p1-regression-build.log`, `.tmp/p1-frontend-tests.log`, `.tmp/p1-frontend-lint.log`, `.tmp/p1-frontend-build.log`, `customer-app/.tmp/p1-export.log`. Test bổ sung được giữ tại `tests/AuthorizationRegression/P1Regression.cs` và `frontend/tests/storefrontCheckout.test.mjs`. Runner dùng chung `AddStoreServices` với production.

### Cách áp dụng và giới hạn

1. Dừng/khởi động lại backend bằng mã mới trong đợt triển khai. Initializer tự thêm `payments.pay_url` và `payments.provider_request_id` nếu thiếu; không cần chạy lại file SQL tạo/xóa toàn bộ database. Bản backend đang mở vẫn dùng mã cũ cho đến khi được khởi động lại.
2. Cấu hình `BankTransfer:Enabled`, `BankCode`, `AccountNumber`, `AccountName` bằng tài khoản cửa hàng rồi mới bật chuyển khoản. Mặc định đã tắt và bỏ thông tin ngân hàng mẫu trong app. Thu/hoàn tiền ngân hàng là nhân viên thực hiện bên ngoài rồi xác nhận bằng mã đối soát; nút xác nhận không tự chuyển tiền.
3. MoMo cần endpoint/partner/access key/secret key và `App:BaseUrl` truy cập được từ provider. Test dùng callback ký bằng khóa fixture; chưa xác thực một giao dịch thật với provider. Lần thanh toán có kết quả mạng không rõ được giữ chờ để đối soát, không tạo lần thu mới tùy tiện.
4. Số điện thoại đã có hồ sơ cần cửa hàng xác minh trước khi cấp/liên kết tài khoản. Chưa triển khai OTP tự phục vụ.
5. Mã mới ngăn lỗi phát sinh tiếp; không tự suy đoán/phục hồi Cost/Barcode/điểm đã mất hoặc tự hoàn tiền cho đơn cũ. Log lịch sử đã có trước sửa chưa bị xóa/biên tập; nếu từng chứa mật khẩu thật cần xử lý lịch sử và đổi mật khẩu liên quan.
6. Cache vẫn ở từng tiến trình và còn TTL 15 phút. Sau ghi sẽ refresh các cache đã nạp, có phát sinh truy vấn trong yêu cầu ghi. Tối ưu toàn bộ chi tiết/thống kê chỉ dùng danh sách trong RAM, giảm phạm vi refresh, đồng bộ nhiều instance và các mục P2 còn lại chưa được hoàn tất trong đợt P0/P1 này. R15, wiring R28 và phần cache import/nguồn danh tính log đã được xử lý kèm; ngày báo cáo, quyền UI, số đếm import sau rollback và chính sách giá vốn vẫn cần đợt tiếp theo.

## Bản ghi rà soát ban đầu — trước sửa

Mã nguồn tại thời điểm kiểm tra: branch `phat-backend`, commit `1acd65d`. Phạm vi gồm backend ASP.NET Core, web quản trị React, app khách hàng Expo, model/schema SQL và bộ kiểm thử hiện có.

Kết luận lúc rà soát: project build được nhưng còn lỗi nghiệp vụ và phân quyền đáng kể. Đã thực hiện 14 tình huống kiểm chứng bổ sung trên database tạm. Các kết quả tái hiện dưới đây mô tả bản trước sửa.

## Phương pháp và giới hạn

- Đọc cấu trúc, API, service/repository, phân quyền, cache và các luồng đăng nhập, bán tại quầy, đặt hàng, thanh toán, giao/hủy đơn, hóa đơn, khuyến mãi, điểm, nhập hàng, quản lý danh mục và báo cáo.
- Build backend/regression ra thư mục riêng; build web quản trị; chạy ESLint và các test frontend; export bản web của app Expo.
- Chạy bộ regression API của repository trên database riêng. Bộ này thất bại ngay ở kiểm tra đầu tiên; không coi các khẳng định PASS trong báo cáo cũ là kết quả của mã nguồn hiện tại.
- Công cụ kiểm chứng bổ sung sử dụng controller/service/repository hiện tại, JWT, `SessionValidator`, `PermissionFilter`, `AccountMutationFilter`, cache singleton và database SQL Server mới `ProjectReview_<guid>`. Database được tạo theo model hiện tại, chạy initializer của ứng dụng, rồi xóa trong `finally`; đã xác nhận thông báo `TEMP_DATABASE_DELETED`.
- Tình huống cạnh tranh tồn kho chỉ thêm điểm đồng bộ hai lần đọc bằng interceptor trong công cụ kiểm chứng; không thay đổi câu SQL hay quy tắc nghiệp vụ. Cách này tạo thứ tự thực thi hợp lệ để tái hiện lỗi, không phải đo tần suất lỗi ngoài thực tế.
- Kiểm tra che mật khẩu gọi trực tiếp hàm chuẩn bị payload với dữ liệu mẫu. Không đọc mật khẩu hay log riêng tư thật.
- Không ghi dữ liệu vào database cửa hàng, không giao dịch với MoMo/ngân hàng thật, không thao tác thử mọi màn hình trên điện thoại/trình duyệt. Các trigger/cấu hình riêng ngoài model và initializer của database vận hành chưa được đối chiếu toàn bộ.

## Kết quả kiểm tra kỹ thuật

| Kiểm tra | Kết quả hiện tại |
|---|---|
| Build backend và project regression, output riêng | Thành công, không có lỗi biên dịch. Lần build incremental không có warning; compiler analysis đầy đủ có các warning nullable/legacy. |
| `frontend`: `npm.cmd run build` | Thành công. Còn cảnh báo annotation SignalR và bundle JS khoảng 1.17 MB trước gzip. |
| `frontend`: `npm.cmd run lint` | 0 error, 2 warning Hook tại `src/hook/useAudit.js:31`, `src/pages/reports/ReportsPage.jsx:55`. |
| `node --test tests/posWorkflow.test.js tests/productDescription.test.mjs` | 17/17 test qua. |
| `customer-app`: Expo export web | Thành công, bundle web khoảng 699 KB. Chưa build APK/chạy thiết bị thật. |
| Regression API sẵn có | **Thất bại** tại `tests/AuthorizationRegression/Program.cs:111`, thông báo `Filtered users endpoint succeeds`; chưa chạy tới các nhóm POS/giao hàng. |
| Kiểm chứng bổ sung | 14 tình huống dưới đây hoàn tất, không có `probeError`; kết quả tái hiện lỗi được giữ trong log. |

File bằng chứng trong workspace: `.tmp/project-review-probes.log`, `.tmp/project-review-regression-unrestricted.log`, `.tmp/project-review-frontend-build.log`, `customer-app/.tmp/project-review-export.log`. Công cụ kiểm chứng nằm tại `.tmp/project-review-harness/`; đây là thư mục tạm bị Git ignore.

## Các lỗi đã tái hiện

Mức P0: cần xử lý ngay trước khi cho người dùng bên ngoài truy cập. P1: có thể sai tiền, hàng, dữ liệu hoặc quyền; ưu tiên trước vận hành thật. P2: lỗi quản trị/hiển thị và độ tin cậy kiểm thử.

### R01 — P0: Đăng ký bằng số điện thoại chiếm hồ sơ khách cũ

- **Điều kiện:** hồ sơ khách đã tồn tại, có thể có điểm/lịch sử mua hàng, nhưng chưa gắn tài khoản app.
- Đăng ký công khai chỉ cần nhập số điện thoại đó; backend lấy hồ sơ cũ, đổi tên và gắn tài khoản mới mà không xác minh chủ sở hữu số điện thoại.
- **Tái hiện:** tài khoản mới được liên kết đúng ID của hồ sơ có sẵn và nhận luôn **12 điểm** của fixture. Quyền đọc lịch sử và sử dụng điểm sau đó dựa vào ID đã liên kết.
- **Vị trí:** `backend/Controllers/StorefrontController.cs:86`, `:99`, `:116`; `backend/Repository/StorefrontRepository.cs:22`.
- **Hướng sửa:** xác minh quyền sở hữu số điện thoại trước khi liên kết hồ sơ cũ; không tự động nhận hồ sơ chỉ bằng một chuỗi số điện thoại.

### R02 — P1: Khách hàng đọc được nhật ký nội bộ

- Tên lớp thực tế là `ActivityLogController` nhưng `PermissionCatalog` chỉ map `ActivityLogs`. Khi không có mapping, filter trả về ngay, bỏ qua cả chặn customer.
- **Tái hiện:** JWT role customer gọi `GET /api/activitylog/paged` nhận **HTTP 200** và đọc được log mẫu nội bộ.
- **Vị trí:** `backend/Controllers/ActivityLogsController.cs:9`; `backend/Security/PermissionCatalog.cs:28`; `backend/Security/PermissionFilter.cs:18`.
- **Hướng sửa:** sửa mapping; quy định rõ API nội bộ nào được miễn permission và chặn controller thiếu mapping; kiểm tra cả customer và staff không có `audit.read`.

### R03 — P1: Payload đổi mật khẩu không được che trong log

- Bộ lọc chỉ nhận tên chính xác `password`, `token`, `creditCard`; payload thực tế dùng `currentPassword`, `newPassword`, `confirmNewPassword`.
- **Tái hiện:** giá trị mật khẩu mẫu cũ và mới đều còn nguyên sau `PreparePayload`. Middleware ghi payload này vào database/file trước khi chạy action.
- **Ảnh hưởng:** có đường lộ mật khẩu qua log; R02 làm tăng phạm vi người có thể đọc. Chưa kiểm tra log vận hành có chứa dữ liệu này hay không.
- **Vị trí:** `backend/Middleware/RequestLoggingMiddleware.cs:69`, `:79`, `:95`, `:216`; `backend/DTO/MeDTO.cs:15`.
- **Hướng sửa:** không log payload mật khẩu hoặc che đầy đủ bằng xử lý JSON; sau khi sửa cần kiểm tra, xử lý log cũ và đổi mật khẩu nếu xác nhận có lộ.

### R04 — P1: Hub realtime mở công khai, phát dữ liệu đơn tới mọi kết nối

- Hub được map với `AllowAnonymous`; `NewOrderReceived` gửi tới `Clients.All`, gồm tên, số điện thoại, tiền và mã đơn.
- **Tái hiện:** gọi negotiate không có JWT nhận **HTTP 200** và connection token. Việc phát thông tin đơn tới tất cả kết nối được xác nhận qua code.
- **Vị trí:** `backend/Program.cs:214`; `backend/Hubs/OrderHub.cs:8`; `backend/Controllers/StorefrontController.cs:479`.
- **Hướng sửa:** xác thực kết nối, kiểm tra quyền đọc đơn và giới hạn nhóm nhận do server quyết định; xử lý thu hồi quyền với kết nối đang mở.

### R05 — P1: Hai khách cùng mua món cuối cùng đều thành công

- Storefront đọc tồn bằng SELECT rồi sửa `inventory.Quantity` trong EF; transaction mặc định không ngăn hai request cùng đọc giá trị cũ. Không có phép giảm tồn có điều kiện tại thời điểm UPDATE như POS.
- **Tái hiện có đồng bộ hai lần đọc:** tồn ban đầu **1**, hai request cùng mua 1 đều trả **HTTP 200**; database có **2 đơn vị đã bán**, tồn cuối **0**.
- **Vị trí:** `backend/Repository/StorefrontRepository.cs:191`, `:201`, `:206`.
- **Hướng sửa:** giảm tồn bằng UPDATE nguyên tử có điều kiện `quantity >= requested`, kiểm tra số dòng bị ảnh hưởng trong cùng transaction tạo đơn; dùng chung cơ chế cho mọi kênh.

### R06 — P1: Bán hàng xong nhưng cache vẫn trả tồn/đơn cũ

- Cache phân chia theo DTO và chỉ được cập nhật trong một số service. Checkout POS không cập nhật cache sản phẩm, storefront, tồn kho, khách hàng và lịch sử đơn. Tạo đơn storefront chỉ clear cache sản phẩm storefront, không clear danh sách online/lịch sử.
- **Tái hiện sau khi làm nóng cache:** POS bán thành công, tồn database **4**, nhưng API/service sản phẩm, storefront và tồn kho đều còn **5**; cache lịch sử vẫn có **0 đơn** dù vừa tạo đơn. Tạo thêm đơn app rồi truy vấn online theo chính ID mới cũng không tìm thấy qua cache.
- **Ảnh hưởng:** F5 hoặc nút “Cập nhật giá và tồn kho” vẫn có thể lấy dữ liệu cũ từ backend; POS có thể báo vượt tồn/đổi giá muộn khi chốt. TTL hiện tại là 15 phút; cập nhật cache còn có thể gia hạn thời điểm tải của cả tập dữ liệu.
- **Vị trí:** `backend/Services/PosCheckoutService.cs:103`; `backend/Services/ProductService.cs:31`; `backend/Services/InventoryService.cs:256`; `backend/Services/OrderService.cs:166`, `:232`; `backend/Services/StorefrontService.cs:53`; `backend/Services/BusMemoryCache.cs:118`.
- **Hướng sửa:** lập danh sách cache phụ thuộc và cập nhật/vô hiệu hóa sau commit của mọi giao dịch ảnh hưởng; dữ liệu tồn, giá, điểm và trạng thái cần cơ chế đọc phù hợp với yêu cầu cập nhật tức thời.

### R07 — P1: Hủy đơn app làm mất điểm đã sử dụng

- Storefront trừ `Customer.RewardPoints`, nhưng không gán `Order.PointsUsed`. Luồng reject/cancel online chỉ hoàn kho, không hoàn điểm.
- **Tái hiện:** dùng **3 điểm**, số dư từ **22 xuống 19**; `Order.PointsUsed` được lưu là **0**; hủy thành công nhưng số dư vẫn **19**.
- **Vị trí:** `backend/Controllers/StorefrontController.cs:395`, `:403`, `:417`; `backend/Repository/OrderRepository.cs:58`.
- **Hướng sửa:** lưu điểm dùng/điểm nhận trên chứng từ và hoàn đúng một lần trong transaction chuyển trạng thái; thống nhất với POS.

### R08 — P1: Cache hóa đơn đưa cả đơn processing/cancelled vào danh sách hoàn thành

- Query tải ban đầu lọc `Order.Status == "completed"`, nhưng `SyncOrderLifecycleAsync` thêm hóa đơn processing vào cùng cache. `GetInvoicesAsync` không lọc lại điều kiện hoàn thành; nhánh hủy/hoàn tiền return trước khi cập nhật cache.
- **Tái hiện:** sau khi làm nóng danh sách hóa đơn, xác nhận đơn app khiến hóa đơn **processing xuất hiện**; hủy đơn rồi hóa đơn đó **vẫn còn trong danh sách**.
- **Vị trí:** `backend/Repository/InvoiceRepository.cs:35`; `backend/Services/InvoiceService.cs:79`, `:102`, `:112`, `:124`.
- **Hướng sửa:** giữ điều kiện của tập cache ở mọi đường cập nhật, hoặc lọc hoàn thành lại trước count/pagination; loại/cập nhật các entry khi hủy và hoàn tiền.

### R09 — P1: Đơn chuyển khoản ngân hàng không có luồng đối soát hoàn chỉnh

- App cho chọn bank và tạo QR; đơn lưu `PaymentMethod = "card"`. Endpoint confirm-payment chỉ tìm đơn POS, còn offlinepayment chỉ thêm payment, không đổi trạng thái thanh toán của đơn. Giao hàng chặn đơn không dùng tiền mặt chưa paid.
- **Tái hiện:** confirm-payment trả **400**; thêm payment card completed trả **200** nhưng đơn vẫn **pending** về thanh toán; hoàn tất giao hàng trả **409**.
- **Vị trí:** `backend/Controllers/StorefrontController.cs:410`, `:473`; `backend/Services/PosCheckoutService.cs:146`; `backend/Repository/PosCheckoutRepository.cs:63`; `backend/Services/PaymentService.cs:21`; `backend/Repository/OrderRepository.cs:92`.
- **Hướng sửa:** nghiệp vụ xác nhận tiền vào cho đơn online có quyền riêng, kiểm tra số tiền/mã giao dịch và cập nhật payment + order + invoice nguyên tử. Đưa thông tin ngân hàng ra cấu hình thay cho số tài khoản ghi trực tiếp trong code.

### R10 — P1: Khuyến mãi sản phẩm trên app không ghi lượt sử dụng

- Ưu đãi sản phẩm được đọc để giảm giá dòng hàng nhưng không được ghi redemption và tăng UsedCount. Chỉ ưu đãi cấp đơn trong `appliedPromotion` được tăng đếm.
- **Tái hiện:** chương trình giới hạn **1 lượt** được dùng giảm giá cho **2 đơn**, mỗi đơn từ 20.000 còn **19.000**; sau đó UsedCount vẫn **0**, redemption vẫn **0**.
- **Vị trí:** `backend/Controllers/StorefrontController.cs:364`; `backend/Repository/StorefrontRepository.cs:149`, `:195`.
- **Hướng sửa:** ghi nhận mọi ưu đãi đã áp dụng và giữ lượt dùng nguyên tử cho tất cả kênh; giải phóng đúng quy tắc khi hủy.

### R11 — P1: Sửa khuyến mãi có thể đặt lại bộ đếm lượt dùng

- Form gửi lại UsedCount chụp từ lúc mở; controller nhận và repository `SetValues` ghi đè entity. Form cũ hoặc request tự tạo có thể xóa số lượt sử dụng mới phát sinh.
- **Tái hiện:** UsedCount trong DB là **1**; PUT khuyến mãi với UsedCount **0** trả **200** và lưu lại **0**.
- **Vị trí:** `frontend/src/pages/promotions/PromotionEdit.jsx:94`; `backend/Controllers/PromotionsController.cs:181`; `backend/Repository/PromotionRepository.cs:116`.
- **Hướng sửa:** DTO chỉnh sửa chỉ nhận trường cấu hình; bộ đếm và redemption thuộc nghiệp vụ server, không cho form ghi.

### R12 — P1: Sửa sản phẩm từ UI xóa giá vốn và mã vạch

- Payload cập nhật ở `ProductList` không có `cost`, `barcode`. API nhận entity mới rồi gọi `Products.Update`, nên các trường thiếu trở thành null và được ghi đè.
- **Tái hiện đúng dạng payload của UI:** sản phẩm có giá vốn **12.000** và barcode `REVIEW-0001`; sửa thông tin trả **200**, sau đó cả **Cost và Barcode đều null**.
- API tạo sản phẩm còn comment dòng map Barcode dù DTO có trường này.
- **Vị trí:** `frontend/src/pages/products/ProductList.jsx:300`; `backend/Controllers/ProductsController.cs:109`, `:136`; `backend/Services/ProductService.cs:155`; `backend/Repository/ProductRepository.cs:87`.
- **Hướng sửa:** dùng DTO cập nhật rõ ràng, tải entity cũ rồi chỉ gán các trường được phép; bảo toàn giá vốn/mã vạch khi không chỉnh sửa. Bổ sung quản lý barcode nhất quán với máy quét POS.

### R13 — P1: Giảm giá tạo tiền lẻ, lưu đơn và trừ kho rồi mới phát hiện không thanh toán MoMo được

- App tính phần trăm không làm tròn theo quy tắc POS, trong khi `PaymentService` từ chối số tiền không nguyên đồng. Đơn đã commit và trừ kho trước khi tạo link; lỗi tạo link chỉ được catch/log.
- **Tái hiện:** giá **10.001**, giảm **10%**, tổng đơn **9.000,9**; request tạo đơn thành công, tồn từ **2 xuống 1**, nhưng không có URL thanh toán MoMo. Không gọi nhà cung cấp vì validation đã từ chối trước bước HTTP.
- **Vị trí:** `backend/Services/StorefrontService.cs:86`; `backend/Controllers/StorefrontController.cs:366`, `:439`, `:459`; `backend/Services/PaymentService.cs:56`; đối chiếu `backend/Services/PosCheckoutService.cs:20`.
- **Hướng sửa:** dùng chung quy tắc làm tròn tiền cho mọi kênh và kiểm tra trước lưu đơn; có luồng thử lại/hết hạn/giải phóng tồn cho đơn thanh toán thất bại.

### R14 — P1 nếu phân quyền cho staff: `users.write` đủ để tạo admin

- Có quyền ghi tài khoản là có thể chọn role admin; không kiểm tra quyền cấp vai trò cao hơn người thực hiện. Cơ chế giữ admin cuối cùng không chặn trường hợp này.
- **Tái hiện:** cấp riêng `users.write` cho role staff; request tạo tài khoản admin từ token staff trả **201** và tạo đúng role admin.
- **Vị trí:** `backend/Services/UserService.cs:96`, `:134`; `backend/Security/AccountMutationFilter.cs:47`; `backend/Controllers/UsersController.cs:10`.
- **Hướng sửa:** chốt phạm vi ủy quyền tài khoản; nếu staff chỉ được quản lý tài khoản thông thường thì cần chặn gán/sửa admin và tách quyền gán vai trò. Đây là rủi ro phụ thuộc cách admin cấp permission, không khẳng định staff mặc định đã có `users.write`.

### R15 — P2: Bộ lọc tài khoản bị khóa trả thiếu dữ liệu

- Điều kiện inactive là `IsActive == false && IsLocked == true`; tài khoản `IsActive=true, IsLocked=true` bị loại khỏi cả nhóm hoạt động lẫn nhóm không hoạt động.
- **Tái hiện:** có **1 tài khoản đang bị khóa** nhưng truy vấn `isActive=false` theo đúng username trả **0**.
- **Vị trí:** `backend/Services/UserService.cs:43`.
- **Hướng sửa:** định nghĩa trạng thái hiệu lực là active AND not locked; nhánh không hoạt động lấy phủ định của điều kiện đó, hoặc tách bộ lọc trạng thái hoạt động/khóa.

## Các vấn đề bổ sung xác định qua code, chưa kiểm thử cạnh tranh/giao diện riêng

| Mã / mức | Vấn đề và ảnh hưởng | Vị trí / hướng xử lý |
|---|---|---|
| R16 / P1 | **Hủy/hoàn tất/giao đơn online có thể tranh chấp.** Reject đọc trạng thái trước transaction và không chuyển trạng thái có điều kiện; deliver đọc rồi cộng điểm và lưu, không có khóa/chống lặp tương đương POS. Có thể hoàn kho/ghi điểm sai khi các request xen kẽ. | `backend/Repository/OrderRepository.cs:60`, `:65`, `:89`, `:102`. Dùng chuyển trạng thái có điều kiện và transaction chung, bảo đảm tác động một lần; cần test double reject, double deliver, reject đối đầu deliver. |
| R17 / P1 | **Callback MoMo của đơn online ghi từng bước.** Payment completed, order paid và invoice được lưu riêng. Nếu lỗi giữa chừng, callback gửi lại có thể thoát sớm khi payment đã completed mà chưa đồng bộ nốt order; cạnh tranh hủy cũng chưa dùng cùng cơ chế khóa. | `backend/Services/PaymentService.cs:175`–`:185`. Xử lý callback và vòng đời đơn trong một transaction/chuyển trạng thái có điều kiện; kiểm tra retry sau lỗi giữa bước. |
| R18 / P1 | **Hủy đơn online đã paid chưa có đường đối soát hoàn tiền đầy đủ.** Reject cho phép pending/processing đã paid nhưng chỉ đổi cancelled và hoàn kho; sau đó endpoint đánh dấu refund lại từ chối đơn cancelled. | `backend/Repository/OrderRepository.cs:62`, `:69`; `backend/Services/OrderService.cs:326`. Tách yêu cầu hủy, chờ hoàn tiền và hoàn tiền xong; không thể hiện thao tác đổi cờ là giao dịch hoàn tiền thật. |
| R19 / P1 | **Hủy phiếu nhập tranh chấp với hoàn tất.** Complete dùng Serializable, Cancel đọc pending và ghi cancelled mà không có transaction/điều kiện trạng thái tương đương. Nếu Cancel đã đọc trước khi Complete commit, có thể tồn đã tăng nhưng phiếu bị ghi cancelled. | `backend/Repository/PurchaseOrderRepository.cs:58`, `:100`. Khóa/chuyển trạng thái có điều kiện dùng chung cho hai thao tác. |
| R20 / P1 | **App chưa chống tạo đơn trùng khi mất response.** Request đặt hàng không có khóa idempotency, backend sinh GUID mới mỗi lần. Nếu đơn đã commit nhưng app nhận lỗi mạng, thử lại có thể tạo đơn mới và trừ kho/điểm tiếp. | `customer-app/src/App.jsx:1191`, `:1241`; `backend/Controllers/StorefrontController.cs:419`. Áp dụng cơ chế khóa yêu cầu và tra kết quả tương tự POS. |
| R21 / P2 | **Nhật ký có thể gán sai người và chưa phản ánh kết quả thao tác.** Logger chấp nhận `X-User-Id` khi không có uid, mặc định user 2, ghi trước xử lý và bỏ qua PATCH. | `backend/Middleware/RequestLoggingMiddleware.cs:35`, `:79`, `:109`, `:176`. Lấy danh tính từ xác thực; vô danh dùng null/hệ thống; log kết quả sau xử lý, bao phủ PATCH. |
| R22 / P2 | **Giao diện còn chặn theo role `isStaff` thay vì permission.** Staff được cấp products.write/categories.write/... vẫn bị chặn nút; route nội bộ chủ yếu kiểm tra token. | `frontend/src/pages/products/ProductList.jsx:32`, `:225`; `pages/categories/CategoryList.jsx:51`; `pages/units/UnitList.jsx:16`; `pages/suppliers/SupplierList.jsx:15`. Kiểm tra quyền theo từng thao tác. |
| R23 / P2 | **DELETE sản phẩm/đơn vị tính đảo trạng thái.** Gửi lại cùng yêu cầu có thể bật lại dữ liệu đã ngừng hoạt động. Cache lại remove entry nên danh sách inactive có thể mất mục vừa đổi. | `backend/Repository/ProductRepository.cs:98`; `backend/Repository/UnitRepository.cs:82`; `backend/Services/ProductService.cs:165`. DELETE đặt false; khôi phục bằng thao tác riêng, cập nhật cache đúng trạng thái. |
| R24 / P2 | **Import chưa đồng bộ cache và báo đếm thành công sau rollback.** Import gọi repository trực tiếp, không cập nhật cache product/customer; Created/Updated được tăng trước commit nhưng không reset khi rollback toàn transaction. | `backend/Services/ImportService.cs:111`, `:129`, `:137`, `:230`, `:246`. Invalidate sau commit; nếu rollback thì phản ánh số bản ghi thực sự được lưu. |
| R25 / P2 | **Ngày báo cáo không nhất quán theo giờ Việt Nam.** Báo cáo lọc/group trực tiếp UTC CreatedAt theo ngày đầu vào; dashboard dùng biên ngày UTC chuyển từ giờ Việt Nam. Cùng ngày có thể ra số khác, nhất là đơn 00:00–06:59 VN. Lọc hóa đơn/lịch sử cũng cần đối chiếu quy ước này. | `backend/Repository/ReportsRepository.cs:28`, `:35`, `:158`; `backend/Repository/StatisticsRepository.cs:29`; `backend/Services/InvoiceService.cs:125`; `backend/Services/OrderService.cs:171`. Quy định ngày nghiệp vụ VN và chuẩn hóa biên UTC ở server. |
| R26 / P2 | **Giá trị tồn kho dùng hai cách tính.** Báo cáo tồn lấy Cost null thành 0; top tồn giá trị cao lại dùng Price khi Cost null. Phiếu nhập có ImportPrice nhưng hoàn tất không cập nhật giá vốn. | `backend/Repository/ReportsRepository.cs:72`, `:182`; `backend/Repository/PurchaseOrderRepository.cs:79`. Cần chốt chính sách giá vốn; không gọi giá bán là giá vốn ngầm định. |
| R27 / P2 | **API/ảnh bị cố định localhost và thông tin ngân hàng ghi trực tiếp.** Web quản trị gọi máy của người mở trình duyệt nếu truy cập từ máy khác; cấu hình API app web cũng bỏ qua EXPO_PUBLIC_API_URL khi có window hostname. | `frontend/src/api/apiClient.js:4`; `frontend/src/api/reportsApi.js:1`; `frontend/src/components/products/ProductModal.jsx:255`; `customer-app/src/services/storefrontApi.js:4`; `backend/Controllers/StorefrontController.cs:473`. Dùng cấu hình môi trường hoặc URL tương đối/proxy và cấu hình ngân hàng duy nhất. |

## Bộ regression cần cập nhật trước khi dùng làm điều kiện nghiệm thu

**R28 — P2:** runner hiện đăng ký `UserService`, `InvoiceService`, `PosCheckoutService`, `OrderService`,... nhưng thiếu các dependency mới như `BusMemoryCache<>`, `InvoiceRepository`, `PosCheckoutRepository`, `StorefrontService/Repository`, `RoleService/Repository`, `EmployeeService/Repository`. Ví dụ constructor `UserService` hiện bắt buộc cache nhưng runner không đăng ký.

Vị trí trước sửa: `tests/AuthorizationRegression/Program.cs:37`–`:56`, đối chiếu `backend/Program.cs:79`–`:125`. Runner ban đầu dừng tại kiểm tra đầu tiên ở dòng 111. Sau sửa đã dùng chung đăng ký service với production và refresh cache sau fixture SQL. **Đính chính:** test card cố ý từ chối checkout card mới và kiểm tra bill card legacy; không phải kỳ vọng lỗi thời. Kết quả regression sau sửa được ghi ở đầu báo cáo.

## Những kết luận cũ không được lặp lại như lỗi hiện tại

- POS hiện đã có checkout server-side, transaction Serializable, khóa yêu cầu chống lặp và giảm tồn có điều kiện. Không coi lỗi tạo POS bằng nhiều API độc lập trong báo cáo cũ là còn nguyên.
- `frontend/src/main.jsx:8` import `patchAllRequests.js`; code này tự thêm Authorization vào fetch. Vì vậy không kết luận helper reports/upload thiếu token chỉ vì trong từng lệnh fetch không có header. URL cố định và upload hai lần vẫn là những vấn đề độc lập cần xem xét.
- Luồng đặt đơn đã dùng CustomerId từ khách đăng nhập khi dùng điểm, chặn khách vô danh dùng điểm. R01 nói về bước liên kết hồ sơ khi đăng ký, khác với lỗi dùng điểm vô danh từng được báo cáo.
- Các kiểm tra GET thành công trong báo cáo cũ không chứng minh tính đúng đắn của ghi dữ liệu, cạnh tranh hoặc tính nhất quán cache.

## Thứ tự sửa đề xuất

1. Khóa đường liên kết hồ sơ không xác minh, sửa quyền nhật ký và che mật khẩu, bảo vệ hub.
2. Sửa mất giá vốn/barcode; thống nhất giao dịch tồn, điểm và lượt khuyến mãi cho POS/app, chống lặp và tranh chấp.
3. Hoàn thiện đối soát chuyển khoản/MoMo/hủy/hoàn tiền; thống nhất làm tròn tiền trước khi lưu đơn.
4. Sửa invalidation cache và điều kiện cache hóa đơn; kiểm tra làm nóng cache trước mỗi kịch bản nghiệp vụ.
5. Cập nhật bộ regression và bổ sung các tình huống tái hiện trên; sau đó sửa các mục P2 về quyền UI, ngày, import, danh mục và báo cáo.

Các lựa chọn như phương pháp giá vốn, hoàn kho khi hoàn tiền, xác minh số điện thoại và phân quyền gán admin cần chốt theo yêu cầu cửa hàng. Các lựa chọn đó không thay đổi những kết quả tái hiện cụ thể đã nêu.
