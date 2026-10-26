using System.Data;
using backend.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace backend.Repository;

// All channels acquire the same lock before reading balances, stock or promotion limits.
public static class SalesTransaction
{
    public static async Task<IDbContextTransaction> BeginAsync(AppDbContext db)
    {
        var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        try { await LockAsync(db); return transaction; }
        catch { await transaction.DisposeAsync(); throw; }
    }

    public static Task LockAsync(AppDbContext db) => db.Database.ExecuteSqlRawAsync("""
        DECLARE @result INT;
        EXEC @result = sys.sp_getapplock @Resource = 'sales-lifecycle', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000;
        IF @result < 0 THROW 51000, 'Sales are busy. Please retry.', 1;
        """);
}
