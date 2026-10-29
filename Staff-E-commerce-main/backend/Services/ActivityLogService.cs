using backend.Models;
using backend.DTO;
using backend.Repository;
using Microsoft.Extensions.Configuration;
using System.Text;

namespace backend.Services
{
    public class ActivityLogService
    {
        private readonly ActivityLogRepository _logRepo;
        private readonly IConfiguration _config;
        private readonly string _projectRootLogs; // Đường dẫn tuyệt đối đến backend/Logs

        public ActivityLogService(ActivityLogRepository logRepo, IConfiguration config)
        {
            _logRepo = logRepo;
            _config = config;

            // Tính đường dẫn gốc dự án (lên 3 cấp từ bin/Debug/net8.0)
            string binDir = AppContext.BaseDirectory;
            _projectRootLogs = Path.GetFullPath(Path.Combine(binDir, "..", "..", "..", "Logs"));

            // Tạo thư mục Logs ở gốc dự án
            if (!Directory.Exists(_projectRootLogs))
            {
                Directory.CreateDirectory(_projectRootLogs);
                Console.WriteLine($"[ActivityLogService] Created root log directory: {_projectRootLogs}");
            }
        }

        public async Task LogAsync(
            int? userId,
            string action,
            string entityType,
            string entityId,
            string? payload,
            string ipAddress)
        {
            // 1. Ghi vào database
            var log = new ActivityLog
            {
                UserId = userId,
                Action = action,
                EntityType = entityType,
                EntityId = entityId,
                Payload = payload,
                IpAddress = ipAddress,
                CreatedAt = DateTime.UtcNow
            };
            await _logRepo.AddLogAsync(log);

            // 2. Lấy tên file từ config (ví dụ: "Logs/product_log.log")
            string relativePath = _config[$"LogFiles:{entityType}"];
            if (string.IsNullOrEmpty(relativePath))
                relativePath = _config["LogFiles:Default"] ?? "Logs/activity_log.log";

            // 3. Tạo đường dẫn tuyệt đối từ gốc dự án
            string logPath = Path.Combine(_projectRootLogs, Path.GetFileName(relativePath));
            string logDir = Path.GetDirectoryName(logPath)!;

            if (!Directory.Exists(logDir))
            {
                Directory.CreateDirectory(logDir);
                Console.WriteLine($"[ActivityLogService] Created log directory: {logDir}");
            }

            // 4. Ghi log
            string logLine = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [User:{userId}] [Action:{action}] [Entity:{entityType}#{entityId}] [IP:{ipAddress}] {payload}";
            await File.AppendAllTextAsync(logPath, logLine + Environment.NewLine, Encoding.UTF8);

            // In đường dẫn tuyệt đối để debug
            Console.WriteLine($"[ActivityLogService] Logged to: {Path.GetFullPath(logPath)}");

            // 5. Xoay log
            CleanUpOldLogs(logPath);
        }

        private void CleanUpOldLogs(string logPath)
        {
            try
            {
                var fileInfo = new FileInfo(logPath);
                if (!fileInfo.Exists) return;

                const long MaxSize = 5 * 1024 * 1024; // 5 MB
                var maxAge = TimeSpan.FromDays(7);

                bool tooOld = DateTime.Now - fileInfo.LastWriteTime > maxAge;
                bool tooBig = fileInfo.Length > MaxSize;

                if (tooOld || tooBig)
                {
                    string archiveDir = Path.Combine(fileInfo.DirectoryName!, "Archive");
                    Directory.CreateDirectory(archiveDir);

                    string archiveFile = Path.Combine(
                        archiveDir,
                        $"{Path.GetFileNameWithoutExtension(fileInfo.Name)}_{DateTime.Now:yyyyMMdd_HHmmss}.txt"
                    );

                    File.Move(logPath, archiveFile, true);
                    File.WriteAllText(logPath, $"[System] Log rotated at {DateTime.Now:yyyy-MM-dd HH:mm:ss}\n");
                    Console.WriteLine($"[ActivityLogService] Log rotated → {archiveFile}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ActivityLogService] Log cleanup error: {ex.Message}");
            }
        }

        // Các method khác giữ nguyên
        public async Task<(List<ActivityLogCreateDTO> Logs, int TotalCount)> GetPagedLogsAsync(int page, int size)
            => await _logRepo.GetPagedLogsAsync(page, size);

        public async Task<(List<ActivityLogCreateDTO> Logs, int TotalCount)> GetFilteredLogsAsync(
            int page, int size, int? userId, DateTime? startDate, DateTime? endDate)
        {
            if (endDate.HasValue && !startDate.HasValue)
                throw new ArgumentException("Bạn cần chọn ngày bắt đầu nếu đã chọn ngày kết thúc.");

            if (startDate.HasValue && endDate.HasValue && startDate > endDate)
                throw new ArgumentException("Ngày bắt đầu không được lớn hơn ngày kết thúc.");

            return await _logRepo.GetFilteredLogsAsync(page, size, userId, startDate, endDate);
        }
    }
}
