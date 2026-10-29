using backend.Data;
using backend.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

public sealed class RealtimeNotificationService(
    IHubContext<NotificationHub> hub,
    AppDbContext database,
    ILogger<RealtimeNotificationService> logger)
{
    public Task BroadcastToWeb(string eventName, object payload, string permission = "orders.read") =>
        SendToStaffSafelyAsync(permission, eventName, payload);

    public async Task BroadcastStock(string eventName, object payload)
    {
        await SendToStaffSafelyAsync("inventory.read", eventName, payload);
        await SendToCustomersSafelyAsync(eventName, payload);
    }

    private async Task SendToStaffSafelyAsync(string permission, string eventName, object payload)
    {
        try
        {
            var recipients = await database.Users.AsNoTracking()
                .Where(user => user.IsActive && !user.IsLocked && user.RoleEntity.IsActive &&
                    (user.EmployeeId == null || user.Employee!.IsActive) &&
                    user.RoleEntity.RolePermissions.Any(link => link.Permission.Code == permission))
                .Select(user => new { user.Id, user.SessionVersion })
                .ToListAsync();
            var groups = recipients.Select(user => NotificationHub.UserSessionGroup(user.Id, user.SessionVersion)).ToList();
            if (groups.Count > 0) await hub.Clients.Groups(groups).SendAsync(eventName, payload);
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "SignalR delivery failed for {EventName} ({Permission})", eventName, permission);
        }
    }

    private async Task SendToCustomersSafelyAsync(string eventName, object payload)
    {
        try
        {
            var recipients = await database.Users.AsNoTracking()
                .Where(user => user.IsActive && !user.IsLocked && user.RoleEntity.IsActive &&
                    user.RoleEntity.Name == "customer" && user.Customer != null && user.Customer.IsActive)
                .Select(user => new { user.Id, user.SessionVersion })
                .ToListAsync();
            var groups = recipients.Select(user => NotificationHub.UserSessionGroup(user.Id, user.SessionVersion)).ToList();
            if (groups.Count > 0) await hub.Clients.Groups(groups).SendAsync(eventName, payload);
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "SignalR storefront delivery failed for {EventName}", eventName);
        }
    }
}
