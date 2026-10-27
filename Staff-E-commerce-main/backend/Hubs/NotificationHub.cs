using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace backend.Hubs;

[Authorize]
public sealed class NotificationHub : Hub
{
    public const string StaffAdminGroup = "staff-admin";
    public const string StorefrontGroup = "storefront";

    public override async Task OnConnectedAsync()
    {
        var role = Context.User?.FindFirst(ClaimTypes.Role)?.Value;
        if (string.Equals(role, "admin", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(role, "staff", StringComparison.OrdinalIgnoreCase))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, StaffAdminGroup);
        }
        else if (string.Equals(role, "customer", StringComparison.OrdinalIgnoreCase))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, StorefrontGroup);
        }

        await base.OnConnectedAsync();
    }
}
