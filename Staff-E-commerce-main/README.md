# BE:
"# Staff-E-commerce" 
.\run-backend.ps1

# Frontend
cd .\frontend
npm run dev
# app
COPY PATH CUSTOMER APP 
cd PATH 
npx expo start --tunnel
npm.cmd run start:tunnel
(nếu ch có expo thì npx install expo)

npm.cmd run start:tunnel

`start:tunnel` uses `expo start --go --tunnel --clear`. To run on an Android emulator, open the emulator and use `npm.cmd start -- --android --clear` from `customer-app`. You can also run `Start-Customer.cmd` from the repository root to start the tunnel.

## Quản lý tài khoản và phân quyền

Admin truy cập menu **Quản lý tài khoản** để:

- Tạo, xem, sửa và xóa tài khoản.
- Khóa hoặc mở khóa trạng thái tài khoản.
- Gán một trong các vai trò `admin`, `staff` (nhân viên) hoặc `customer` (khách hàng).
- Truy cập **Quản lý tài khoản & quyền** để gán permission cho từng role.

Tài khoản lưu `role_id` làm khóa ngoại đến bảng `roles`; quyền của tài khoản
được xác định qua quan hệ `roles` - `role_permissions` - `permissions`.

Khách hàng không đăng nhập vào trang quản trị. Khách hàng sử dụng `customer-app`
và đăng nhập bằng **số điện thoại hoặc email đã lưu trong tài khoản** và mật khẩu (email không phân biệt chữ hoa/thường); tại mục Tài khoản có thể tự đăng ký
bằng họ tên, số điện thoại và mật khẩu. Tên đăng nhập của tài khoản khách luôn là số
điện thoại của hồ sơ khách hàng (kể cả khi admin tạo tài khoản hoặc đổi số điện thoại);
tài khoản cũ có tên đăng nhập tự đặt được tự đổi sang số điện thoại khi backend khởi động.
Tài khoản được tạo với role `customer` và liên kết với hồ sơ khách hàng.

## Thanh toán MoMo / chuyển khoản (chế độ giả lập)

Mặc định `backend/appsettings.json` đặt `"Payments": { "Mode": "Simulated" }`, nên không cần tài khoản MoMo hay ngân hàng thật:

- **MoMo:** khi đặt đơn (app khách) hoặc tạo liên kết (POS), hệ thống mở trang `.../api/payment/simulator/momo/...` có hai nút *Thanh toán thành công* / *Hủy*. Kết quả đi qua đúng luồng callback có chữ ký như MoMo thật: đơn chuyển sang đã thanh toán, xuất hóa đơn, trừ kho, cộng điểm.
- **Chuyển khoản:** màn đặt hàng thành công có nút *Giả lập chuyển khoản ngân hàng*. Ở trang POS, nhân viên có quyền `payments.write` cũng có nút *Đã nhận chuyển khoản* để xác nhận thủ công.
- Nếu tiền MoMo về cho đơn đã hủy hoặc đã thanh toán, giao dịch được ghi `refund_required` để cửa hàng hoàn tiền.
- Muốn dùng MoMo sandbox thật: đặt `Payments:Mode = "Live"` và cung cấp `Momo:PartnerCode/AccessKey/SecretKey` qua biến môi trường hoặc user-secrets (không commit vào repo).

## Bảo mật khi chạy trên máy mới

- Khóa ký JWT **không còn nằm trong repo**. Lần chạy đầu tiên backend tự sinh khóa ngẫu nhiên và lưu vào `backend/.local-secrets/jwt-signing.key` (đã gitignore). Mỗi máy có khóa riêng, nên token của máy này không dùng được ở máy khác. Có thể đặt khóa cố định bằng biến môi trường `Jwt__Key` (tối thiểu 32 ký tự).
- Đăng nhập sai 5 lần liên tiếp cho cùng một tài khoản sẽ bị khóa tạm 5 phút (HTTP 429).
- Log hoạt động (`backend/Logs`) và khóa Data Protection (`backend/.aspnet-keys`) không còn được commit; số điện thoại, email và địa chỉ trong log được che bớt.
