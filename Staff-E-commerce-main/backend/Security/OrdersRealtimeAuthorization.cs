using backend.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace backend.Security;

public sealed class OrdersReadRequirement : IAuthorizationRequirement;

public sealed class OrdersReadAuthorizationHandler(AppDbContext db) : AuthorizationHandler<OrdersReadRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, OrdersReadRequirement requirement)
    {
        if (!int.TryParse(context.User.FindFirst("uid")?.Value, out var id) || context.User.IsInRole("customer")) return;
        if (await db.Users.AsNoTracking().AnyAsync(u => u.Id == id && u.IsActive && !u.IsLocked && u.RoleEntity.IsActive &&
            u.RoleEntity.RolePermissions.Any(p => p.Permission.Code == "orders.read"))) context.Succeed(requirement);
    }
}
