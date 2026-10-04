using System.Linq;
using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;


namespace backend.Repository
{
    public class InventoryRepository
    {
        private readonly AppDbContext _context;

        public InventoryRepository(AppDbContext context)
        {
            _context = context;
        }

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

        // Lấy danh sách inventory với phân trang và tìm kiếm
        public async Task<PaginationResult<Inventory>> GetPaginatedAsync(
            int page = 1,
            int pageSize = 10,
            string? search = null,
            string? sortBy = "",
            string? stockStatus = null)
        {
            if (page < 1) page = 1;
            if (pageSize <= 0) pageSize = 10;

            IQueryable<Inventory> query = _context.Inventory
                .AsQueryable()
                .Include(i => i.Product)
                    .ThenInclude(p => p!.Category)
                .Include(i => i.Product)
                    .ThenInclude(p => p!.Unit);

            // Tìm kiếm theo tên sản phẩm, SKU
            if (!string.IsNullOrWhiteSpace(search))
            {
                var s = search.Trim();
                query = query.Where(i =>
                    (i.Product != null && i.Product.ProductName.Contains(s)) ||
                    (i.Product != null && i.Product.Sku != null && i.Product.Sku.Contains(s))
                );
            }

            // Filter theo trạng thái tồn kho
            if (!string.IsNullOrWhiteSpace(stockStatus))
            {
                switch (stockStatus.ToLower())
                {
                    case "out_of_stock":
                        query = query.Where(i => i.Quantity == 0);
                        break;
                    case "low_stock":
                        query = query.Where(i => i.Quantity > 0 && i.Quantity < 10);
                        break;
                    case "in_stock":
                        query = query.Where(i => i.Quantity >= 10);
                        break;
                }
            }

            // Sắp xếp (sắp xếp toàn bộ dữ liệu trước khi phân trang)
            query = (sortBy ?? "id").ToLower() switch
            {
                "quantity_asc" => query.OrderBy(i => i.Quantity),
                "quantity_desc" => query.OrderByDescending(i => i.Quantity),
                "product_name_asc" => query.OrderBy(i => i.Product != null ? i.Product.ProductName : ""),
                "product_name_desc" => query.OrderByDescending(i => i.Product != null ? i.Product.ProductName : ""),
                "price_asc" => query.OrderBy(i => i.Product != null ? i.Product.Price : 0),
                "price_desc" => query.OrderByDescending(i => i.Product != null ? i.Product.Price : 0),
                "updated_at_asc" => query.OrderBy(i => i.UpdatedAt),
                "updated_at_desc" => query.OrderByDescending(i => i.UpdatedAt),
                "id" => query.OrderBy(i => i.Id),
                "id_desc" => query.OrderByDescending(i => i.Id),
                _ => query.OrderBy(i => i.Id)
            };

            var totalItems = await query.CountAsync();
            var totalPages = (int)Math.Ceiling((double)totalItems / pageSize);

            var items = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .AsNoTracking()
                .ToListAsync();

            return new PaginationResult<Inventory>
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

    }

}
