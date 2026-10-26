using backend.DTO;
using backend.Models;
using backend.Repository;
using backend.Security;

namespace backend.Services;

public sealed class RoleService
{
    private readonly RoleRepository _repository;
    private readonly BusMemoryCache<RoleDTO> _cache;
    private readonly BusMemoryCache<Permission> _permissionCache;
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(15);

    public RoleService(RoleRepository repository, BusMemoryCache<RoleDTO> cache, BusMemoryCache<Permission> permissionCache)
    { _repository = repository; _cache = cache; _permissionCache = permissionCache; }

    public async Task<IReadOnlyList<RoleDTO>> GetRolesAsync()
    {
        var (items, _) = await _cache.GetOrCreateAsync(async () => (await _repository.GetAllAsync()).Select(Map).ToList(), CacheTtl);
        return items;
    }

    public async Task<IReadOnlyList<Permission>> GetPermissionsAsync()
    {
        var (items, _) = await _permissionCache.GetOrCreateAsync(() => _repository.GetPermissionsAsync(), CacheTtl);
        return items;
    }

    public async Task<(RoleDTO? Result, string? Error, int StatusCode)> CreateAsync(RoleDTO request)
    {
        request.Name = request.Name.Trim().ToLowerInvariant();
        if (await _repository.ExistsByNameAsync(request.Name)) return (null, "Role already exists.", 409);
        var permissions = await _repository.GetPermissionsByIdsAsync(request.PermissionIds);
        if (permissions.Count != request.PermissionIds.Distinct().Count()) return (null, "One or more permissions do not exist.", 400);
        var role = new Role { Name = request.Name, Description = request.Description?.Trim(), IsActive = request.IsActive };
        role.RolePermissions = permissions.Select(p => new RolePermission { Permission = p }).ToList();
        _repository.Add(role);
        var saved = await _repository.SaveAsync(role);
        var result = Map(saved); _cache.AddOrUpdate(result, item => item.Id);
        return (result, null, 201);
    }

    public async Task<(RoleDTO? Result, string? Error, int StatusCode)> UpdateAsync(int id, RoleDTO request)
    {
        var role = await _repository.GetByIdAsync(id);
        if (role is null) return (null, null, 404);
        if (role.Name == "customer") return (null, "Quyền khách hàng được áp dụng cố định, không cấu hình trong phân quyền nội bộ.", 409);
        request.Name = request.Name.Trim().ToLowerInvariant();
        if (await _repository.ExistsByNameAsync(request.Name, id)) return (null, "Role already exists.", 409);
        if (role.Name is "admin" or "staff" or "customer" && role.Name != request.Name) return (null, "Không thể đổi mã vai trò hệ thống.", 409);
        if (role.Name == "admin" && !request.IsActive) return (null, "Không thể ngừng hoạt động vai trò quản trị hệ thống.", 409);
        var permissions = await _repository.GetPermissionsByIdsAsync(request.PermissionIds);
        if (permissions.Count != request.PermissionIds.Distinct().Count()) return (null, "One or more permissions do not exist.", 400);
        if (role.Name == "admin" && PermissionCatalog.AdministrationPermissions.Any(code => permissions.All(p => p.Code != code)))
            return (null, "Vai trò admin phải giữ quyền quản lý tài khoản và phân quyền để tránh mất quyền quản trị.", 409);
        if (role.IsActive != request.IsActive || role.Name != request.Name) await _repository.IncrementUserSessionsAsync(id);
        role.Name = request.Name; role.Description = request.Description?.Trim(); role.IsActive = request.IsActive;
        _repository.ReplacePermissions(role, permissions);
        var saved = await _repository.SaveAsync(role);
        var result = Map(saved); _cache.AddOrUpdate(result, item => item.Id);
        return (result, null, 200);
    }

    internal static RoleDTO Map(Role role) => new()
    {
        Id = role.Id, Name = role.Name, Description = role.Description, IsActive = role.IsActive,
        PermissionIds = role.RolePermissions.Select(rp => rp.PermissionId).ToList(),
        Permissions = role.RolePermissions.Where(rp => rp.Permission is not null).Select(rp => rp.Permission.Code).ToList()
    };
}
