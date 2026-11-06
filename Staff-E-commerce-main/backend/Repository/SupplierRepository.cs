using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using backend.Data;
using backend.Models;
using backend.DTO;
using Microsoft.EntityFrameworkCore;

namespace backend.Repository
{
    public class SupplierRepository
    {
        private readonly AppDbContext _context;

        public SupplierRepository(AppDbContext context)
        {
            _context = context;
        }

        public async Task<List<Supplier>> GetAllAsync()
        {
            return await _context.Suppliers
                .OrderBy(s => s.Id)
                .ToListAsync();
        }

        public Task<List<SupplierDTO>> GetAllWithStatisticsAsync()
        {
            return _context.Suppliers.AsNoTracking()
                .OrderBy(s => s.Id)
                .Select(s => new SupplierDTO
                {
                    Id = s.Id,
                    Name = s.Name,
                    ContactName = s.ContactName,
                    Phone = s.Phone,
                    Email = s.Email,
                    Address = s.Address,
                    Region = s.Region,
                    IsActive = s.IsActive,
                    CreatedAt = s.CreatedAt,
                    UpdatedAt = s.UpdatedAt,
                    // Đếm toàn bộ SKU gắn với nhà cung cấp, kể cả sản phẩm đang ngừng bán.
                    ProductCount = _context.Products.Count(p => p.SupplierId == s.Id),
                    // Chi tiết phiếu nhập là nguồn chuẩn; dữ liệu cũ có thể lệch total_amount ở phần đầu phiếu.
                    TotalImportedValue = _context.PurchaseOrderDetails
                        .Where(item => item.PurchaseOrder != null &&
                                       item.PurchaseOrder.SupplierId == s.Id &&
                                       item.PurchaseOrder.Status == "completed")
                        .Sum(item => (decimal?)(item.Quantity * item.ImportPrice)) ?? 0m
                }).ToListAsync();
        }

        public async Task<Supplier?> GetByIdAsync(int id)
        {
            return await _context.Suppliers.FindAsync(id);
        }

        public async Task<Supplier> CreateAsync(Supplier supplier)
        {
            _context.Suppliers.Add(supplier);
            await _context.SaveChangesAsync();
            return supplier;
        }

        public async Task<Supplier> UpdateAsync(Supplier supplier)
        {
            _context.Suppliers.Update(supplier);
            await _context.SaveChangesAsync();
            return supplier;
        }

        public async Task<bool> DeleteAsync(int id)
        {
            var entity = await _context.Suppliers.FindAsync(id);
            if (entity == null) return false;

            entity.IsActive = false;
            entity.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            return true;
        }

        public async Task<bool> ExistsByNameAsync(string name, int? excludeId = null)
        {
            var q = _context.Suppliers.AsQueryable().Where(s => s.Name == name);
            if (excludeId.HasValue) q = q.Where(s => s.Id != excludeId.Value);
            return await q.AnyAsync();
        }
    }
}
