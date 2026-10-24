using backend.DTO;
using backend.Models;
using backend.Repository;

namespace backend.Services
{
    public class UserService
    {
        public enum ChangePasswordResult
        {
            Success,
            UserNotFound,
            InvalidCurrentPassword
        }

        private readonly UserRepository _userRepository;
        private readonly BusMemoryCache<UserDTO> _cache;
        private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(15);

        public UserService(UserRepository userRepository, BusMemoryCache<UserDTO> cache)
        {
            _userRepository = userRepository;
            _cache = cache;
        }

        public async Task<List<UserDTO>> GetAllUsersAsync()
        {
            var (users, _) = await _cache.GetOrCreateAsync(async () =>
            {
                var loaded = await _userRepository.GetAllAsync();
                return loaded.Select(MapToUserDto).ToList();
            }, CacheTtl);
            return users.ToList();
        }

        public async Task<PaginationResult<UserDTO>> GetPaginatedAsync(int page, int pageSize, string? role = null, bool? isActive = null, string? search = null)
        {
            var all = await GetAllUsersAsync();
            IEnumerable<UserDTO> filtered = all;
            if (!string.IsNullOrWhiteSpace(role))
                filtered = filtered.Where(user => string.Equals(user.Role, role.Trim(), StringComparison.OrdinalIgnoreCase));
            if (isActive.HasValue)
                filtered = filtered.Where(user => user.IsActive == isActive.Value && user.IsLocked != isActive.Value);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var keyword = search.Trim();
                filtered = filtered.Where(user => user.Username.Contains(keyword, StringComparison.OrdinalIgnoreCase) ||
                    (user.FullName?.Contains(keyword, StringComparison.OrdinalIgnoreCase) ?? false) ||
                    (user.Email?.Contains(keyword, StringComparison.OrdinalIgnoreCase) ?? false));
            }
            var totalItems = filtered.Count();
            var totalPages = Math.Max(1, (int)Math.Ceiling(totalItems / (double)pageSize));
            page = Math.Min(Math.Max(page, 1), totalPages);
            var items = filtered.Skip((page - 1) * pageSize).Take(pageSize).ToList();

            return new PaginationResult<UserDTO>
            {
                Items = items,
                TotalItems = totalItems,
                CurrentPage = page,
                PageSize = pageSize,
                TotalPages = totalPages,
                HasPrevious = page > 1,
                HasNext = page < totalPages
            };
        }

        public async Task<PaginationResult<UserDTO>> GetStaffPaginatedAsync(int page, int pageSize)
        {
            var all = await GetAllUsersAsync();
            var filtered = all.Where(user => !string.Equals(user.Role, "admin", StringComparison.OrdinalIgnoreCase)).ToList();
            var totalItems = filtered.Count;
            var totalPages = Math.Max(1, (int)Math.Ceiling(totalItems / (double)pageSize));
            page = Math.Min(Math.Max(page, 1), totalPages);

            return new PaginationResult<UserDTO>
            {
                Items = filtered.Skip((page - 1) * pageSize).Take(pageSize).ToList(),
                TotalItems = totalItems,
                CurrentPage = page,
                PageSize = pageSize,
                TotalPages = totalPages,
                HasPrevious = page > 1,
                HasNext = page < totalPages
            };
        }

        public async Task<UserDTO?> GetUserByIdAsync(int id)
        {
            var user = await _userRepository.GetByIdAsync(id);
            return user == null ? null : MapToUserDto(user);
        }

        public Task<UserAccessDTO?> GetAccessAsync(int id) => _userRepository.GetAccessAsync(id);

        public async Task<UserDTO?> CreateUserAsync(UserDTO request)
        {
            if (string.IsNullOrWhiteSpace(request.Password))
                throw new ArgumentException("Password is required", nameof(request.Password));

            await ValidateAccountAsync(request);
            var roleName = NormalizeRole(request.Role);
            var role = await _userRepository.GetRoleByNameAsync(roleName);
            if (role == null || !role.IsActive)
                throw new ArgumentException($"Role '{roleName}' does not exist or is inactive.", nameof(request.Role));
            if (request.EmployeeId.HasValue && roleName == "customer")
                throw new ArgumentException("Tài khoản khách hàng không được gắn hồ sơ nhân viên.", nameof(request.EmployeeId));
            if (request.CustomerId.HasValue && roleName != "customer")
                throw new ArgumentException("Tài khoản khách hàng phải có role customer.", nameof(request.CustomerId));
            if (request.EmployeeId.HasValue && await _userRepository.EmployeeHasAccountAsync(request.EmployeeId.Value))
                throw new ArgumentException("Hồ sơ nhân viên này đã được cấp tài khoản.", nameof(request.EmployeeId));
            if (request.CustomerId.HasValue && await _userRepository.CustomerHasAccountAsync(request.CustomerId.Value))
                throw new ArgumentException("Hồ sơ khách hàng này đã được cấp tài khoản.", nameof(request.CustomerId));

            var employee = request.EmployeeId.HasValue
                ? await _userRepository.GetEmployeeAsync(request.EmployeeId.Value)
                : null;
            var customer = request.CustomerId.HasValue
                ? await _userRepository.GetCustomerAsync(request.CustomerId.Value)
                : null;
            if (request.EmployeeId.HasValue && employee == null)
                throw new ArgumentException("Hồ sơ nhân viên không tồn tại.", nameof(request.EmployeeId));
            if (request.CustomerId.HasValue && customer == null)
                throw new ArgumentException("Hồ sơ khách hàng không tồn tại.", nameof(request.CustomerId));

            var now = DateTime.UtcNow;

            var user = new User
            {
                Username = request.Username.Trim(),
                Email = employee != null ? employee.Email : customer != null ? customer.Email : request.Email?.Trim(),
                FullName = employee?.FullName ?? customer?.FullName ??
                    (string.IsNullOrWhiteSpace(request.FullName) ? request.Username.Trim() : request.FullName.Trim()),
                RoleId = role.Id,
                RoleEntity = role,
                EmployeeId = request.EmployeeId,
                CustomerId = request.CustomerId,
                IsActive = request.IsActive,
                IsLocked = !request.IsActive,
                CreatedAt = now,
                UpdatedAt = now,
                PasswordHash = HashPassword(request.Password)
            };

            var createdUser = await _userRepository.AddAsync(user);
            _cache.Clear();
            return MapToUserDto(createdUser);
        }

        public async Task<UserDTO?> UpdateUserAsync(int id, UserDTO request)
        {
            var existingUser = await _userRepository.GetByIdAsync(id);
            if (existingUser == null) return null;

            await ValidateAccountAsync(request, id);

            existingUser.Username = request.Username.Trim();
            var role = await _userRepository.GetRoleByNameAsync(NormalizeRole(request.Role));
            if (role == null || !role.IsActive)
                throw new ArgumentException($"Role '{request.Role}' does not exist or is inactive.", nameof(request.Role));

            var employee = request.EmployeeId.HasValue
                ? await _userRepository.GetEmployeeAsync(request.EmployeeId.Value)
                : null;
            var customer = request.CustomerId.HasValue
                ? await _userRepository.GetCustomerAsync(request.CustomerId.Value)
                : null;
            if (request.EmployeeId.HasValue && employee == null)
                throw new ArgumentException("Hồ sơ nhân viên không tồn tại.", nameof(request.EmployeeId));
            if (request.CustomerId.HasValue && customer == null)
                throw new ArgumentException("Hồ sơ khách hàng không tồn tại.", nameof(request.CustomerId));

            existingUser.Email = employee != null ? employee.Email : customer != null ? customer.Email : request.Email?.Trim();
            existingUser.FullName = employee?.FullName ?? customer?.FullName ??
                (string.IsNullOrWhiteSpace(request.FullName) ? existingUser.FullName : request.FullName.Trim());
            existingUser.RoleId = role.Id;
            existingUser.RoleEntity = role;
            existingUser.EmployeeId = request.EmployeeId;
            existingUser.CustomerId = request.CustomerId;
            if (request.EmployeeId.HasValue && await _userRepository.EmployeeHasAccountAsync(request.EmployeeId.Value, id))
                throw new ArgumentException("Hồ sơ nhân viên này đã được cấp tài khoản.", nameof(request.EmployeeId));
            if (request.CustomerId.HasValue && await _userRepository.CustomerHasAccountAsync(request.CustomerId.Value, id))
                throw new ArgumentException("Hồ sơ khách hàng này đã được cấp tài khoản.", nameof(request.CustomerId));
            existingUser.IsActive = request.IsActive;
            existingUser.IsLocked = !request.IsActive;
            existingUser.UpdatedAt = DateTime.UtcNow;
            existingUser.SessionVersion++;

            if (!string.IsNullOrWhiteSpace(request.Password))
            {
                existingUser.PasswordHash = HashPassword(request.Password);
            }

            var updatedUser = await _userRepository.UpdateAsync(existingUser);
            _cache.Clear();
            return MapToUserDto(updatedUser);
        }

        public async Task<UserDTO?> UpdateProfileAsync(int id, MeDTO request)
        {
            var existingUser = await _userRepository.GetByIdAsync(id);
            if (existingUser == null) return null;

            existingUser.Username = request.Username.Trim();
            existingUser.Email = request.Email?.Trim();
            existingUser.FullName = request.FullName?.Trim() ?? existingUser.FullName;
            // Profile records are the source of truth; update both in the same transaction.
            if (existingUser.Employee != null)
            {
                existingUser.Employee.FullName = existingUser.FullName;
                existingUser.Employee.Email = existingUser.Email;
                existingUser.Employee.UpdatedAt = DateTime.UtcNow;
            }
            if (existingUser.Customer != null)
            {
                existingUser.Customer.FullName = existingUser.FullName;
                existingUser.Customer.Email = existingUser.Email;
                existingUser.Customer.UpdatedAt = DateTime.UtcNow;
            }
            existingUser.UpdatedAt = DateTime.UtcNow;

            var updatedUser = await _userRepository.UpdateAsync(existingUser);
            _cache.Clear();
            return MapToUserDto(updatedUser);
        }

        public async Task<UserDTO?> UpdateStatusAsync(int id, bool isActive)
        {
            var existingUser = await _userRepository.GetByIdAsync(id);
            if (existingUser == null) return null;
            if (isActive && (existingUser.Employee?.IsActive == false || existingUser.Customer?.IsActive == false || !existingUser.RoleEntity.IsActive))
                throw new ArgumentException("Không thể mở tài khoản khi hồ sơ hoặc vai trò đã ngừng hoạt động.");

            existingUser.IsActive = isActive;
            existingUser.IsLocked = !isActive;
            existingUser.SessionVersion++;
            existingUser.UpdatedAt = DateTime.UtcNow;

            var updatedUser = await _userRepository.UpdateAsync(existingUser);
            _cache.Clear();
            return MapToUserDto(updatedUser);
        }

        public async Task<ChangePasswordResult> ChangePasswordAsync(int id, string currentPassword, string newPassword)
        {
            var existingUser = await _userRepository.GetByIdAsync(id);
            if (existingUser == null) return ChangePasswordResult.UserNotFound;

            if (!VerifyPassword(existingUser.PasswordHash, currentPassword))
                return ChangePasswordResult.InvalidCurrentPassword;

            existingUser.PasswordHash = HashPassword(newPassword);
            existingUser.SessionVersion++;
            existingUser.UpdatedAt = DateTime.UtcNow;

            await _userRepository.UpdateAsync(existingUser);
            _cache.Clear();
            return ChangePasswordResult.Success;
        }

        public async Task<bool> DeleteUserAsync(int id)
        {
            // The repository rejects deletion once the account has activity.
            var deleted = await _userRepository.DeleteAsync(id);
            if (deleted) _cache.Clear();
            return deleted;
        }

        private async Task ValidateAccountAsync(UserDTO request, int? excludeId = null)
        {
            var roleName = NormalizeRole(request.Role);
            if (request.EmployeeId.HasValue && request.CustomerId.HasValue)
                throw new ArgumentException("Tài khoản chỉ được gắn một loại hồ sơ.");
            if (roleName == "customer" && (!request.CustomerId.HasValue || request.EmployeeId.HasValue))
                throw new ArgumentException("Tài khoản khách hàng phải gắn hồ sơ khách hàng.");
            if (roleName != "customer" && request.CustomerId.HasValue)
                throw new ArgumentException("Chỉ tài khoản khách hàng được gắn hồ sơ khách hàng.");
            if (roleName != "admin" && roleName != "customer" && !request.EmployeeId.HasValue)
                throw new ArgumentException("Tài khoản nội bộ phải gắn hồ sơ nhân viên.");
            var employee = request.EmployeeId.HasValue ? await _userRepository.GetEmployeeAsync(request.EmployeeId.Value) : null;
            var customer = request.CustomerId.HasValue ? await _userRepository.GetCustomerAsync(request.CustomerId.Value) : null;
            if (request.IsActive && (employee?.IsActive == false || customer?.IsActive == false))
                throw new ArgumentException("Không thể cấp hoặc mở tài khoản cho hồ sơ đã ngừng hoạt động.");
            if (await UserExistsUsernameAsync(request.Username, excludeId))
                throw new ArgumentException("Tên đăng nhập đã được sử dụng.");
            var email = employee != null ? employee.Email : customer != null ? customer.Email : request.Email;
            if (!string.IsNullOrWhiteSpace(email) && await UserExistsEmailAsync(email, excludeId))
                throw new ArgumentException("Email đã được sử dụng.");
        }

        public async Task<bool> UserExistsEmailAsync(string email, int? excludeUserId = null)
        {
            if (string.IsNullOrWhiteSpace(email)) return false;

            var user = await _userRepository.GetByEmailAsync(email.Trim());
            if (user == null) return false;

            return excludeUserId == null || user.Id != excludeUserId.Value;
        }

        public async Task<bool> UserExistsUsernameAsync(string username, int? excludeUserId = null)
        {
            if (string.IsNullOrWhiteSpace(username)) return false;

            var user = await _userRepository.GetByUsernameAsync(username.Trim());
            if (user == null) return false;

            return excludeUserId == null || user.Id != excludeUserId.Value;
        }

        private UserDTO MapToUserDto(User user)
        {
            return new UserDTO
            {
                Id = user.Id,
                EmployeeId = user.EmployeeId,
                CustomerId = user.CustomerId,
                EmployeeName = user.Employee?.FullName,
                CustomerName = user.Customer?.FullName,
                Username = user.Username,
                Email = user.Employee != null ? user.Employee.Email : user.Customer != null ? user.Customer.Email : user.Email,
                FullName = user.Employee?.FullName ?? user.Customer?.FullName ?? user.FullName,
                Role = user.RoleEntity?.Name ?? string.Empty,
                IsActive = user.IsActive,
                IsLocked = user.IsLocked,
                UpdatedAt = user.UpdatedAt,
                LastLogin = user.LastLogin
            };
        }

        private static string NormalizeRole(string role)
        {
            var normalized = string.IsNullOrWhiteSpace(role)
                ? "staff"
                : role.Trim().ToLowerInvariant();

            return normalized;
        }

        private const int BcryptWorkFactor = 11;

        private static string HashPassword(string password) => BCrypt.Net.BCrypt.HashPassword(password, workFactor: BcryptWorkFactor);

        private static bool VerifyPassword(string hashedPassword, string password) =>
            BCrypt.Net.BCrypt.Verify(password, hashedPassword);
    }
}
