using System.Diagnostics;

namespace backend.Services;

/// <summary>
/// Thread-safe process cache used by BUS classes. The cache is intentionally bounded by TTL.
/// </summary>
public sealed class BusMemoryCache<T>
{
    private readonly object _sync = new();
    private readonly SemaphoreSlim _loadGate = new(1, 1);
    private List<T>? _items;
    private DateTimeOffset _lastFetchTime;
    private readonly ILogger<BusMemoryCache<T>> _logger;

    public BusMemoryCache(ILogger<BusMemoryCache<T>> logger)
    {
        _logger = logger;
    }

    public async Task<(IReadOnlyList<T> Items, bool LoadedFromDatabase)> GetOrCreateAsync(
        Func<Task<List<T>>> factory,
        TimeSpan ttl)
    {
        var stopwatch = Stopwatch.StartNew();
        var beforeMemory = GC.GetTotalMemory(false);
        if (TryGetFresh(ttl, out var cached))
        {
            LogMeasurement("RAM Cache", stopwatch, beforeMemory);
            return (cached, false);
        }

        await _loadGate.WaitAsync();
        try
        {
            if (TryGetFresh(ttl, out cached))
            {
                LogMeasurement("RAM Cache", stopwatch, beforeMemory);
                return (cached, false);
            }

            var loaded = await factory();
            lock (_sync)
            {
                _items = loaded;
                _lastFetchTime = DateTimeOffset.UtcNow;
                LogMeasurement("Database", stopwatch, beforeMemory);
                return (_items, true);
            }
        }
        finally
        {
            _loadGate.Release();
        }
    }

    private void LogMeasurement(string source, Stopwatch stopwatch, long beforeMemory)
    {
        stopwatch.Stop();
        var memoryMb = Math.Max(0, GC.GetTotalMemory(false) - beforeMemory) / 1024d / 1024d;
        _logger.LogInformation(
            "[BUS Cache] Type: {CacheType} | Nguồn: {Source} | Thời gian: {ElapsedMs} ms | Bộ nhớ: {MemoryMb:F3} MB",
            typeof(T).Name,
            source,
            stopwatch.Elapsed.TotalMilliseconds,
            memoryMb);
    }

    private bool TryGetFresh(TimeSpan ttl, out IReadOnlyList<T> items)
    {
        lock (_sync)
        {
            if (_items is not null && DateTimeOffset.UtcNow - _lastFetchTime <= ttl)
            {
                items = _items;
                return true;
            }
        }

        items = Array.Empty<T>();
        return false;
    }

    public void Replace(IEnumerable<T> items)
    {
        lock (_sync)
        {
            _items = items.ToList();
            _lastFetchTime = DateTimeOffset.UtcNow;
        }
    }

    public void Clear()
    {
        lock (_sync)
        {
            _items = null;
            _lastFetchTime = default;
        }
    }

    public void AddOrUpdate(T item, Func<T, object> keySelector)
    {
        lock (_sync)
        {
            if (_items is null)
                return;

            var items = _items.ToList();
            var key = keySelector(item);
            var index = items.FindIndex(existing => Equals(keySelector(existing), key));
            if (index >= 0)
                items[index] = item;
            else
                items.Add(item);

            _items = items;
            _lastFetchTime = DateTimeOffset.UtcNow;
        }
    }

    public bool RemoveWhere(Func<T, bool> predicate)
    {
        lock (_sync)
        {
            if (_items is null) return false;
            var removed = _items.RemoveAll(item => predicate(item)) > 0;
            if (removed)
                _lastFetchTime = DateTimeOffset.UtcNow;
            return removed;
        }
    }

    public void UpdateWhere(Func<T, bool> predicate, Func<T, T> updater)
    {
        lock (_sync)
        {
            if (_items is null) return;

            var changed = false;
            for (var index = 0; index < _items.Count; index++)
            {
                if (!predicate(_items[index])) continue;
                _items[index] = updater(_items[index]);
                changed = true;
            }

            if (changed)
                _lastFetchTime = DateTimeOffset.UtcNow;
        }
    }
}
