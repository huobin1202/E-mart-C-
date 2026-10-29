using System.Security.Claims;
using backend.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace backend.Hubs;

[Authorize]
public sealed class NotificationHub(AppDbContext database) : Hub
{
    public static string UserSessionGroup(int userId, int sessionVersion) =>
        $"user-session:{userId}:{sessionVersion}";

    public override async Task OnConnectedAsync()
    {
        if (!int.TryParse(Context.User?.FindFirst("uid")?.Value, out var userId) ||
            !int.TryParse(Context.User?.FindFirst("session_version")?.Value, out var sessionVersion))
        {
            Context.Abort();
            return;
        }

        var role = Context.User?.FindFirst(ClaimTypes.Role)?.Value;
        var valid = await database.Users.AsNoTracking().AnyAsync(user =>
            user.Id == userId && user.SessionVersion == sessionVersion && user.IsActive && !user.IsLocked &&
            user.RoleEntity.IsActive && user.RoleEntity.Name == role &&
            (user.EmployeeId == null || user.Employee!.IsActive) &&
            (user.CustomerId == null || user.Customer!.IsActive));
        if (!valid)
        {
            Context.Abort();
            return;
        }

        if (string.Equals(role, "admin", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(role, "staff", StringComparison.OrdinalIgnoreCase))
        {
            var canReadOrders = await database.Users.AsNoTracking().AnyAsync(user => user.Id == userId &&
                user.RoleEntity.RolePermissions.Any(link => link.Permission.Code == "orders.read"));
            if (!canReadOrders)
            {
                Context.Abort();
                return;
            }
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, UserSessionGroup(userId, sessionVersion));
        await base.OnConnectedAsync();
    }
}
