using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Repository;

public sealed class RoleRepository
{
    private readonly AppDbContext _context;
    public RoleRepository(AppDbContext context) => _context = context;

    public Task<List<Role>> GetAllAsync() => _context.Roles.AsNoTracking()
        .Include(r => r.RolePermissions).ThenInclude(rp => rp.Permission)
        .OrderBy(r => r.Name).ToListAsync();

    public Task<List<Permission>> GetPermissionsAsync() => _context.Permissions
        .AsNoTracking().OrderBy(p => p.Code).ToListAsync();

    public Task<Role?> GetByIdAsync(int id) => _context.Roles
        .Include(r => r.RolePermissions).ThenInclude(rp => rp.Permission)
        .FirstOrDefaultAsync(r => r.Id == id);

    public Task<bool> ExistsByNameAsync(string name, int? excludeId = null) =>
        _context.Roles.AnyAsync(r => r.Name == name && (!excludeId.HasValue || r.Id != excludeId.Value));

    public async Task<List<Permission>> GetPermissionsByIdsAsync(IEnumerable<int> ids)
    {
        var distinctIds = ids.Distinct().ToList();
        return await _context.Permissions.Where(p => distinctIds.Contains(p.Id)).ToListAsync();
    }

    public Task<int> IncrementUserSessionsAsync(int roleId) => _context.Users.Where(u => u.RoleId == roleId)
        .ExecuteUpdateAsync(update => update.SetProperty(u => u.SessionVersion, u => u.SessionVersion + 1));

    public async Task<Role> SaveAsync(Role role) { await _context.SaveChangesAsync(); return role; }
    public void Add(Role role) => _context.Roles.Add(role);

    public void ReplacePermissions(Role role, IEnumerable<Permission> permissions)
    {
        _context.RolePermissions.RemoveRange(role.RolePermissions);
        role.RolePermissions = permissions.Select(p => new RolePermission { RoleId = role.Id, PermissionId = p.Id }).ToList();
    }
}
