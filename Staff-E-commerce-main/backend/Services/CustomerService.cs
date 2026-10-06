using backend.DTO;
using backend.Models;
using backend.Repository;

namespace backend.Services
{
    public class CustomerService
    {
        private readonly CustomerRepository _repo;

        public CustomerService(CustomerRepository repo)
        {
            _repo = repo;
        }

        // Phân trang
        public async Task<(List<CustomerDTO> Items, int TotalPages)> GetPaginatedAsync(int page, int pageSize)
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 10;

            var totalItems = await _repo.CountAsync();
            var totalPages = (int)Math.Ceiling(totalItems / (double)pageSize);

            var customers = await _repo.GetPaginatedAsync(page, pageSize);

            var dtos = customers.Select(c => new CustomerDTO
            {
                Id = c.Id,
                FullName = c.FullName,
                Phone = c.Phone,
                Email = c.Email,
                Address = c.Address,
                RewardPoints = c.RewardPoints
            }).ToList();

            return (dtos, totalPages);
        }

        // Tìm kiếm theo tên
        public async Task<List<CustomerDTO>> SearchByNameAsync(string keyword)
        {
            var customers = await _repo.SearchByNameAsync(keyword);
            return customers.Select(c => new CustomerDTO
            {
                Id = c.Id,
                FullName = c.FullName,
                Phone = c.Phone,
                Email = c.Email,
                Address = c.Address,
                RewardPoints = c.RewardPoints
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
            var customers = await _repo.findCustomersByFilteredAndPaginatedAsync(skip, pageSize, keyword, status);
            var totalItems = await _repo.CountFilteredAndPaginatedAsync(keyword, status);
            var totalPages = (int)Math.Ceiling(totalItems / (double)pageSize);
            var dtos = customers.Select(MapToCustomerResponseDto).ToList();
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
            var customer = await _repo.GetByIdAsync(id);
            if (customer == null)
            {
                return ServiceResultDTO<CustomerResponseDTO>.CreateFailureResult(404, "Customer not found.");
            }

            return ServiceResultDTO<CustomerResponseDTO>.CreateSuccessResult(MapToCustomerResponseDto(customer), 200);
        }

        public async Task<ServiceResultDTO<CustomerResponseDTO>> CreateCustomerAsync(CustomerCreateDTO createDto)
        {
            var customer = new Customer
            {
                FullName = createDto.FullName,
                Phone = createDto.Phone,
                Email = createDto.Email,
                Address = createDto.Address,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };

            var exists = await _repo.GetByPhoneAsync(customer.Phone);
            if (exists != null)
            {
                return ServiceResultDTO<CustomerResponseDTO>.CreateFailureResult(409, "Customer already exists.");

            }

            var newCustomer = await _repo.AddAsync(customer);
            return ServiceResultDTO<CustomerResponseDTO>.CreateSuccessResult(MapToCustomerResponseDto(newCustomer), 201);
        }

        public async Task<ServiceResultDTO<CustomerResponseDTO>> UpdateCustomerAsync(int id, CustomerUpdateDTO updateDto)
        {
            var customer = await _repo.GetByIdAsync(id);
            if (customer == null)
            {
                return ServiceResultDTO<CustomerResponseDTO>.CreateFailureResult(404, "Customer not found.");
            }

            var hasChanges = false;

            if (updateDto.FullName != null && updateDto.FullName != customer.FullName)
            {
                customer.FullName = updateDto.FullName;
                hasChanges = true;
            }

            if (updateDto.Phone != null && updateDto.Phone != customer.Phone)
            {
                customer.Phone = updateDto.Phone;
                hasChanges = true;
            }

            if (updateDto.Email != null && updateDto.Email != customer.Email)
            {
                customer.Email = updateDto.Email;
                hasChanges = true;
            }

            if (updateDto.Address != null && updateDto.Address != customer.Address)
            {
                customer.Address = updateDto.Address;
                hasChanges = true;
            }

            if (!hasChanges)
            {
                return ServiceResultDTO<CustomerResponseDTO>.CreateFailureResult(400, "No changes detected.");
            }

            customer.UpdatedAt = DateTime.UtcNow;

            var updatedCustomer = await _repo.UpdateAsync(customer);
            return ServiceResultDTO<CustomerResponseDTO>.CreateSuccessResult(
                MapToCustomerResponseDto(updatedCustomer),
                200
            );
        }


        public async Task<ServiceResultDTO<CustomerResponseDTO>> UpdateActiveCustomerAsync(int id, bool isActive)
        {
            Console.WriteLine($"[SERVICE] UpdateActiveCustomerAsync called with id={id}, isActive={isActive}");
            var exists = await _repo.GetByIdAsync(id);
            Console.WriteLine($"[SERVICE] Retrieved customer: {exists}");
            if (exists == null)
            {
                return ServiceResultDTO<CustomerResponseDTO>.CreateFailureResult(404, "Customer not found.");
            }
            Console.WriteLine($"[SERVICE] Found customer with Id={exists.Id}, Current IsActive={exists.IsActive}");
            if (exists.IsActive == isActive)
            {
                Console.WriteLine($"[SERVICE] No changes detected for customer with Id={exists.Id}");
                Console.WriteLine($"[SERVICE] {exists.IsActive} == {isActive} ? {exists.IsActive == isActive}");
                return ServiceResultDTO<CustomerResponseDTO>.CreateFailureResult(400, "No changes detected.");
            }

            exists.IsActive = isActive;
            var updatedCustomer = await _repo.UpdateAsync(exists);
            Console.WriteLine($"[SERVICE] Customer with updatedCustomer={updatedCustomer.Id} updated successfully to IsActive={isActive}");

            return ServiceResultDTO<CustomerResponseDTO>.CreateSuccessResult(MapToCustomerResponseDto(updatedCustomer), 200);
        }


        public CustomerResponseDTO MapToCustomerResponseDto(Customer customer)
        {
            return new CustomerResponseDTO
            {
                Id = customer.Id,
                FullName = customer.FullName,
                Phone = customer.Phone!,
                Email = customer.Email,
                Address = customer.Address,
                IsActive = customer.IsActive,
                RewardPoints = customer.RewardPoints,
                CreatedAt = customer.CreatedAt,
                UpdatedAt = customer.UpdatedAt,
            };
        }

    }
}
