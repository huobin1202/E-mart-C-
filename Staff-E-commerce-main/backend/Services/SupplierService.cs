using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using backend.DTO;
using backend.Models;
using backend.Repository;

namespace backend.Services
{
    public class SupplierService
    {
        private readonly SupplierRepository _repo;
        private readonly BusMemoryCache<SupplierDTO> _cache;
        private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(15);

        public SupplierService(SupplierRepository repo, BusMemoryCache<SupplierDTO> cache)
        {
            _repo = repo;
            _cache = cache;
        }

        private SupplierDTO MapToDto(Supplier s)
        {
            return new SupplierDTO
            {
                Id = s.Id,
                Name = s.Name,
                ContactName = s.ContactName,
                Phone = s.Phone,
                Email = s.Email,
                Address = s.Address,
                IsActive = s.IsActive,
                CreatedAt = s.CreatedAt,
                UpdatedAt = s.UpdatedAt
            };
        }

        public async Task<List<SupplierDTO>> GetAllAsync()
        {
            var (items, _) = await _cache.GetOrCreateAsync(
                async () => (await _repo.GetAllAsync()).Select(MapToDto).ToList(), CacheTtl);
            return items.ToList();
        }

        public async Task<SupplierDTO?> GetByIdAsync(int id)
        {
            return (await GetAllAsync()).FirstOrDefault(s => s.Id == id);
        }

        public async Task<PaginationResult<SupplierDTO>> GetPaginatedAsync(int page, int pageSize, string? search)
        {
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 12;

            var all = await GetAllAsync();
            var filtered = string.IsNullOrWhiteSpace(search)
                ? all
                : all.Where(x => x.Name.Contains(search.Trim(), StringComparison.OrdinalIgnoreCase)
                    || (x.Email?.Contains(search.Trim(), StringComparison.OrdinalIgnoreCase) ?? false)
                    || (x.Phone?.Contains(search.Trim(), StringComparison.OrdinalIgnoreCase) ?? false)).ToList();
            var total = filtered.Count;
            var dtoItems = filtered.Skip((page - 1) * pageSize).Take(pageSize).ToList();

            var totalPages = (int)Math.Ceiling((double)total / pageSize);

            return new PaginationResult<SupplierDTO>
            {
                Items = dtoItems,
                TotalItems = total,
                CurrentPage = page,
                PageSize = pageSize,
                TotalPages = totalPages,
                HasPrevious = page > 1,
                HasNext = page < totalPages
            };
        }

        public async Task<SupplierDTO> CreateSupplierAsync(Supplier supplier)
        {
            if (string.IsNullOrWhiteSpace(supplier.Name))
                throw new ArgumentException("Supplier name is required");

            var exists = await _repo.ExistsByNameAsync(supplier.Name);
            if (exists)
                throw new ArgumentException("Supplier name already exists");

            supplier.CreatedAt = DateTime.UtcNow;
            supplier.UpdatedAt = DateTime.UtcNow;

            var created = await _repo.CreateAsync(supplier);
            var result = MapToDto(created);
            _cache.AddOrUpdate(result, item => item.Id);
            return result;
        }

        public async Task<SupplierDTO> UpdateSupplierAsync(Supplier supplier)
        {
            var existing = await _repo.GetByIdAsync(supplier.Id);
            if (existing == null)
                throw new ArgumentException("Supplier not found");

            if (string.IsNullOrWhiteSpace(supplier.Name))
                throw new ArgumentException("Supplier name is required");

            var duplicate = await _repo.ExistsByNameAsync(supplier.Name, supplier.Id);
            if (duplicate)
                throw new ArgumentException("Supplier name already exists");

            existing.Name = supplier.Name;
            existing.ContactName = supplier.ContactName;
            existing.Phone = supplier.Phone;
            existing.Email = supplier.Email;
            existing.Address = supplier.Address;
            existing.IsActive = supplier.IsActive;
            existing.UpdatedAt = DateTime.UtcNow;

            var updated = await _repo.UpdateAsync(existing);
            var result = MapToDto(updated);
            _cache.AddOrUpdate(result, item => item.Id);
            return result;
        }

        public async Task<bool> DeleteSupplierAsync(int id)
        {
            var deleted = await _repo.DeleteAsync(id);
            if (deleted) _cache.RemoveWhere(item => item.Id == id);
            return deleted;
        }
    }
}
