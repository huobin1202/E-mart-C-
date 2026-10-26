using backend.Services;
using backend.Hubs;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;

namespace backend.Security;

public sealed class ReadCacheRefreshFilter(ReadCacheRefreshService refresh, OrderNotifications notifications, ILogger<ReadCacheRefreshFilter> logger) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        if (context.HttpContext.Request.Method is "GET" or "HEAD" or "OPTIONS" ||
            context.ActionDescriptor is ControllerActionDescriptor { ActionName: "ValidateStorefrontPromotion" or "ValidatePromotion" })
        { await next(); return; }
        try { await next(); }
        finally
        {
            try { await refresh.RefreshAsync(); }
            catch (Exception ex) { logger.LogError(ex, "Could not refresh read models after a mutation."); }
            await notifications.FlushAsync();
        }
    }
}
