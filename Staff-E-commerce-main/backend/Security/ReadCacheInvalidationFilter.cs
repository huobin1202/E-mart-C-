using backend.Services;
using Microsoft.AspNetCore.Mvc.Filters;

namespace backend.Security;

public sealed class ReadCacheInvalidationFilter(ReadCacheInvalidationService invalidation) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var result = await next();
        if (context.HttpContext.Request.Method is "GET" or "HEAD" or "OPTIONS") return;
        if (result.Exception == null || result.ExceptionHandled) invalidation.ClearAll();
    }
}
