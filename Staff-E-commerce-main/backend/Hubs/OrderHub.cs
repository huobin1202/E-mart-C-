using System.Collections.Concurrent;
using System.Security.Claims;
using backend.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace backend.Hubs;

public sealed record OrderConnection(string Id, int UserId, int SessionVersion, string Role, long ExpiresAt);

public sealed class OrderConnectionRegistry
{
    private readonly ConcurrentDictionary<string, OrderConnection> _connections = new();
    public OrderConnection[] Snapshot() => _connections.Values.ToArray();
    public void Add(OrderConnection connection) => _connections[connection.Id] = connection;
    public void Remove(string id) => _connections.TryRemove(id, out _);
}

[Authorize]
public sealed class OrderHub(AppDbContext db, OrderConnectionRegistry registry) : Hub
{
    public override async Task OnConnectedAsync()
    {
        var user = Context.User;
        if (!int.TryParse(user?.FindFirst("uid")?.Value, out var id) ||
            !int.TryParse(user.FindFirst("session_version")?.Value, out var version) ||
            !long.TryParse(user.FindFirst("exp")?.Value, out var expires) ||
            !await db.Users.AnyAsync(u => u.Id == id && u.SessionVersion == version && u.IsActive && !u.IsLocked &&
                u.RoleEntity.IsActive && u.RoleEntity.Name != "customer" &&
                (u.EmployeeId == null || u.Employee!.IsActive) &&
                u.RoleEntity.RolePermissions.Any(p => p.Permission.Code == "orders.read")))
        {
            Context.Abort();
            throw new HubException("Bạn không có quyền theo dõi đơn hàng.");
        }
        registry.Add(new(Context.ConnectionId, id, version, user.FindFirst(ClaimTypes.Role)!.Value, expires));
        await base.OnConnectedAsync();
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        registry.Remove(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }
}

// Revalidate on every publication, so an open socket cannot retain revoked access.
public sealed class OrderNotifications(AppDbContext db, IHubContext<OrderHub> hub, OrderConnectionRegistry registry, ILogger<OrderNotifications> logger)
{
    private readonly List<(string Name, object Payload)> _pending = new();
    public Task PublishAsync(string eventName, object payload)
    {
        _pending.Add((eventName, payload));
        return Task.CompletedTask;
    }

    public async Task FlushAsync()
    {
        foreach (var (name, payload) in _pending)
        {
            try { await PublishCoreAsync(name, payload); }
            catch (Exception ex) { logger.LogWarning(ex, "Could not publish order notification {EventName}.", name); }
        }
        _pending.Clear();
    }

    private async Task PublishCoreAsync(string eventName, object payload)
    {
        var connections = registry.Snapshot();
        if (connections.Length == 0) return;
        var ids = connections.Select(c => c.UserId).Distinct().ToList();
        var allowed = await db.Users.AsNoTracking().Where(u => ids.Contains(u.Id) && u.IsActive && !u.IsLocked &&
            u.RoleEntity.IsActive && u.RoleEntity.Name != "customer" &&
            (u.EmployeeId == null || u.Employee!.IsActive) &&
            u.RoleEntity.RolePermissions.Any(p => p.Permission.Code == "orders.read"))
            .Select(u => new { u.Id, u.SessionVersion, Role = u.RoleEntity.Name }).ToListAsync();
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var recipients = connections.Where(c => c.ExpiresAt > now &&
            allowed.Any(u => u.Id == c.UserId && u.SessionVersion == c.SessionVersion && u.Role == c.Role)).Select(c => c.Id).ToArray();
        foreach (var expired in connections.Where(c => !recipients.Contains(c.Id))) registry.Remove(expired.Id);
        if (recipients.Length > 0) await hub.Clients.Clients(recipients).SendAsync(eventName, payload);
    }
}
