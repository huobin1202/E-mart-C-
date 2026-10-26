using backend.Data;
using backend.DTO;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Repository
{
    public class UserRepository
    {
        private readonly AppDbContext _context;

        public UserRepository(AppDbContext context)
        {
            _context = context;
        }

        // Lấy tất cả user
        public async Task<List<User>> GetAllAsync()
        {
            return await _context.Users
                .AsNoTracking()
                .Include(u => u.RoleEntity)
                .Include(u => u.Employee)
                .Include(u => u.Customer)
                .OrderBy(u => u.Username)
                .ToListAsync();
        }

        // Lấy user theo Id
        public async Task<User?> GetByIdAsync(int id)
        {
            return await _context.Users
                .Include(u => u.RoleEntity)
                .Include(u => u.Employee)
                .Include(u => u.Customer)
                .FirstOrDefaultAsync(u => u.Id == id);
        }

        // Lấy user theo username
        public async Task<User?> GetByUsernameAsync(string username)
        {
            return await _context.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.Username == username);
        }

        public Task<User?> GetForLoginAsync(string username) => _context.Users
            .Include(u => u.RoleEntity)
            .Include(u => u.Employee)
            .FirstOrDefaultAsync(u => u.Username == username);

        public Task<UserAccessDTO?> GetAccessAsync(int id) => _context.Users
            .AsNoTracking()
            .Where(u => u.Id == id)
            .Select(u => new UserAccessDTO
            {
                Role = u.RoleEntity.Name,
                Permissions = u.RoleEntity.RolePermissions
                    .Select(rp => rp.Permission.Code)
                    .ToList()
            })
            .FirstOrDefaultAsync();

        // Lấy user theo email
        public async Task<User?> GetByEmailAsync(string email)
        {
            return await _context.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.Email == email);
        }

        public async Task<Role?> GetRoleByNameAsync(string name)
        {
            return await _context.Roles
                .FirstOrDefaultAsync(r => r.Name == name);
        }

        public async Task<Employee?> GetEmployeeAsync(int id)
        {
            return await _context.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.Id == id);
        }

        public async Task<Customer?> GetCustomerAsync(int id)
        {
            return await _context.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id);
        }

        public async Task<bool> EmployeeHasAccountAsync(int employeeId, int? excludeUserId = null)
        {
            return await _context.Users.AnyAsync(u => u.EmployeeId == employeeId &&
                (!excludeUserId.HasValue || u.Id != excludeUserId.Value));
        }

        public async Task<bool> CustomerHasAccountAsync(int customerId, int? excludeUserId = null)
        {
            return await _context.Users.AnyAsync(u => u.CustomerId == customerId &&
                (!excludeUserId.HasValue || u.Id != excludeUserId.Value));
        }

        // Thêm user mới
        public async Task<User> AddAsync(User user)
        {
            _context.Users.Add(user);
            await _context.SaveChangesAsync();
            return user;
        }

        // Cập nhật user
        public async Task<User> UpdateAsync(User user)
        {
            // Keep EF's property-level tracking; Update() marks the whole profile
            // graph modified and can overwrite reward points or role changes.
            await _context.SaveChangesAsync();
            return user;
        }

        // Xóa user
        public async Task<bool> DeleteAsync(int id)
        {
            // Keep the checks and deletion atomic, including callers outside the HTTP filter.
            await using var transaction = _context.Database.CurrentTransaction == null
                ? await _context.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable)
                : null;
            var user = await _context.Users.FindAsync(id);
            if (user == null)
                return false;
            var hasActivity = user.LastLogin.HasValue ||
                await _context.Orders.AnyAsync(o => o.UserId == id ||
                    (user.CustomerId.HasValue && o.CustomerId == user.CustomerId)) ||
                await _context.InventoryAdjustments.AnyAsync(a => a.UserId == id) ||
                await _context.ActivityLogs.AnyAsync(a => a.UserId == id) ||
                await _context.PurchaseOrders.AnyAsync(p => p.UserId == id) ||
                (user.CustomerId.HasValue && (
                    await _context.PromotionRedemptions.AnyAsync(p => p.CustomerId == user.CustomerId) ||
                    await _context.Customers.AnyAsync(c => c.Id == user.CustomerId && c.RewardPoints != 0)));
            if (hasActivity)
                throw new InvalidOperationException("Tài khoản đã có hoạt động hoặc dữ liệu nghiệp vụ. Không thể xóa; hãy khóa tài khoản để giữ lịch sử.");

            _context.Users.Remove(user);
            await _context.SaveChangesAsync();
            if (transaction != null) await transaction.CommitAsync();
            return true;
        }

        // Kiểm tra tồn tại user theo Id
        public async Task<bool> ExistsAsync(int id)
        {
            return await _context.Users.AnyAsync(u => u.Id == id);
        }

        public async Task<User> ChangePasswordAsync(int id, string newPasswordHash)
        {
            var user = await _context.Users.FindAsync(id);
            if (user == null)
                throw new Exception("User not found");

            user.PasswordHash = newPasswordHash;
            user.SessionVersion++;
            _context.Users.Update(user);
            await _context.SaveChangesAsync();
            return user;
        }
    }

}
