# BE:
"# Staff-E-commerce" 
.\run-backend.ps1

# Frontend
cd .\frontend
npm run dev
# app
COPY PATH CUSTOMER APP 
cd PATH 
npx expo start --tunnel ngrok
npm.cmd run start:tunnel
(nếu ch có expo thì npx install expo)

npm.cmd run start:tunnel

`start:tunnel` uses `expo start --go --tunnel ngrok --clear` to avoid the Expo account login required by the default SDK 58 tunnel. You can also run `Start-Customer.cmd` from the repository root.

## Quản lý tài khoản và phân quyền

Admin truy cập menu **Quản lý tài khoản** để:

- Tạo, xem, sửa và xóa tài khoản.
- Khóa hoặc mở khóa trạng thái tài khoản.
- Gán một trong các vai trò `admin`, `staff` (nhân viên) hoặc `customer` (khách hàng).
- Truy cập **Quản lý tài khoản & quyền** để gán permission cho từng role.

Tài khoản lưu `role_id` làm khóa ngoại đến bảng `roles`; quyền của tài khoản
được xác định qua quan hệ `roles` - `role_permissions` - `permissions`.

Khách hàng không đăng nhập vào trang quản trị. Khách hàng sử dụng `customer-app`
với tên đăng nhập và mật khẩu; tại mục Tài khoản có thể tự đăng ký bằng họ tên,
số điện thoại, tên đăng nhập và mật khẩu. Sau khi đăng ký, tài khoản được tạo với
role `customer` và liên kết với hồ sơ khách hàng.
