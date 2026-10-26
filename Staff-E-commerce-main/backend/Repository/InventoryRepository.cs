using System.Linq;
using backend.Data;
using backend.Models;
using backend.DTO;
using Microsoft.EntityFrameworkCore;
using System.Data;


namespace backend.Repository
{
    public class InventoryRepository
    {
        private readonly AppDbContext _context;

        public InventoryRepository(AppDbContext context)
        {
            _context = context;
        }
        public Task<Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction> BeginSalesTransactionAsync() => SalesTransaction.BeginAsync(_context);

        public async Task<Inventory?> GetByProductIdAsync(int productId)
        {
            return await _context.Inventory
                                .Include(i => i.Product)
                                    .ThenInclude(p => p!.Unit)
                                .FirstOrDefaultAsync(i => i.ProductId == productId);
        }

        public async Task<Inventory?> GetByIdAsync(int id)
        {
            return await _context.Inventory
                                .Include(i => i.Product)
                                    .ThenInclude(p => p!.Unit)
                                .FirstOrDefaultAsync(i => i.Id == id);
        }
        //Tạo mới inventory mới khi tạo mới product
        public async Task<Inventory> CreateAsync(Inventory inventory)
        {
            inventory.UpdatedAt = DateTime.UtcNow;
            _context.Inventory.Add(inventory);
            await _context.SaveChangesAsync();
            return inventory;
        }

        public async Task UpdateAsync(Inventory inventory)
        {
            _context.Inventory.Update(inventory);
            await _context.SaveChangesAsync();
        }

        // Tùy chọn: Cập nhật nhiều inventory cùng lúc
        public async Task UpdateRangeAsync(List<Inventory> inventories)
        {
            foreach (var inv in inventories)
            {
                // Bắt buộc EF Core ghi lại Quantity và UpdatedAt
                _context.Entry(inv).Property(i => i.Quantity).IsModified = true;
                _context.Entry(inv).Property(i => i.UpdatedAt).IsModified = true;
            }
            await _context.SaveChangesAsync();
        }

        public async Task<bool> ReduceInventoryAsync(List<(int ProductId, int Quantity)> requestedQuantities)
        {
            await using var transaction = await SalesTransaction.BeginAsync(_context);
            var productIds = requestedQuantities.Select(item => item.ProductId).ToList();
            var inventories = await _context.Inventory
                .Where(inventory => productIds.Contains(inventory.ProductId))
                .ToDictionaryAsync(inventory => inventory.ProductId);

            foreach (var requested in requestedQuantities)
            {
                if (!inventories.TryGetValue(requested.ProductId, out var inventory))
                    throw new ArgumentException($"Không tìm thấy tồn kho cho sản phẩm ID {requested.ProductId}.");

                if (inventory.Quantity < requested.Quantity)
                    throw new InvalidOperationException($"Sản phẩm ID {requested.ProductId} không đủ tồn kho.");

                inventory.Quantity -= requested.Quantity;
                inventory.UpdatedAt = DateTime.UtcNow;
            }

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();
            return true;
        }

        public async Task AddAdjustmentAsync(InventoryAdjustment adjustment)
        {
            _context.InventoryAdjustments.Add(adjustment);
            await _context.SaveChangesAsync();
        }

        public async Task<List<InventoryAdjustmentDTO>> GetAdjustmentHistoryAsync()
        {
            return await _context.InventoryAdjustments
                .AsNoTracking()
                .Include(a => a.Product)
                .Include(a => a.User)
                .OrderByDescending(a => a.CreatedAt)
                .ThenByDescending(a => a.Id)
                .Select(a => new InventoryAdjustmentDTO
                {
                    Id = a.Id,
                    ProductId = a.ProductId,
                    ProductName = a.Product != null ? a.Product.ProductName : "",
                    Sku = a.Product != null ? a.Product.Sku : null,
                    ChangeAmount = a.ChangeAmount,
                    Reason = a.Reason,
                    UserId = a.UserId,
                    UserName = a.User != null ? a.User.FullName : null,
                    CreatedAt = a.CreatedAt
                })
                .ToListAsync();
        }

        public async Task<List<Inventory>> GetAllForCacheAsync()
        {
            return await _context.Inventory
                .AsNoTracking()
                .Include(i => i.Product)
                    .ThenInclude(p => p!.Category)
                .Include(i => i.Product)
                    .ThenInclude(p => p!.Unit)
                .OrderBy(i => i.Id)
                .ToListAsync();
        }

    }

}
