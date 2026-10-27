using backend.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace backend.Services;

public sealed class RealtimeNotificationService(
    IHubContext<NotificationHub> hub,
    ILogger<RealtimeNotificationService> logger)
{
    public Task BroadcastToWeb(string eventName, object payload) =>
        SendSafely(NotificationHub.StaffAdminGroup, eventName, payload);

    public async Task BroadcastStock(string eventName, object payload)
    {
        await SendSafely(NotificationHub.StaffAdminGroup, eventName, payload);
        await SendSafely(NotificationHub.StorefrontGroup, eventName, payload);
    }

    private async Task SendSafely(string group, string eventName, object payload)
    {
        try
        {
            await hub.Clients.Group(group).SendAsync(eventName, payload);
        }
        catch (Exception exception)
        {
            // A notification failure must never turn a committed SQL operation into an API failure.
            logger.LogWarning(exception, "SignalR delivery failed for {EventName} to {Group}", eventName, group);
        }
    }
}
