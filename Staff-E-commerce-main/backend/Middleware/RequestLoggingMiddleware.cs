using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using backend.Services;

namespace backend.Middlewares;

public sealed class RequestLoggingMiddleware(RequestDelegate next, IServiceProvider serviceProvider)
{
    private const int MaxPayloadLength = 1000;

    public async Task InvokeAsync(HttpContext context)
    {
        var method = context.Request.Method.ToUpperInvariant();
        if (method is not ("POST" or "PUT" or "PATCH" or "DELETE"))
        {
            await next(context);
            return;
        }

        var path = context.Request.Path.ToString();
        var payload = IsAuthenticationEndpoint(path)
            ? "[Authentication payload omitted]"
            : await ReadAndSanitizePayloadAsync(context.Request);

        Exception? requestFailure = null;
        try
        {
            await next(context);
        }
        catch (Exception exception)
        {
            requestFailure = exception;
            throw;
        }
        finally
        {
            await WriteLogSafelyAsync(context, method, path, payload, requestFailure);
        }
    }

    private async Task WriteLogSafelyAsync(
        HttpContext context, string method, string path, string payload, Exception? requestFailure)
    {
        try
        {
            var entityName = NormalizeEntityName(ExtractEntityName(path));
            var entityId = ExtractEntityId(path);
            var action = method switch
            {
                "POST" => $"CREATE_{entityName}",
                "PUT" or "PATCH" => $"UPDATE_{entityName}",
                "DELETE" => $"DELETE_{entityName}",
                _ => $"HTTP_{method}_{entityName}"
            };
            var auditPayload = JsonSerializer.Serialize(new
            {
                statusCode = context.Response.StatusCode,
                succeeded = requestFailure == null && context.Response.StatusCode < 400,
                body = payload
            });
            if (auditPayload.Length > MaxPayloadLength)
                auditPayload = auditPayload[..MaxPayloadLength] + "...[truncated]";

            using var scope = serviceProvider.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<ActivityLogService>();
            await service.LogAsync(
                GetAuthenticatedUserId(context),
                action,
                entityName,
                entityId,
                auditPayload,
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown");
        }
        catch (Exception exception)
        {
            // Audit failure must not change the result of the business request.
            Console.Error.WriteLine($"[RequestLoggingMiddleware] Audit failed: {exception.Message}");
        }
    }

    private static async Task<string> ReadAndSanitizePayloadAsync(HttpRequest request)
    {
        if (request.ContentLength is null or 0) return "[Empty Body]";
        try
        {
            request.EnableBuffering();
            using var reader = new StreamReader(request.Body, Encoding.UTF8, leaveOpen: true);
            var body = await reader.ReadToEndAsync();
            request.Body.Position = 0;
            return SanitizeJson(body);
        }
        catch
        {
            return "[Unreadable Body]";
        }
    }

    private static string SanitizeJson(string text)
    {
        try
        {
            var node = JsonNode.Parse(text);
            Redact(node);
            var sanitized = node?.ToJsonString() ?? "null";
            return sanitized.Length <= MaxPayloadLength
                ? sanitized
                : sanitized[..MaxPayloadLength] + "...[truncated]";
        }
        catch (JsonException)
        {
            return "[Payload omitted: not JSON]";
        }
    }

    private static void Redact(JsonNode? node)
    {
        if (node is JsonObject obj)
        {
            foreach (var key in obj.Select(pair => pair.Key).ToArray())
            {
                var normalized = key.Replace("_", "").Replace("-", "").ToLowerInvariant();
                if (normalized.Contains("password") || normalized.Contains("token") ||
                    normalized.Contains("secret") || normalized.Contains("creditcard") ||
                    normalized is "authorization" or "apikey")
                    obj[key] = "[REDACTED]";
                else
                    Redact(obj[key]);
            }
        }
        else if (node is JsonArray array)
        {
            foreach (var child in array) Redact(child);
        }
    }

    private static int? GetAuthenticatedUserId(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated != true) return null;
        return int.TryParse(context.User.FindFirst("uid")?.Value, out var userId) ? userId : null;
    }

    private static bool IsAuthenticationEndpoint(string path) =>
        path.StartsWith("/api/auth/", StringComparison.OrdinalIgnoreCase) ||
        path.Equals("/api/me/change-password", StringComparison.OrdinalIgnoreCase) ||
        path.Equals("/api/storefront/login", StringComparison.OrdinalIgnoreCase) ||
        path.Equals("/api/storefront/register", StringComparison.OrdinalIgnoreCase);

    private static string NormalizeEntityName(string entityName) => entityName switch
    {
        "Inventoryadjustment" => "Inventory_Adjustment",
        _ => entityName
    };

    private static string ExtractEntityName(string path)
    {
        var match = Regex.Match(path, @"^/api/([^/]+)");
        if (!match.Success || string.IsNullOrEmpty(match.Groups[1].Value)) return "Unknown";
        var name = match.Groups[1].Value;
        return char.ToUpperInvariant(name[0]) + (name.Length > 1 ? name[1..].ToLowerInvariant() : string.Empty);
    }

    private static string ExtractEntityId(string path)
    {
        var match = Regex.Match(path, @"^/api/[^/]+/([^/?]+)");
        return match.Success && !string.IsNullOrEmpty(match.Groups[1].Value) ? match.Groups[1].Value : "0";
    }
}
