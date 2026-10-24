using backend.DTO;
using backend.Repository;

namespace backend.Services;

public sealed class AuthService
{
    private readonly UserRepository _users;
    private readonly JwtService _jwt;

    public AuthService(UserRepository users, JwtService jwt)
    {
        _users = users;
        _jwt = jwt;
    }

    public async Task<(AuthResponse? Response, string? Error, int StatusCode)> LoginAsync(LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
            return (null, "Vui lòng nhập tên đăng nhập và mật khẩu", 400);

        var user = await _users.GetForLoginAsync(request.Username);
        if (user is null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return (null, "Tên đăng nhập hoặc mật khẩu không đúng", 401);

        if (!user.IsActive || user.IsLocked || !user.RoleEntity.IsActive || user.Employee?.IsActive == false)
            return (null, "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên", 401);

        if (string.Equals(user.RoleEntity.Name, "customer", StringComparison.OrdinalIgnoreCase))
            return (null, "Tài khoản khách hàng chỉ đăng nhập trên ứng dụng khách hàng.", 403);

        user.LastLogin = DateTime.UtcNow;
        await _users.UpdateAsync(user);
        var (token, expiresIn) = _jwt.GenerateToken(user);
        return (new AuthResponse
        {
            Token = token,
            TokenType = "Bearer",
            ExpiresIn = expiresIn,
            UserId = user.Id,
            UserName = user.Username,
            Role = user.RoleEntity.Name
        }, null, 200);
    }
}
