namespace backend.Services;

public interface IActivityLogWriter
{
    Task LogAsync(int? userId, string action, string entityType, string entityId, string? payload, string ipAddress);
}
