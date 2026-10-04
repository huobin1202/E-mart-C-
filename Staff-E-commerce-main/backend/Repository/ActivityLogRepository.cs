using backend.Data;
using backend.DTO;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Repository
{
    public class ActivityLogRepository
    {
        private readonly AppDbContext _context;

        public ActivityLogRepository(AppDbContext context)
        {
            _context = context;
        }

        // 1️⃣ Ghi một dòng log mới
        public async Task AddLogAsync(ActivityLog log)
        {
            _context.ActivityLogs.Add(log);
            await _context.SaveChangesAsync();
        }

        // 2️⃣ Lấy danh sách log (phân trang)
        public async Task<(List<ActivityLogCreateDTO> Logs, int TotalCount)> GetPagedLogsAsync(int pageNumber, int pageSize)
        {
            var query = _context.ActivityLogs
                .OrderByDescending(l => l.CreatedAt)
                .AsQueryable();

            int totalCount = await query.CountAsync();

            var logs = await query
                .Skip((pageNumber - 1) * pageSize)
                .Take(pageSize)
                .Select(l => new ActivityLogCreateDTO
                {
                    UserId = l.UserId ?? 0,
                    Username = l.User != null ? l.User.FullName : "Unknown",
                    Action = l.Action,
                    EntityType = l.EntityType,
                    EntityId = l.EntityId,
                    Payload = l.Payload,
                    IpAddress = l.IpAddress,
                    CreatedAt = l.CreatedAt
                })
                .ToListAsync();

            return (logs, totalCount);
        }

        // 3️⃣ Hàm lọc có phân trang + join user
        public async Task<(List<ActivityLogCreateDTO> Logs, int TotalCount)> GetFilteredLogsAsync(
            int pageNumber,
            int pageSize,
            int? userId = null,
            DateTime? startDate = null,
            DateTime? endDate = null)
        {
            var query = _context.ActivityLogs.AsQueryable();

            if (userId.HasValue)
                query = query.Where(l => l.UserId == userId);

            if (startDate.HasValue)
                query = query.Where(l => l.CreatedAt >= startDate.Value);

            if (endDate.HasValue)
                query = query.Where(l => l.CreatedAt <= endDate.Value);

            int totalCount = await query.CountAsync();

            var logs = await query
                .OrderByDescending(l => l.CreatedAt)
                .Skip((pageNumber - 1) * pageSize)
                .Take(pageSize)
                .Select(l => new ActivityLogCreateDTO
                {
                    UserId = l.UserId ?? 0,
                    Username = l.User != null ? l.User.FullName : "Unknown",
                    Action = l.Action,
                    EntityType = l.EntityType,
                    EntityId = l.EntityId,
                    Payload = l.Payload,
                    IpAddress = l.IpAddress,
                    CreatedAt = l.CreatedAt
                })
                .ToListAsync();

            return (logs, totalCount);
        }
    }
}
