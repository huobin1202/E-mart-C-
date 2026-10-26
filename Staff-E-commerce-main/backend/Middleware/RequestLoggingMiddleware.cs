using backend.Services;
using backend.Models;
using backend.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using System;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Collections.Generic;

namespace backend.Middlewares
{
    public class RequestLoggingMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly IServiceProvider _serviceProvider;
        private const int MaxPayloadLength = 1000; // giới hạn ký tự payload

        public RequestLoggingMiddleware(RequestDelegate next, IServiceProvider serviceProvider)
        {
            _next = next;
            _serviceProvider = serviceProvider;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            try
            {
                var request = context.Request;
                string method = request.Method.ToUpper();

                if (method == "POST" || method == "PUT" || method == "DELETE")
                {
                    string bodyText = "[Empty Body]";
                    if (request.ContentLength > 0)
                    {
                        try
                        {
                            request.EnableBuffering();
                            using var reader = new StreamReader(request.Body, Encoding.UTF8, leaveOpen: true);
                            bodyText = await reader.ReadToEndAsync();
                            request.Body.Position = 0;
                        }
                        catch
                        {
                            bodyText = "[Unreadable Body]";
                        }
                    }

                    string path = request.Path.ToString();
                    string entityName = NormalizeEntityName(ExtractEntityName(path));
                    string entityId = ExtractEntityId(path);
                    string action = method switch
                    {
                        "POST" => $"CREATE_{entityName}",
                        "PUT" => $"UPDATE_{entityName}",
                        "DELETE" => $"DELETE_{entityName}",
                        _ => $"HTTP_{method}_{entityName}"
                    };

                    string ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                    int? userId = GetUserId(context);
                    string userName = context.User?.Identity?.Name ?? "anonymous";

                    // Serialize và lọc payload
                    var sensitiveEndpoint = path.StartsWith("/api/auth/", StringComparison.OrdinalIgnoreCase) ||
                        path.Equals("/api/me/change-password", StringComparison.OrdinalIgnoreCase) ||
                        path.Equals("/api/storefront/login", StringComparison.OrdinalIgnoreCase) ||
                        path.Equals("/api/storefront/register", StringComparison.OrdinalIgnoreCase);
                    string payload = sensitiveEndpoint ? "[Authentication payload omitted]" : PreparePayload(bodyText);

                    Console.WriteLine($"[RequestLoggingMiddleware] Logging {action} for {entityName}#{entityId}");

                    // Ghi log vào DB
                    try
                    {
                        using var scope = _serviceProvider.CreateScope();
                        var logService = scope.ServiceProvider.GetRequiredService<ActivityLogService>();
                        await logService.LogAsync(
                            userId,
                            action ?? "UnknownAction",
                            entityName ?? "UnknownEntity",
                            entityId ?? "0",
                            payload ?? "{}",
                            ip ?? "unknown"
                        );
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[RequestLoggingMiddleware] LogAsync failed: {ex}");
                    }

                    // 🔹 Ghi log ra file
                    try
                    {
                        var logLine = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} | User:{userName} | Action:{action} | Entity:{entityName}#{entityId} | IP:{ip} | Payload:{payload}";
                        await File.AppendAllTextAsync("request_log.txt", logLine + Environment.NewLine);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[RequestLoggingMiddleware] File log failed: {ex}");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[RequestLoggingMiddleware] Unexpected error: {ex}");
            }

            await _next(context);
        }

        #region Helper Methods

        private string NormalizeEntityName(string entityName)
        {
            return entityName switch
            {
                "Inventoryadjustment" => "Inventory_Adjustment",
                _ => entityName
            };
        }

        private string ExtractEntityName(string path)
        {
            try
            {
                var match = Regex.Match(path, @"^/api/([^/]+)");
                if (!match.Success || string.IsNullOrEmpty(match.Groups[1].Value))
                    return "Unknown";
                string name = match.Groups[1].Value;
                return char.ToUpper(name[0]) + (name.Length > 1 ? name.Substring(1).ToLower() : "");
            }
            catch
            {
                return "Unknown";
            }
        }

        private string ExtractEntityId(string path)
        {
            try
            {
                var match = Regex.Match(path, @"^/api/[^/]+/([^/?]+)");
                return match.Success && !string.IsNullOrEmpty(match.Groups[1].Value) ? match.Groups[1].Value : "0";
            }
            catch
            {
                return "0";
            }
        }

        // private int? GetUserId(HttpContext context)
        // {
        //     if (context.User.Identity != null && context.User.Identity.IsAuthenticated)
        //     {
        //         // Lấy claim uid từ token
        //         var claim = context.User.FindFirst("uid") 
        //                     ?? context.User.FindFirst("userId") 
        //                     ?? context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);

        //         if (claim != null && int.TryParse(claim.Value, out int id))
        //             return id;
        //     }
        //     return null; 
        // }
        private int? GetUserId(HttpContext context)
        {
            try
            {
                // 1. Nếu token hợp lệ: context.User đã được gán claims
                var uidClaim = context.User.FindFirst("uid");
                if (uidClaim != null && int.TryParse(uidClaim.Value, out int jwtUserId))
                    return jwtUserId;

            }
            catch {}

            return null;
        }



        private string PreparePayload(string text)
        {
            string json = FilterSensitiveFields(text);

            // Giới hạn độ dài
            if (json.Length > MaxPayloadLength)
                json = json.Substring(0, MaxPayloadLength) + "...[truncated]";

            return json;
        }

        private object TryParseJson(string text)
        {
            try
            {
                return System.Text.Json.JsonSerializer.Deserialize<object>(text) ?? new { raw = text };
            }
            catch
            {
                return new { raw = text };
            }
        }

        private string FilterSensitiveFields(string json)
        {
            if (string.IsNullOrEmpty(json)) return json;
            try
            {
                var node = System.Text.Json.Nodes.JsonNode.Parse(json);
                Redact(node);
                return node?.ToJsonString() ?? "null";
            }
            catch (JsonException) { return "[Payload omitted: not JSON]"; }
        }

        private static void Redact(System.Text.Json.Nodes.JsonNode? node)
        {
            if (node is System.Text.Json.Nodes.JsonObject obj)
            {
                foreach (var key in obj.Select(pair => pair.Key).ToArray())
                {
                    var normalized = key.Replace("_", "").Replace("-", "").ToLowerInvariant();
                    if (normalized.Contains("password") || normalized.Contains("token") || normalized.Contains("secret") ||
                        normalized.Contains("creditcard") || normalized is "authorization" or "apikey")
                        obj[key] = "[REDACTED]";
                    else Redact(obj[key]);
                }
            }
            else if (node is System.Text.Json.Nodes.JsonArray array)
                foreach (var child in array) Redact(child);
        }

        #endregion
    }
}
