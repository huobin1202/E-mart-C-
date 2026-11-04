using backend.DTO;
using backend.Models;
using backend.Repository;

namespace backend.Services
{
    public class CustomerService
    {
        private readonly CustomerRepository _repo;
        private readonly BusMemoryCache<CustomerResponseDTO> _cache;
        private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(15);

        public CustomerService(CustomerRepository repo, BusMemoryCache<CustomerResponseDTO> cache)
        {
            _repo = repo;
            _cache = cache;
        }

        public async Task<IReadOnlyList<CustomerResponseDTO>> GetCachedAsync()
        {
            var (items, _) = await _cache.GetOrCreateAsync(
                async () => (await _repo.GetAllAsync()).Select(MapToCustomerResponseDto).ToList(),
                CacheTtl);
            return items;
        }

        public void SyncRegisteredCustomer(Customer customer)
        {
            _cache.AddOrUpdate(MapToCustomerResponseDto(customer), item => item.Id);
        }

        // Phân trang
        public async Task<(List<CustomerDTO> Items, int TotalPages)> GetPaginatedAsync(int page, int pageSize)
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 10;

            var customers = await GetCachedAsync();
            var totalItems = customers.Count;
            var totalPages = (int)Math.Ceiling(totalItems / (double)pageSize);
            var dtos = customers.Skip((page - 1) * pageSize).Take(pageSize).Select(c => new CustomerDTO
            {
                Id = c.Id,
                FullName = c.FullName,
                Phone = c.Phone,
                Email = c.Email,
                Address = c.Address,
                DateOfBirth = c.DateOfBirth,
                RewardPoints = c.RewardPoints
            }).ToList();

            return (dtos, totalPages);
        }

        // Tìm kiếm theo tên
        public async Task<List<CustomerDTO>> SearchByNameAsync(string keyword)
        {
            var value = keyword?.Trim() ?? string.Empty;
            return (await GetCachedAsync())
                .Where(c => c.FullName.Contains(value, StringComparison.OrdinalIgnoreCase))
                .Select(c => new CustomerDTO
                {
                    Id = c.Id, FullName = c.FullName, Phone = c.Phone, Email = c.Email,
                    Address = c.Address, DateOfBirth = c.DateOfBirth, RewardPoints = c.RewardPoints
                }).ToList();
        }

        public async Task<ResultPaginatedDTO<CustomerResponseDTO>> GetFilteredAndPaginatedAsync(
            int page,
            int pageSize,
            string? keyword = null,
            string? status = null)
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 10;
            var skip = (page - 1) * pageSize;
            // Reuse the BUS snapshot for filtering, paging and summary counts.
            // Successful writes invalidate it; storefront profile changes also synchronize it.
            var filtered = (await GetCachedAsync()).AsEnumerable();
            if (!string.IsNullOrWhiteSpace(keyword))
            {
                var value = keyword.Trim();
                filtered = filtered.Where(c => c.FullName.Contains(value, StringComparison.OrdinalIgnoreCase)
                    || (c.Phone?.Contains(value, StringComparison.OrdinalIgnoreCase) ?? false)
                    || (c.Email?.Contains(value, StringComparison.OrdinalIgnoreCase) ?? false)
                    || (c.Address?.Contains(value, StringComparison.OrdinalIgnoreCase) ?? false));
            }
            if (string.Equals(status, "active", StringComparison.OrdinalIgnoreCase)) filtered = filtered.Where(c => c.IsActive);
            if (string.Equals(status, "inactive", StringComparison.OrdinalIgnoreCase)) filtered = filtered.Where(c => !c.IsActive);
            var filteredList = filtered.OrderByDescending(c => c.CreatedAt).ThenByDescending(c => c.Id).ToList();
            var totalItems = filteredList.Count;
            var totalPages = (int)Math.Ceiling(totalItems / (double)pageSize);
            var dtos = filteredList.Skip(skip).Take(pageSize).ToList();
            return new ResultPaginatedDTO<CustomerResponseDTO>
            {
                Items = dtos,
                CurrentPage = page,
                TotalPages = totalPages,
                TotalItems = totalItems
            };
        }

        public async Task<ServiceResultDTO<CustomerResponseDTO>> GetCustomerByIdAsync(int id)
        {
            var entity = await _repo.GetByIdAsync(id);
            var customer = entity == null ? null : MapToCustomerResponseDto(entity);
            if (customer == null)
            {
                return ServiceResultDTO<CustomerResponseDTO>.CreateFailureResult(404, "Không tìm thấy khách hàng.");
            }

            return ServiceResultDTO<CustomerResponseDTO>.CreateSuccessResult(customer, 200);
        }

        public async Task<ServiceResultDTO<CustomerResponseDTO>> CreateCustomerAsync(CustomerCreateDTO createDto)
        {
            var customer = new Customer
            {
                FullName = createDto.FullName,
                Phone = createDto.Phone,
                Email = createDto.Email,
                Address = createDto.Address,
                DateOfBirth = createDto.DateOfBirth,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };

            customer.FullName = customer.FullName.Trim();
            customer.Phone = customer.Phone?.Trim();
            customer.Email = string.IsNullOrWhiteSpace(customer.Email) ? null : customer.Email.Trim();
            if (await _repo.PhoneTakenAsync(customer.Phone ?? "", 0))
                return ServiceResultDTO<CustomerResponseDTO>.CreateFailureResult(409, "Số điện thoại đã được dùng cho khách hàng khác.");
            if (customer.Email != null && await _repo.EmailTakenAsync(customer.Email, 0))
                return ServiceResultDTO<CustomerResponseDTO>.CreateFailureResult(409, "Email đã được dùng cho khách hàng hoặc tài khoản khác.");

            var newCustomer = await _repo.AddAsync(customer);
            var result = MapToCustomerResponseDto(newCustomer);
            _cache.AddOrUpdate(result, item => item.Id);
            return ServiceResultDTO<CustomerResponseDTO>.CreateSuccessResult(result, 201);
        }

        public async Task<ServiceResultDTO<CustomerResponseDTO>> UpdateCustomerAsync(int id, CustomerUpdateDTO updateDto)
        {
            var cached = (await GetCachedAsync()).FirstOrDefault(c => c.Id == id);
            var customer = cached == null ? null : await _repo.GetByIdAsync(id);
            if (customer == null)
            {
                return ServiceResultDTO<CustomerResponseDTO>.CreateFailureResult(404, "Không tìm thấy khách hàng.");
            }

            var hasChanges = false;

            if (!string.IsNullOrWhiteSpace(updateDto.FullName) && updateDto.FullName.Trim() != customer.FullName)
            {
                customer.FullName = updateDto.FullName.Trim();
                hasChanges = true;
            }

            if (updateDto.Phone != null && updateDto.Phone.Trim() != customer.Phone)
            {
                var phone = updateDto.Phone.Trim();
                if (await _repo.PhoneTakenAsync(phone, id))
                    return ServiceResultDTO<CustomerResponseDTO>.CreateFailureResult(409, "Số điện thoại đã được dùng cho khách hàng khác.");
                customer.Phone = phone;
                hasChanges = true;
            }

            if (updateDto.Email != null && updateDto.Email.Trim() != (customer.Email ?? ""))
            {
                var email = string.IsNullOrWhiteSpace(updateDto.Email) ? null : updateDto.Email.Trim();
                if (email != null && await _repo.EmailTakenAsync(email, id))
                    return ServiceResultDTO<CustomerResponseDTO>.CreateFailureResult(409, "Email đã được dùng cho khách hàng hoặc tài khoản khác.");
                customer.Email = email;
                hasChanges = true;
            }

            if (updateDto.Address != null && updateDto.Address != customer.Address)
            {
                customer.Address = updateDto.Address;
                hasChanges = true;
            }
            if (updateDto.DateOfBirth != customer.DateOfBirth)
            {
                customer.DateOfBirth = updateDto.DateOfBirth;
                hasChanges = true;
            }

            if (!hasChanges)
            {
                // Saving an unchanged form is not an error; return the current data.
                return ServiceResultDTO<CustomerResponseDTO>.CreateSuccessResult(MapToCustomerResponseDto(customer), 200);
            }

            customer.UpdatedAt = DateTime.UtcNow;
            await _repo.SyncLinkedAccountAsync(customer);

            var updatedCustomer = await _repo.UpdateAsync(customer);
            _cache.AddOrUpdate(MapToCustomerResponseDto(updatedCustomer), item => item.Id);
            return ServiceResultDTO<CustomerResponseDTO>.CreateSuccessResult(
                MapToCustomerResponseDto(updatedCustomer),
                200
            );
        }


        public async Task<ServiceResultDTO<CustomerResponseDTO>> UpdateActiveCustomerAsync(int id, bool isActive)
        {
            var exists = (await GetCachedAsync()).FirstOrDefault(c => c.Id == id);
            if (exists == null)
            {
                return ServiceResultDTO<CustomerResponseDTO>.CreateFailureResult(404, "Không tìm thấy khách hàng.");
            }

            if (exists.IsActive == isActive)
            {
                return ServiceResultDTO<CustomerResponseDTO>.CreateSuccessResult(exists, 200);
            }

            var entity = await _repo.GetByIdAsync(id);
            if (entity == null)
                return ServiceResultDTO<CustomerResponseDTO>.CreateFailureResult(404, "Không tìm thấy khách hàng.");
            var updatedCustomer = await _repo.UpdateActiveAsync(entity, isActive);
            _cache.AddOrUpdate(MapToCustomerResponseDto(updatedCustomer), item => item.Id);
            return ServiceResultDTO<CustomerResponseDTO>.CreateSuccessResult(MapToCustomerResponseDto(updatedCustomer), 200);
        }

        public async Task<bool> DeleteCustomerAsync(int id)
        {
            var deleted = await _repo.DeleteAsync(id);
            if (deleted) _cache.RemoveWhere(item => item.Id == id);
            return deleted;
        }

        public Task<bool> HasLoginAccountAsync(int customerId) => _repo.HasLoginAccountAsync(customerId);

        public Task<bool> HasBusinessHistoryAsync(int customerId) => _repo.HasBusinessHistoryAsync(customerId);

        public CustomerResponseDTO MapToCustomerResponseDto(Customer customer)
        {
            return new CustomerResponseDTO
            {
                Id = customer.Id,
                FullName = customer.FullName,
                Phone = customer.Phone!,
                Email = customer.Email,
                Address = customer.Address,
                DateOfBirth = customer.DateOfBirth,
                IsActive = customer.IsActive,
                RewardPoints = customer.RewardPoints,
                CreatedAt = customer.CreatedAt,
                Note = customer.Note,
                UpdatedAt = customer.UpdatedAt,
            };
        }

    }
}
