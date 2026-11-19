using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using backend.Services;
using backend.Security;

namespace backend.Middlewares;

public sealed class RequestLoggingMiddleware(RequestDelegate next, IServiceProvider serviceProvider)
{
    private const int MaxPayloadLength = 1000;

    public async Task InvokeAsync(HttpContext context)
    {
        var method = context.Request.Method.ToUpperInvariant();
        var operation = AuditRequest.Describe(context);
        if (operation == null)
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
            await WriteLogSafelyAsync(context, method, operation, payload, requestFailure);
        }
    }

    private async Task WriteLogSafelyAsync(
        HttpContext context, string method, AuditOperation operation, string payload, Exception? requestFailure)
    {
        try
        {
            var entityId = AuditRequest.RouteId(context) ?? context.Items[AuditRequest.IdentityKey]?.ToString();
            var statusCode = requestFailure == null ? context.Response.StatusCode : 500;
            var result = context.Items[AuditRequest.ResultKey] as Dictionary<string, object?>;
            var businessFailed = result?.GetValueOrDefault("success") is false ||
                result?.GetValueOrDefault("succeeded") is false || result?.GetValueOrDefault("rolledBack") is true;
            var succeeded = requestFailure == null && statusCode < 400 && !businessFailed;
            var auditPayload = JsonSerializer.Serialize(new
            {
                method,
                // Route templates preserve the endpoint without exposing payment tokens in URLs.
                path = (context.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText,
                endpoint = operation.Endpoint,
                entityId,
                statusCode,
                succeeded,
                outcome = !succeeded ? "failed" : result?.GetValueOrDefault("hasErrors") is true ? "partial" : "succeeded",
                result,
                parameters = context.Request.Query.Where(pair => pair.Key is "isActive" or "status")
                    .ToDictionary(pair => pair.Key, pair => pair.Value.ToString()),
                body = payload
            });

            using var scope = serviceProvider.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<IActivityLogWriter>();
            await service.LogAsync(
                GetAuthenticatedUserId(context),
                operation.Action,
                operation.Entity,
                entityId ?? "",
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
        if (request.ContentLength == 0) return "[Empty Body]";
        if (request.ContentType?.Contains("json", StringComparison.OrdinalIgnoreCase) != true)
            return "[Payload omitted: not JSON]";
        try
        {
            request.EnableBuffering();
            using var reader = new StreamReader(request.Body, Encoding.UTF8, leaveOpen: true);
            var buffer = new char[65537];
            var count = 0;
            while (count < buffer.Length)
            {
                var read = await reader.ReadAsync(buffer.AsMemory(count));
                if (read == 0) break;
                count += read;
            }
            request.Body.Position = 0;
            if (count == buffer.Length) return "[Payload omitted: too large]";
            return count == 0 ? "[Empty Body]" : SanitizeJson(new string(buffer, 0, count));
        }
        catch
        {
            if (request.Body.CanSeek) request.Body.Position = 0;
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
                else if (normalized.Contains("phone") || normalized.Contains("address") || normalized.Contains("email") ||
                         normalized is "username" or "identifier" && LooksLikePhone(obj[key]))
                    obj[key] = MaskPersonalData(obj[key]); // customer usernames are their phone numbers
                else
                    Redact(obj[key]);
            }
        }
        else if (node is JsonArray array)
        {
            foreach (var child in array) Redact(child);
        }
    }

    private static bool LooksLikePhone(JsonNode? value) =>
        value is JsonValue && value.AsValue().TryGetValue<string>(out var text) && Regex.IsMatch(text.Trim(), @"^\+?\d{9,12}$");

    // Personal contact data is kept recognisable for support (first/last characters) but not readable in logs.
    private static JsonNode? MaskPersonalData(JsonNode? value)
    {
        if (value is not JsonValue || !value.AsValue().TryGetValue<string>(out var text) || string.IsNullOrEmpty(text))
            return value;
        return text.Length <= 4 ? "****" : $"{text[..2]}***{text[^2..]}";
    }

    private static int? GetAuthenticatedUserId(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated != true) return null;
        return int.TryParse(context.User.FindFirst("uid")?.Value, out var userId) ? userId : null;
    }

    private static bool IsAuthenticationEndpoint(string path) =>
        path.StartsWith("/api/auth/", StringComparison.OrdinalIgnoreCase) ||
        path.Equals("/api/me/change-password", StringComparison.OrdinalIgnoreCase) ||
        path.Equals("/api/storefront/register", StringComparison.OrdinalIgnoreCase);

}
