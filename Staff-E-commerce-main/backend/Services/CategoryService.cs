using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using backend.DTO;
using backend.Models;
using backend.Repository;

namespace backend.Services
{
    public class CategoryService
    {
        private readonly CategoryRepository _repo;
        private readonly BusMemoryCache<CategoryDTO> _cache;
        private readonly ILogger<CategoryService> _logger;
        private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(15);

        public CategoryService(
            CategoryRepository repo,
            BusMemoryCache<CategoryDTO> cache,
            ILogger<CategoryService> logger)
        {
            _repo = repo;
            _cache = cache;
            _logger = logger;
        }

        private CategoryDTO MapToDto(Category c)
        {
            return new CategoryDTO
            {
                Id = c.Id,
                Name = c.Name,
                CreatedAt = c.CreatedAt,
                UpdatedAt = c.UpdatedAt,
                IsActive = c.IsActive
            };
        }

        public async Task<List<CategoryDTO>> GetAllAsync()
        {
            return await BusPerformance.MeasureAsync(_logger, "Category.GetAll", "RAM Cache/Database", async () =>
            {
                var (items, _) = await _cache.GetOrCreateAsync(
                    async () => (await _repo.GetAllAsync()).Select(MapToDto).ToList(),
                    CacheTtl);
                return items.ToList();
            });
        }

        public async Task<CategoryDTO?> GetByIdAsync(int id)
        {
            var items = await GetAllAsync();
            return items.FirstOrDefault(c => c.Id == id);
        }

        // Paginated result: reuse your existing PaginationResult<T>
        public async Task<PaginationResult<CategoryDTO>> GetPaginatedAsync(int page, int pageSize, string? search)
        {
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 10;

            var items = await GetAllAsync();
            var filtered = string.IsNullOrWhiteSpace(search)
                ? items
                : items.Where(c => c.Name.Contains(search.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
            var total = filtered.Count;
            var dtoItems = filtered.Skip((page - 1) * pageSize).Take(pageSize).ToList();

            var totalPages = (int)Math.Ceiling((double)total / pageSize);

            return new PaginationResult<CategoryDTO>
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


        // Lấy category với filter và phân trang (ServiceResultDTO)
        public async Task<ResultPaginatedDTO<CategoryResponseDTO>> GetFilteredAndPaginatedAsync(
            int page,
            int pageSize,
            string? keyword = null,
            string? status = null)
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 10;
            var skip = (page - 1) * pageSize;

            var all = await GetAllAsync();
            var filtered = all.AsEnumerable();
            if (!string.IsNullOrWhiteSpace(keyword))
            {
                var value = keyword.Trim();
                filtered = filtered.Where(c =>
                    c.Name.Contains(value, StringComparison.OrdinalIgnoreCase));
            }
            if (string.Equals(status, "active", StringComparison.OrdinalIgnoreCase))
                filtered = filtered.Where(c => c.IsActive);
            else if (string.Equals(status, "inactive", StringComparison.OrdinalIgnoreCase))
                filtered = filtered.Where(c => !c.IsActive);

            var filteredList = filtered.OrderByDescending(c => c.CreatedAt).ToList();
            var categories = filteredList.Skip(skip).Take(pageSize).ToList();
            var totalItems = filteredList.Count;
            var totalPages = (int)Math.Ceiling(totalItems / (double)pageSize);

            var dtos = categories.Select(c => new CategoryResponseDTO
            {
                Id = c.Id,
                Name = c.Name,
                IsActive = c.IsActive,
                CreatedAt = c.CreatedAt,
                UpdatedAt = c.UpdatedAt
            }).ToList();

            return new ResultPaginatedDTO<CategoryResponseDTO>
            {
                Items = dtos,
                CurrentPage = page,
                TotalPages = totalPages,
                TotalItems = totalItems
            };
        }

        // Lấy category by Id với ServiceResultDTO
        public async Task<ServiceResultDTO<CategoryResponseDTO>> GetCategoryByIdAsync(int id)
        {
            var category = (await GetAllAsync()).FirstOrDefault(c => c.Id == id);
            if (category == null)
            {
                return ServiceResultDTO<CategoryResponseDTO>.CreateFailureResult(404, "Category not found.");
            }

            return ServiceResultDTO<CategoryResponseDTO>.CreateSuccessResult(new CategoryResponseDTO
            {
                Id = category.Id,
                Name = category.Name,
                IsActive = category.IsActive,
                CreatedAt = category.CreatedAt,
                UpdatedAt = category.UpdatedAt
            }, 200);
        }

        // Tạo category mới với ServiceResultDTO
        public async Task<ServiceResultDTO<CategoryResponseDTO>> CreateCategoryWithDtoAsync(CategoryCreateDTO createDto)
        {
            // Kiểm tra trùng tên
            var exists = await _repo.ExistsByNameAsync(createDto.Name);
            if (exists)
            {
                return ServiceResultDTO<CategoryResponseDTO>.CreateFailureResult(409, "Category name already exists.");
            }

            var category = new Category
            {
                Name = createDto.Name,
                Description = createDto.Description,
                Slug = GenerateSlug(createDto.Name),
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            var newCategory = await _repo.CreateAsync(category);
            _cache.AddOrUpdate(MapToDto(newCategory), item => item.Id);
            return ServiceResultDTO<CategoryResponseDTO>.CreateSuccessResult(MapToCategoryResponseDto(newCategory), 201);
        }

        // Cập nhật category với ServiceResultDTO
        public async Task<ServiceResultDTO<CategoryResponseDTO>> UpdateCategoryWithDtoAsync(int id, CategoryUpdateDTO updateDto)
        {
            var category = await _repo.GetByIdAsync(id);
            if (category == null)
            {
                return ServiceResultDTO<CategoryResponseDTO>.CreateFailureResult(404, "Category not found.");
            }

            var hasChanges = false;

            if (updateDto.Name != null && updateDto.Name != category.Name)
            {
                // Kiểm tra trùng tên
                var duplicate = await _repo.ExistsByNameAsync(updateDto.Name, id);
                if (duplicate)
                {
                    return ServiceResultDTO<CategoryResponseDTO>.CreateFailureResult(409, "Category name already exists.");
                }

                category.Name = updateDto.Name;
                category.Slug = GenerateSlug(updateDto.Name);
                hasChanges = true;
            }

            if (updateDto.Description != null && updateDto.Description != category.Description)
            {
                category.Description = updateDto.Description;
                hasChanges = true;
            }

            if (!hasChanges)
            {
                return ServiceResultDTO<CategoryResponseDTO>.CreateFailureResult(400, "No changes detected.");
            }

            category.UpdatedAt = DateTime.UtcNow;

            var updatedCategory = await _repo.UpdateAsync(category);
            _cache.AddOrUpdate(MapToDto(updatedCategory), item => item.Id);
            return ServiceResultDTO<CategoryResponseDTO>.CreateSuccessResult(
                MapToCategoryResponseDto(updatedCategory),
                200
            );
        }

        // Toggle active status với ServiceResultDTO
        public async Task<ServiceResultDTO<CategoryResponseDTO>> UpdateActiveCategoryAsync(int id, bool isActive)
        {
            var category = await _repo.GetByIdAsync(id);
            if (category == null)
            {
                return ServiceResultDTO<CategoryResponseDTO>.CreateFailureResult(404, "Category not found.");
            }

            if (category.IsActive == isActive)
            {
                return ServiceResultDTO<CategoryResponseDTO>.CreateFailureResult(400, "No changes detected.");
            }

            category.IsActive = isActive;
            category.UpdatedAt = DateTime.UtcNow;

            var updatedCategory = await _repo.UpdateAsync(category);
            _cache.AddOrUpdate(MapToDto(updatedCategory), item => item.Id);
            return ServiceResultDTO<CategoryResponseDTO>.CreateSuccessResult(MapToCategoryResponseDto(updatedCategory), 200);
        }

        // Map sang CategoryResponseDTO
        public CategoryResponseDTO MapToCategoryResponseDto(Category category)
        {
            return new CategoryResponseDTO
            {
                Id = category.Id,
                Name = category.Name,
                Slug = category.Slug,
                Description = category.Description,
                IsActive = category.IsActive,
                CreatedAt = category.CreatedAt,
                UpdatedAt = category.UpdatedAt
            };
        }

        // Tạo slug từ name
        private string GenerateSlug(string name)
        {
            if (string.IsNullOrWhiteSpace(name))
                return string.Empty;

            // Chuyển thành lowercase và thay khoảng trắng bằng dấu gạch ngang
            var slug = name.Trim().ToLower()
                .Replace(" ", "-")
                .Replace(".", "")
                .Replace(",", "");

            return slug;
        }
    }
}
