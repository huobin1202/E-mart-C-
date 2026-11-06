using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using backend.DTO;
using backend.Helpers;
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
                SupplierCode = $"NCC-{s.Id:D3}",
                Name = s.Name,
                ContactName = s.ContactName,
                Phone = s.Phone,
                Email = s.Email,
                Address = s.Address,
                Region = s.Region,
                IsActive = s.IsActive,
                CreatedAt = s.CreatedAt,
                UpdatedAt = s.UpdatedAt
            };
        }

        public async Task<List<SupplierDTO>> GetAllAsync()
        {
            var (items, _) = await _cache.GetOrCreateAsync(
                async () => (await _repo.GetAllWithStatisticsAsync()).Select(PrepareDto).ToList(), CacheTtl);
            return items.ToList();
        }

        private static SupplierDTO PrepareDto(SupplierDTO supplier)
        {
            supplier.SupplierCode = $"NCC-{supplier.Id:D3}";
            return supplier;
        }

        public async Task<SupplierDTO?> GetByIdAsync(int id)
        {
            return (await GetAllAsync()).FirstOrDefault(s => s.Id == id);
        }

        public async Task<PaginationResult<SupplierDTO>> GetPaginatedAsync(int page, int pageSize, string? search, string? region = null)
        {
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 12;

            IEnumerable<SupplierDTO> query = await GetAllAsync();
            if (!string.IsNullOrWhiteSpace(search))
            {
                var keyword = search.Trim();
                query = query.Where(x => x.Name.Contains(keyword, StringComparison.OrdinalIgnoreCase)
                    || (x.Email?.Contains(keyword, StringComparison.OrdinalIgnoreCase) ?? false)
                    || (x.Phone?.Contains(keyword, StringComparison.OrdinalIgnoreCase) ?? false));
            }
            if (!string.IsNullOrWhiteSpace(region))
            {
                // "none" lists suppliers that have not been classified yet; anything else must be a valid region.
                var wanted = string.Equals(region.Trim(), SupplierRegion.Unclassified, StringComparison.OrdinalIgnoreCase)
                    ? null
                    : SupplierRegion.Normalize(region);
                query = query.Where(x => string.Equals(x.Region, wanted, StringComparison.Ordinal));
            }
            var filtered = query.ToList();
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

            supplier.Region = SupplierRegion.Require(supplier.Region);
            supplier.CreatedAt = DateTime.UtcNow;
            supplier.UpdatedAt = DateTime.UtcNow;

            var created = await _repo.CreateAsync(supplier);
            var result = MapToDto(created);
            _cache.Clear();
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
            existing.Region = SupplierRegion.Require(supplier.Region);
            existing.IsActive = supplier.IsActive;
            existing.UpdatedAt = DateTime.UtcNow;

            var updated = await _repo.UpdateAsync(existing);
            var result = MapToDto(updated);
            _cache.Clear();
            return result;
        }

        public async Task<bool> DeleteSupplierAsync(int id)
        {
            var deleted = await _repo.DeleteAsync(id);
            if (deleted) _cache.Clear();
            return deleted;
        }
    }
}
