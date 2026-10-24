using backend.Data;
using Microsoft.EntityFrameworkCore.Storage;

namespace backend.Repository;

public sealed class ImportRepository(AppDbContext context)
{
    public Task<IDbContextTransaction> BeginTransactionAsync() => context.Database.BeginTransactionAsync();
}
