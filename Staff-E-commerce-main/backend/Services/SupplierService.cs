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

        public SupplierService(SupplierRepository repo)
        {
            _repo = repo;
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
            var items = await _repo.GetAllAsync();
            return items.Select(MapToDto).ToList();
        }

        public async Task<SupplierDTO?> GetByIdAsync(int id)
        {
            var s = await _repo.GetByIdAsync(id);
            return s == null ? null : MapToDto(s);
        }

        public async Task<PaginationResult<SupplierDTO>> GetPaginatedAsync(int page, int pageSize, string? search)
        {
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 12;

            var (items, total) = await _repo.GetPaginatedAsync(page, pageSize, search);
            var dtoItems = items.Select(MapToDto).ToList();

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
            return MapToDto(created);
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
            return MapToDto(updated);
        }

        public async Task<bool> DeleteSupplierAsync(int id)
        {
            return await _repo.DeleteAsync(id);
        }
    }
}
