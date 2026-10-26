using backend.Models;
using backend.DTO;
using backend.Repository;

namespace backend.Services
{
    public class UnitService
    {
        private readonly UnitRepository _unitRepo;
        private readonly BusMemoryCache<UnitDTO> _cache;
        private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(15);

        public UnitService(UnitRepository unitRepo, BusMemoryCache<UnitDTO> cache)
        {
            _unitRepo = unitRepo;
            _cache = cache;
        }

        public async Task<List<UnitDTO>> GetAllUnitsAsync(bool? isActive = null)
        {
            var (items, _) = await _cache.GetOrCreateAsync(async () =>
            {
                var units = await _unitRepo.GetAllAsync();
                var productCounts = await _unitRepo.GetProductCountByUnitAsync();
                return units.Select(u => Map(u, productCounts.GetValueOrDefault(u.Id, 0))).ToList();
            }, CacheTtl);

            return isActive.HasValue
                ? items.Where(u => u.IsActive == isActive.Value).ToList()
                : items.ToList();
        }

        public async Task<UnitDTO?> GetUnitByIdAsync(int id)
        {
            return (await GetAllUnitsAsync()).FirstOrDefault(u => u.Id == id);
        }

        public async Task<UnitDTO> CreateUnitAsync(UnitDTO dto)
        {
            // Validate
            if (string.IsNullOrWhiteSpace(dto.Code))
                throw new ArgumentException("Code is required");

            if (string.IsNullOrWhiteSpace(dto.Name))
                throw new ArgumentException("Name is required");

            // Check duplicate
            var existing = await _unitRepo.GetByCodeAsync(dto.Code);
            if (existing != null)
                throw new InvalidOperationException("Unit code already exists");

            var unit = new Unit
            {
                Code = dto.Code,
                Name = dto.Name,
                IsActive = dto.IsActive
            };

            var created = await _unitRepo.CreateAsync(unit);

            var result = Map(created, 0);
            _cache.AddOrUpdate(result, unit => unit.Id);
            return result;
        }

        public async Task<UnitDTO?> UpdateUnitAsync(int id, UnitDTO dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Code))
                throw new ArgumentException("Code is required");

            if (string.IsNullOrWhiteSpace(dto.Name))
                throw new ArgumentException("Name is required");

            // Check duplicate (exclude current)
            var existingByCode = await _unitRepo.GetByCodeAsync(dto.Code);
            if (existingByCode != null && existingByCode.Id != id)
                throw new InvalidOperationException("Unit code already exists");

            var unit = new Unit
            {
                Code = dto.Code,
                Name = dto.Name,
                IsActive = dto.IsActive
            };

            var updated = await _unitRepo.UpdateAsync(id, unit);
            if (updated == null) return null;

            var result = Map(updated, (await GetAllUnitsAsync()).FirstOrDefault(x => x.Id == id)?.ProductCount ?? 0);
            _cache.AddOrUpdate(result, unit => unit.Id);
            return result;
        }

        public async Task<bool> DeleteUnitAsync(int id)
        {
            var deleted = await _unitRepo.DeleteAsync(id);
            if (deleted) _cache.RemoveWhere(unit => unit.Id == id);
            return deleted;
        }

        public async Task<UnitDTO?> ToggleActiveAsync(int id)
        {
            var unit = await _unitRepo.GetByIdAsync(id);
            if (unit == null) return null;
            unit.IsActive = !unit.IsActive;
            unit.UpdatedAt = DateTime.UtcNow;
            var updated = await _unitRepo.UpdateAsync(id, unit);
            if (updated == null) return null;
            var result = Map(updated, (await GetAllUnitsAsync()).FirstOrDefault(x => x.Id == id)?.ProductCount ?? 0);
            _cache.AddOrUpdate(result, item => item.Id);
            return result;
        }

        internal static UnitDTO Map(Unit unit, int productCount) => new()
        {
            Id = unit.Id,
            Code = unit.Code,
            Name = unit.Name,
            IsActive = unit.IsActive,
            CreatedAt = unit.CreatedAt,
            UpdatedAt = unit.UpdatedAt,
            ProductCount = productCount
        };
    }
}
