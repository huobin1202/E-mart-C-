using System;
using System.Linq;
using backend.Models;
using backend.DTO;
using backend.Repository;

namespace backend.Services
{
    public class InventoryService
    {
        private readonly InventoryRepository _inventoryRepo;
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly BusMemoryCache<Inventory> _inventoryCache;
        private readonly BusMemoryCache<InventoryAdjustmentDTO> _adjustmentCache;

        public InventoryService(
            InventoryRepository inventoryRepo,
            IHttpContextAccessor httpContextAccessor,
            BusMemoryCache<Inventory> inventoryCache,
            BusMemoryCache<InventoryAdjustmentDTO> adjustmentCache)
        {
            _inventoryRepo = inventoryRepo;
            _httpContextAccessor = httpContextAccessor;
            _inventoryCache = inventoryCache;
            _adjustmentCache = adjustmentCache;
        }

        private int? TryGetCurrentUserId()
        {
            try
            {
                var context = _httpContextAccessor.HttpContext;
                if (context?.User?.Identity?.IsAuthenticated == true)
                {
                    var claim = context.User.FindFirst("uid")
                                ?? context.User.FindFirst("userId")
                                ?? context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
                    if (claim != null && int.TryParse(claim.Value, out int id))
                        return id;
                }
            }
            catch { }
            return null;
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

            await _inventoryRepo.ReduceInventoryAsync(
                requestedQuantities.Select(item => (item.ProductId, item.Quantity)).ToList());
            foreach (var requested in requestedQuantities)
            {
                _inventoryCache.UpdateWhere(
                    inventory => inventory.ProductId == requested.ProductId,
                    inventory =>
                    {
                        inventory.Quantity -= requested.Quantity;
                        inventory.UpdatedAt = DateTime.UtcNow;
                        return inventory;
                    });
            }
            return true;
        }

        public async Task<PaginationResult<InventoryListDTO>> GetPaginatedInventoryAsync(
            int page = 1,
            int pageSize = 10,
            string? search = null,
            string? sortBy = "",
            string? stockStatus = null)
        {
            var cached = await _inventoryCache.GetOrCreateAsync(
                () => _inventoryRepo.GetAllForCacheAsync(),
                TimeSpan.FromMinutes(15));
            IEnumerable<Inventory> filtered = cached.Items;

            if (!string.IsNullOrWhiteSpace(search))
            {
                var keyword = search.Trim();
                filtered = filtered.Where(i =>
                    (i.Product?.ProductName?.Contains(keyword, StringComparison.OrdinalIgnoreCase) ?? false) ||
                    (i.Product?.Sku?.Contains(keyword, StringComparison.OrdinalIgnoreCase) ?? false));
            }

            filtered = (sortBy ?? "id").ToLowerInvariant() switch
            {
                "quantity_asc" => filtered.OrderBy(i => i.Quantity),
                "quantity_desc" => filtered.OrderByDescending(i => i.Quantity),
                "product_name_asc" => filtered.OrderBy(i => i.Product?.ProductName ?? ""),
                "product_name_desc" => filtered.OrderByDescending(i => i.Product?.ProductName ?? ""),
                "price_asc" => filtered.OrderBy(i => i.Product?.Price ?? 0),
                "price_desc" => filtered.OrderByDescending(i => i.Product?.Price ?? 0),
                "updated_at_asc" => filtered.OrderBy(i => i.UpdatedAt),
                "updated_at_desc" => filtered.OrderByDescending(i => i.UpdatedAt),
                "id_desc" => filtered.OrderByDescending(i => i.Id),
                _ => filtered.OrderBy(i => i.Id)
            };

            if (!string.IsNullOrWhiteSpace(stockStatus))
            {
                filtered = (stockStatus ?? "").ToLowerInvariant() switch
                {
                    "out_of_stock" => filtered.Where(i => i.Quantity == 0),
                    "low_stock" => filtered.Where(i => i.Quantity > 0 && i.Quantity < 10),
                    "in_stock" => filtered.Where(i => i.Quantity >= 10),
                    _ => filtered
                };
            }

            var allItems = filtered.ToList();
            var totalItems = allItems.Count;
            var totalPages = (int)Math.Ceiling((double)totalItems / pageSize);
            var items = allItems.Skip((page - 1) * pageSize).Take(pageSize).ToList();
            var result = new PaginationResult<Inventory>
            {
                Items = items,
                TotalItems = totalItems,
                CurrentPage = page,
                PageSize = pageSize,
                TotalPages = totalPages,
                HasPrevious = page > 1,
                HasNext = page < totalPages
            };

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

            int oldQuantity = inventory.Quantity;
            int changeAmount = dto.NewQuantity - oldQuantity;

            inventory.Quantity = dto.NewQuantity;
            inventory.UpdatedAt = DateTime.UtcNow;
            inventory.LastCheckedAt = DateTime.UtcNow;

            await _inventoryRepo.UpdateAsync(inventory);
            _inventoryCache.AddOrUpdate(inventory, item => item.Id);

            // Ghi lịch sử điều chỉnh
            var adjustment = new InventoryAdjustment
            {
                ProductId = inventory.ProductId,
                ChangeAmount = changeAmount,
                Reason = string.IsNullOrWhiteSpace(dto.Reason) ? null : dto.Reason.Trim(),
                UserId = TryGetCurrentUserId(),
                CreatedAt = DateTime.UtcNow
            };
            await _inventoryRepo.AddAdjustmentAsync(adjustment);
            _adjustmentCache.Clear();

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

        public async Task<PaginationResult<InventoryAdjustmentDTO>> GetAdjustmentHistoryAsync(
            int page = 1,
            int pageSize = 20,
            int? productId = null,
            string? search = null)
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 20;

            var cached = await _adjustmentCache.GetOrCreateAsync(
                () => _inventoryRepo.GetAdjustmentHistoryAsync(),
                TimeSpan.FromMinutes(15));
            IEnumerable<InventoryAdjustmentDTO> query = cached.Items;

            if (productId.HasValue)
                query = query.Where(a => a.ProductId == productId.Value);

            if (!string.IsNullOrWhiteSpace(search))
            {
                var s = search.Trim();
                query = query.Where(a =>
                    a.ProductName.Contains(s, StringComparison.OrdinalIgnoreCase) ||
                    (a.Sku != null && a.Sku.Contains(s, StringComparison.OrdinalIgnoreCase)) ||
                    (a.Reason != null && a.Reason.Contains(s, StringComparison.OrdinalIgnoreCase)) ||
                    (a.UserName != null && a.UserName.Contains(s, StringComparison.OrdinalIgnoreCase)));
            }

            var ordered = query.OrderByDescending(a => a.CreatedAt).ThenByDescending(a => a.Id).ToList();
            var totalItems = ordered.Count;
            var totalPages = (int)Math.Ceiling((double)totalItems / pageSize);

            var items = ordered
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToList();

            return new PaginationResult<InventoryAdjustmentDTO>
            {
                Items = items,
                TotalItems = totalItems,
                CurrentPage = page,
                PageSize = pageSize,
                TotalPages = totalPages,
                HasPrevious = page > 1,
                HasNext = page < totalPages
            };
        }

        public async Task<InventoryStatsDTO> GetInventoryStatsAsync()
        {
            var items = (await _inventoryCache.GetOrCreateAsync(
                () => _inventoryRepo.GetAllForCacheAsync(),
                TimeSpan.FromMinutes(15))).Items;

            return new InventoryStatsDTO
            {
                Total = items.Count,
                OutOfStock = items.Count(item => item.Quantity == 0),
                LowStock = items.Count(item => item.Quantity > 0 && item.Quantity < 10),
                InStock = items.Count(item => item.Quantity >= 10)
            };
        }
    }
}
