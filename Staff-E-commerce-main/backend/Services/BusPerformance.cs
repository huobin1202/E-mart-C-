using System.Diagnostics;

namespace backend.Services;

/// <summary>
/// Lightweight telemetry for BUS data operations. It never changes the API response.
/// </summary>
public static class BusPerformance
{
    public static async Task<T> MeasureAsync<T>(
        ILogger logger,
        string operation,
        string source,
        Func<Task<T>> action)
    {
        var stopwatch = Stopwatch.StartNew();
        var before = GC.GetTotalMemory(false);
        try
        {
            return await action();
        }
        finally
        {
            stopwatch.Stop();
            var after = GC.GetTotalMemory(false);
            var usedMb = Math.Max(0, after - before) / 1024d / 1024d;
            logger.LogDebug(
                "[Nguồn: {Source}] | Thao tác: {Operation} | Thời gian: {ElapsedMs} ms | Bộ nhớ: {MemoryMb:F3} MB",
                source,
                operation,
                stopwatch.Elapsed.TotalMilliseconds,
                usedMb);
        }
    }
}
