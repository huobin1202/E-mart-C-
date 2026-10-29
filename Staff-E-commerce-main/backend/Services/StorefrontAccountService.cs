using System.Text.RegularExpressions;
using backend.DTO;
using backend.Models;
using backend.Repository;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

public sealed class StorefrontAccountService(
    StorefrontRepository repository,
    JwtService jwt,
    CustomerService customers,
    RealtimeNotificationService realtime)
{
    public async Task<StorefrontAuthenticationDTO> RegisterAsync(StorefrontCustomerRegisterRequest request)
    {
        var phone = NormalizePhone(request.Phone);
        if (!Regex.IsMatch(phone, "^0[35789]\\d{8}$"))
            throw new BusinessRuleException("Số điện thoại Việt Nam chưa đúng định dạng.");
        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 6)
            throw new BusinessRuleException("Mật khẩu phải có ít nhất 6 ký tự.");
        if (string.IsNullOrWhiteSpace(request.FullName) || request.FullName.Trim().Length < 2)
            throw new BusinessRuleException("Họ tên phải có ít nhất 2 ký tự.");
        if (request.DateOfBirth.HasValue && request.DateOfBirth.Value.Date > DateTime.UtcNow.Date)
            throw new BusinessRuleException("Ngày sinh không thể ở trong tương lai.");

        var username = phone;
        var internationalPhone = $"+84{phone[1..]}";
        await using var transaction = await repository.BeginSerializableTransactionAsync();
        await repository.LockRegistrationAsync();

        if (await repository.UsernameExistsAsync(username))
            throw new BusinessRuleException("Số điện thoại này đã được đăng ký.", 409);

        // A public caller must never claim a customer record that staff created earlier.
        if (await repository.GetCustomerByPhoneAsync(phone, internationalPhone) != null)
            throw new BusinessRuleException(
                "Số điện thoại đã có hồ sơ tại cửa hàng. Vui lòng liên hệ cửa hàng để xác minh và cấp tài khoản.", 409);

        var email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim();
        if (email != null && (await repository.EmailUsedByOtherAsync(0, email) || await repository.UserEmailExistsAsync(email)))
            throw new BusinessRuleException("Email này đã được sử dụng.", 409);

        var role = await repository.GetActiveCustomerRoleAsync();
        if (role == null)
            throw new BusinessRuleException("Vai trò khách hàng chưa được cấu hình.", 500);

        var now = DateTime.UtcNow;
        var customer = new Customer
        {
            FullName = request.FullName.Trim(),
            Phone = phone,
            Email = email,
            Address = string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim(),
            DateOfBirth = request.DateOfBirth,
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };
        var user = new User
        {
            Username = username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password, 11),
            FullName = customer.FullName,
            Email = customer.Email,
            RoleId = role.Id,
            RoleEntity = role,
            Customer = customer,
            IsActive = true,
            IsLocked = false,
            CreatedAt = now,
            UpdatedAt = now
        };

        try
        {
            await repository.SaveRegistrationAsync(customer, user);
            await transaction.CommitAsync();
        }
        catch (DbUpdateException)
        {
            throw new BusinessRuleException("Số điện thoại hoặc email đã được sử dụng.", 409);
        }

        customers.SyncRegisteredCustomer(customer);
        await realtime.BroadcastToWeb("CustomerCreated", ToAdminPayload(customer), "customers.read");
        return Authenticate(user, customer);
    }

    public async Task<StorefrontAuthenticationDTO> LoginAsync(StorefrontCustomerLoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
            throw new BusinessRuleException("Vui lòng nhập tên đăng nhập và mật khẩu.");

        var identifier = request.Username.Trim();
        var user = await repository.GetCustomerLoginAsync(identifier, NormalizePhone(identifier));
        if (user?.Customer == null || user.RoleEntity == null ||
            !string.Equals(user.RoleEntity.Name, "customer", StringComparison.OrdinalIgnoreCase) ||
            !user.IsActive || user.IsLocked || !user.RoleEntity.IsActive ||
            !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            throw new BusinessRuleException("Tên đăng nhập hoặc mật khẩu không đúng.", 401);
        if (!user.Customer.IsActive)
            throw new BusinessRuleException("Tài khoản khách hàng đã bị khóa.", 401);

        var now = DateTime.UtcNow;
        await repository.UpdateLastLoginAsync(user.Id, now);
        user.LastLogin = now;
        return Authenticate(user, user.Customer);
    }

    public async Task<StorefrontCustomerProfileDTO> GetProfileAsync(int customerId)
    {
        var customer = await GetCustomerAsync(customerId);
        return ToProfile(customer);
    }

    public async Task<StorefrontCustomerProfileDTO> UpdateAddressAsync(int customerId, StorefrontAddressUpdateRequest request)
    {
        var address = request.Address?.Trim();
        if (string.IsNullOrWhiteSpace(address))
            throw new BusinessRuleException("Địa chỉ không được để trống.");

        var customer = await GetCustomerAsync(customerId);
        customer.Address = address;
        customer.UpdatedAt = DateTime.UtcNow;
        await repository.SaveCustomerAsync(customer);
        await PublishCustomerUpdatedAsync(customer);
        return ToProfile(customer);
    }

    public async Task<StorefrontCustomerProfileDTO> UpdateAsync(int customerId, StorefrontAccountUpdateRequest request)
    {
        var fullName = request.FullName?.Trim();
        if (string.IsNullOrWhiteSpace(fullName) || fullName.Length < 2)
            throw new BusinessRuleException("Họ tên cần có ít nhất 2 ký tự.");
        if (request.DateOfBirth.HasValue && request.DateOfBirth.Value.Date > DateTime.UtcNow.Date)
            throw new BusinessRuleException("Ngày sinh không thể ở trong tương lai.");

        var customer = await GetCustomerAsync(customerId);
        var email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim();
        if (email != null && await repository.EmailUsedByOtherAsync(customer.Id, email))
            throw new BusinessRuleException("Email này đã được sử dụng cho khách hàng khác.", 409);
        var account = await repository.GetUserByCustomerIdAsync(customer.Id);
        if (email != null && account?.Email != email && await repository.UserEmailExistsAsync(email))
            throw new BusinessRuleException("Email này đã được sử dụng cho tài khoản khác.", 409);

        var now = DateTime.UtcNow;
        customer.FullName = fullName;
        customer.Email = email;
        customer.Address = string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim();
        customer.DateOfBirth = request.DateOfBirth;
        customer.UpdatedAt = now;
        if (account != null)
        {
            account.FullName = customer.FullName;
            account.Email = customer.Email;
            account.UpdatedAt = now;
        }

        try
        {
            await repository.SaveAccountAsync(customer, account);
        }
        catch (DbUpdateException)
        {
            throw new BusinessRuleException("Không thể lưu thông tin. Email hoặc dữ liệu hồ sơ có thể bị trùng.", 409);
        }

        await PublishCustomerUpdatedAsync(customer);
        return ToProfile(customer);
    }

    private async Task<Customer> GetCustomerAsync(int customerId) =>
        await repository.GetActiveCustomerAsync(customerId) ??
        throw new BusinessRuleException("Phiên đăng nhập không hợp lệ.", 401);

    private StorefrontAuthenticationDTO Authenticate(User user, Customer customer)
    {
        var (token, expiresIn) = jwt.GenerateToken(user);
        return new StorefrontAuthenticationDTO
        {
            Token = token,
            ExpiresIn = expiresIn,
            Customer = ToProfile(customer)
        };
    }

    private async Task PublishCustomerUpdatedAsync(Customer customer)
    {
        customers.SyncRegisteredCustomer(customer);
        await realtime.BroadcastToWeb("CustomerUpdated", ToAdminPayload(customer), "customers.read");
    }

    private static StorefrontCustomerProfileDTO ToProfile(Customer customer) => new()
    {
        Id = customer.Id,
        FullName = customer.FullName,
        Phone = customer.Phone ?? string.Empty,
        Email = customer.Email,
        Address = customer.Address,
        DateOfBirth = customer.DateOfBirth,
        RewardPoints = customer.RewardPoints
    };

    private static object ToAdminPayload(Customer customer) => new
    {
        id = customer.Id,
        fullName = customer.FullName,
        phone = customer.Phone,
        email = customer.Email,
        address = customer.Address,
        dateOfBirth = customer.DateOfBirth,
        rewardPoints = customer.RewardPoints,
        isActive = customer.IsActive,
        createdAt = customer.CreatedAt,
        updatedAt = customer.UpdatedAt
    };

    private static string NormalizePhone(string value)
    {
        var normalized = Regex.Replace(value.Trim(), "[\\s().-]", string.Empty);
        if (normalized.StartsWith("+84", StringComparison.Ordinal))
            normalized = $"0{normalized[3..]}";
        else if (normalized.StartsWith("84", StringComparison.Ordinal))
            normalized = $"0{normalized[2..]}";
        return normalized;
    }
}
