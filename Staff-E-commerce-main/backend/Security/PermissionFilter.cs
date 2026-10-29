using backend.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace backend.Security;

public sealed class PermissionFilter(AppDbContext db) : IAsyncAuthorizationFilter
{
    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        if (context.ActionDescriptor.EndpointMetadata.OfType<IAllowAnonymous>().Any()) return;
        if (context.ActionDescriptor is not ControllerActionDescriptor action) return;
        var permission = PermissionCatalog.ForRequest(action.ControllerName, action.ActionName, context.HttpContext.Request.Method);
        if (permission == null)
        {
            // These controllers intentionally rely on ownership/role checks instead of staff permissions.
            if (action.ControllerName is "Storefront" or "Me" or "Secret") return;
            context.Result = new ObjectResult(new { message = "Endpoint chưa được ánh xạ quyền truy cập." }) { StatusCode = 403 };
            return;
        }
        var user = context.HttpContext.User;
        if (user.Identity?.IsAuthenticated != true)
        {
            context.Result = new UnauthorizedResult();
            return;
        }
        // Customer accounts never receive access to staff APIs, even if misconfigured.
        if (!int.TryParse(user.FindFirst("uid")?.Value, out var id) || user.IsInRole("customer") ||
            !await db.Users.AnyAsync(u => u.Id == id && u.IsActive && !u.IsLocked && u.RoleEntity.IsActive &&
                u.RoleEntity.RolePermissions.Any(rp => rp.Permission.Code == permission)))
            context.Result = new ObjectResult(new { message = $"Bạn không có quyền {permission}." }) { StatusCode = 403 };
    }
}
