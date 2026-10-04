using System;
using System.Linq;
using backend.Models;
using backend.DTO;
using backend.Data;
using backend.Repository;
using Microsoft.EntityFrameworkCore;
using System.Data;

namespace backend.Services
{
    public class InventoryService
    {
        private readonly InventoryRepository _inventoryRepo;
        private readonly AppDbContext _context;

        public InventoryService(InventoryRepository inventoryRepo, AppDbContext context)
        {
            _inventoryRepo = inventoryRepo;
            _context = context;
        }

        public async Task<bool> ReduceInventoryAsync(List<ReduceInventoryDto> items)
        {
            if (items == null || items.Count == 0)
                throw new ArgumentException("Danh sách sản phẩm không được để trống.");

            var requestedQuantities = items
                .GroupBy(item => item.ProductId)
                .Select(group => new { ProductId = group.Key, Quantity = group.Sum(item => item.Quantity) })
                .ToList();

            if (requestedQuantities.Any(item => item.ProductId <= 0 || item.Quantity <= 0))
                throw new ArgumentException("Sản phẩm và số lượng phải hợp lệ.");

            await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);
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

        public async Task<PaginationResult<InventoryListDTO>> GetPaginatedInventoryAsync(
            int page = 1,
            int pageSize = 10,
            string? search = null,
            string? sortBy = "",
            string? stockStatus = null)
        {
            var result = await _inventoryRepo.GetPaginatedAsync(page, pageSize, search, sortBy, stockStatus);

            var dtoItems = result.Items.Select(i => new InventoryListDTO
            {
                Id = i.Id,
                ProductId = i.ProductId,
                ProductName = i.Product?.ProductName ?? "",
                Sku = i.Product?.Sku,
                ImageUrl = i.Product?.ImageUrl,
                Quantity = i.Quantity,
                LastCheckedAt = i.LastCheckedAt,
                UpdatedAt = i.UpdatedAt,
                CategoryName = i.Product?.Category?.Name,
                Price = i.Product?.Price,
                Unit = i.Product?.Unit?.Name ?? i.Product?.Unit?.Code ?? "—"
            }).ToList();

            return new PaginationResult<InventoryListDTO>
            {
                Items = dtoItems,
                TotalItems = result.TotalItems,
                CurrentPage = result.CurrentPage,
                PageSize = result.PageSize,
                TotalPages = result.TotalPages,
                HasPrevious = result.HasPrevious,
                HasNext = result.HasNext
            };
        }

        public async Task<InventoryListDTO> AdjustInventoryAsync(AdjustInventoryDTO dto)
        {
            var inventory = await _inventoryRepo.GetByIdAsync(dto.InventoryId);
            if (inventory == null)
                throw new ArgumentException($"Không tìm thấy inventory với ID {dto.InventoryId}");

            inventory.Quantity = dto.NewQuantity;
            inventory.UpdatedAt = DateTime.UtcNow;
            inventory.LastCheckedAt = DateTime.UtcNow;

            await _inventoryRepo.UpdateAsync(inventory);

            return new InventoryListDTO
            {
                Id = inventory.Id,
                ProductId = inventory.ProductId,
                ProductName = inventory.Product?.ProductName ?? "",
                Sku = inventory.Product?.Sku,
                ImageUrl = inventory.Product?.ImageUrl,
                Quantity = inventory.Quantity,
                LastCheckedAt = inventory.LastCheckedAt,
                UpdatedAt = inventory.UpdatedAt,
                CategoryName = inventory.Product?.Category?.Name,
                Price = inventory.Product?.Price,
                Unit = inventory.Product?.Unit?.Name ?? inventory.Product?.Unit?.Code ?? "—"
            };
        }

        public async Task<InventoryStatsDTO> GetInventoryStatsAsync()
        {
            var allCount = await _inventoryRepo.GetPaginatedAsync(1, 1, null, "", null);
            var outOfStockCount = await _inventoryRepo.GetPaginatedAsync(1, 1, null, "", "out_of_stock");
            var lowStockCount = await _inventoryRepo.GetPaginatedAsync(1, 1, null, "", "low_stock");
            var inStockCount = await _inventoryRepo.GetPaginatedAsync(1, 1, null, "", "in_stock");

            return new InventoryStatsDTO
            {
                Total = allCount.TotalItems,
                OutOfStock = outOfStockCount.TotalItems,
                LowStock = lowStockCount.TotalItems,
                InStock = inStockCount.TotalItems
            };
        }
    }
}
