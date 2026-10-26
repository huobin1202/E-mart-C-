using System.Data;
using backend.Data;
using backend.DTO;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace backend.Security;

// Serialize account/role changes and validate the final state before committing.
public sealed class AccountMutationFilter(AppDbContext db) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        if (context.HttpContext.Request.Method is "GET" or "HEAD" ||
            context.ActionDescriptor is not ControllerActionDescriptor action ||
            !(action.ControllerName is "Users" or "Roles" or "Employees" or "Me" ||
              action.ControllerName == "Auth" && action.ActionName == "Register"))
        {
            await next();
            return;
        }

        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        try
        {
            // A database lock works across API processes, unlike an in-memory lock.
            await db.Database.ExecuteSqlRawAsync("SELECT id FROM roles WITH (UPDLOCK, HOLDLOCK) WHERE name = 'admin'");
        if (!context.HttpContext.User.IsInRole("admin"))
        {
            var request = context.ActionArguments.Values.OfType<UserDTO>().FirstOrDefault();
            var targetId = context.ActionArguments.TryGetValue("id", out var value) && value is int id ? id : 0;
            var protectedUser = action.ControllerName == "Users" && targetId > 0 &&
                await db.Users.AnyAsync(u => u.Id == targetId && u.RoleEntity.Name == "admin");
            var protectedEmployee = action.ControllerName == "Employees" && targetId > 0 &&
                await db.Users.AnyAsync(u => u.EmployeeId == targetId && u.RoleEntity.Name == "admin");
            if (action.ControllerName == "Roles" || protectedUser || protectedEmployee ||
                string.Equals(request?.Role?.Trim(), "admin", StringComparison.OrdinalIgnoreCase))
            {
                context.Result = new ObjectResult(new { message = "Chỉ quản trị viên được quản lý vai trò và tài khoản quản trị." }) { StatusCode = 403 };
                return;
            }
        }

            var hadAdmin = await HasActiveAdminAsync();
            var result = await next();
            if (result.Exception != null && !result.ExceptionHandled)
            {
                if (result.Exception is ArgumentException or InvalidOperationException or DbUpdateException)
                {
                    result.ExceptionHandled = true;
                    result.Result = Error(result.Exception);
                }
                return;
            }
            if (result.Result is IStatusCodeActionResult status && status.StatusCode >= 400) return;
            if (hadAdmin && !await HasActiveAdminAsync())
            {
                result.Result = new ConflictObjectResult(new { message = "Phải giữ ít nhất một tài khoản quản trị đang hoạt động." });
                return;
            }
            await transaction.CommitAsync();
        }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException or DbUpdateException)
        {
            context.Result = Error(ex);
        }
    }

    private Task<bool> HasActiveAdminAsync() => db.Users.AsNoTracking().AnyAsync(u =>
        u.RoleEntity.Name == "admin" && u.RoleEntity.IsActive && u.IsActive && !u.IsLocked &&
        (u.EmployeeId == null || u.Employee!.IsActive));

    private static ObjectResult Error(Exception ex) => new(new
    {
        message = ex is DbUpdateException ? "Dữ liệu bị trùng hoặc đang được sử dụng. Vui lòng tải lại và thử lại." : ex.Message
    }) { StatusCode = ex is ArgumentException ? 400 : 409 };
}
