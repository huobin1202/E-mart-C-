using backend.DTO;
using backend.Models;
using backend.Repository;

namespace backend.Services;

public sealed class EmployeeService
{
    private readonly EmployeeRepository _repository;
    private readonly BusMemoryCache<EmployeeDTO> _cache;
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(15);

    public EmployeeService(EmployeeRepository repository, BusMemoryCache<EmployeeDTO> cache)
    {
        _repository = repository;
        _cache = cache;
    }

    public async Task<IReadOnlyList<EmployeeDTO>> GetAllAsync()
    {
        var (items, _) = await _cache.GetOrCreateAsync(
            async () => (await _repository.GetAllAsync()).Select(Map).ToList(), CacheTtl);
        return items;
    }

    public async Task<EmployeeDTO?> GetByIdAsync(int id) =>
        (await GetAllAsync()).FirstOrDefault(e => e.Id == id);

    public async Task<EmployeeDTO> CreateAsync(EmployeeDTO request)
    {
        var now = DateTime.UtcNow;
        var employee = new Employee
        {
            FullName = request.FullName.Trim(),
            Phone = request.Phone?.Trim(),
            Email = request.Email?.Trim(),
            DateOfBirth = request.DateOfBirth,
            Address = request.Address?.Trim(),
            Note = request.Note?.Trim(),
            IsActive = request.IsActive,
            CreatedAt = now,
            UpdatedAt = now
        };

        var created = await _repository.CreateAsync(employee);
        var result = Map(created);
        _cache.AddOrUpdate(result, item => item.Id);
        return result;
    }

    public async Task<EmployeeDTO?> UpdateAsync(int id, EmployeeDTO request)
    {
        var employee = await _repository.GetByIdAsync(id);
        if (employee is null) return null;

        employee.FullName = request.FullName.Trim();
        employee.Phone = request.Phone?.Trim();
        employee.Email = request.Email?.Trim();
        employee.DateOfBirth = request.DateOfBirth;
        employee.Address = request.Address?.Trim();
        employee.Note = request.Note?.Trim();
        employee.IsActive = request.IsActive;
        employee.UpdatedAt = DateTime.UtcNow;

        if (employee.Account is not null)
        {
            if (!string.IsNullOrWhiteSpace(employee.Email) &&
                await _repository.IsEmailUsedByOtherUserAsync(employee.Email, employee.Account.Id))
                throw new InvalidOperationException("Email đã được tài khoản khác sử dụng.");

            employee.Account.FullName = employee.FullName;
            employee.Account.Email = employee.Email;
            employee.Account.UpdatedAt = employee.UpdatedAt;
            if (!employee.IsActive)
            {
                employee.Account.IsActive = false;
                employee.Account.IsLocked = true;
                employee.Account.SessionVersion++;
            }
        }

        var updated = await _repository.UpdateAsync(employee);
        var result = Map(updated);
        _cache.AddOrUpdate(result, item => item.Id);
        return result;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var deleted = await _repository.DeleteAsync(id);
        if (deleted) _cache.RemoveWhere(item => item.Id == id);
        return deleted;
    }

    internal static EmployeeDTO Map(Employee employee) => new()
    {
        Id = employee.Id,
        FullName = employee.FullName,
        Phone = employee.Phone,
        Email = employee.Email,
        Address = employee.Address,
        Note = employee.Note,
        IsActive = employee.IsActive,
        DateOfBirth = employee.DateOfBirth,
        HasAccount = employee.Account is not null,
        AccountUsername = employee.Account?.Username
    };
}
