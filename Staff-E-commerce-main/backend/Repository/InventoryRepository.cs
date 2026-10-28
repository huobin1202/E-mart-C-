using System.Data;
using backend.Data;
using backend.DTO;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Repository;

/// <summary>
/// Compatibility repository for the existing inventory API. Stock is stored on
/// products.stock_quantity; inventory_adjustments remains the audit trail.
/// </summary>
public sealed class InventoryRepository
{
    private readonly AppDbContext _context;

    public InventoryRepository(AppDbContext context) => _context = context;

    public Task<Product?> GetByProductIdAsync(int productId) => GetByIdAsync(productId);

    public Task<Product?> GetByIdAsync(int id) => _context.Products
        .Include(product => product.Category)
        .Include(product => product.Unit)
        .FirstOrDefaultAsync(product => product.Id == id);

    public async Task UpdateAsync(Product product)
    {
        product.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
    }

    public async Task<bool> ReduceInventoryAsync(List<(int ProductId, int Quantity)> requestedQuantities)
    {
        await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var productIds = requestedQuantities.Select(item => item.ProductId).ToList();
        var products = await _context.Products
            .Where(product => productIds.Contains(product.Id))
            .ToDictionaryAsync(product => product.Id);

        foreach (var requested in requestedQuantities)
        {
            if (!products.TryGetValue(requested.ProductId, out var product))
                throw new ArgumentException($"Không tìm thấy sản phẩm ID {requested.ProductId}.");
            if (product.StockQuantity < requested.Quantity)
                throw new InvalidOperationException($"Sản phẩm ID {requested.ProductId} không đủ tồn kho.");

            product.StockQuantity -= requested.Quantity;
            product.UpdatedAt = DateTime.UtcNow;
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

    public Task<List<InventoryAdjustmentDTO>> GetAdjustmentHistoryAsync() => _context.InventoryAdjustments
        .AsNoTracking()
        .Include(adjustment => adjustment.Product)
        .Include(adjustment => adjustment.User)
        .OrderByDescending(adjustment => adjustment.CreatedAt)
        .ThenByDescending(adjustment => adjustment.Id)
        .Select(adjustment => new InventoryAdjustmentDTO
        {
            Id = adjustment.Id,
            ProductId = adjustment.ProductId,
            ProductName = adjustment.Product != null ? adjustment.Product.ProductName : string.Empty,
            Sku = adjustment.Product != null ? adjustment.Product.Sku : null,
            ChangeAmount = adjustment.ChangeAmount,
            Reason = adjustment.Reason,
            UserId = adjustment.UserId,
            UserName = adjustment.User != null ? adjustment.User.FullName : null,
            CreatedAt = adjustment.CreatedAt
        })
        .ToListAsync();

    public Task<List<Product>> GetAllForCacheAsync() => _context.Products
        .AsNoTracking()
        .Include(product => product.Category)
        .Include(product => product.Unit)
        .OrderBy(product => product.Id)
        .ToListAsync();
}
