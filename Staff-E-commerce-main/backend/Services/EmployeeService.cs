using backend.DTO;
using backend.Models;
using backend.Repository;

namespace backend.Services;

public sealed class EmployeeService
{
    private readonly EmployeeRepository _repository;

    public EmployeeService(EmployeeRepository repository)
    {
        _repository = repository;
    }

    public async Task<IReadOnlyList<EmployeeDTO>> GetAllAsync()
    {
        return (await _repository.GetAllAsync()).Select(Map).ToList();
    }

    public async Task<EmployeeDTO?> GetByIdAsync(int id) =>
        (await GetAllAsync()).FirstOrDefault(e => e.Id == id);

    public async Task<EmployeeDTO> CreateAsync(EmployeeDTO request)
    {
        if (request.BaseSalary < 0) throw new ArgumentException("Lương cơ bản không được âm.");
        var (familyMiddleName, givenName) = ResolveNameParts(request);
        var now = DateTime.UtcNow;
        var employee = new Employee
        {
            FullName = request.FullName.Trim(),
            FamilyMiddleName = familyMiddleName,
            GivenName = givenName,
            Phone = request.Phone?.Trim(),
            Email = request.Email?.Trim(),
            DateOfBirth = request.DateOfBirth,
            Address = request.Address?.Trim(),
            Note = request.Note?.Trim(),
            BaseSalary = request.BaseSalary,
            IsActive = request.IsActive,
            CreatedAt = now,
            UpdatedAt = now
        };

        var created = await _repository.CreateAsync(employee);
        var result = Map(created);
        return result;
    }

    public async Task<EmployeeDTO?> UpdateAsync(int id, EmployeeDTO request)
    {
        var employee = await _repository.GetByIdAsync(id);
        if (employee is null) return null;
        if (request.BaseSalary < 0) throw new ArgumentException("Lương cơ bản không được âm.");
        var (familyMiddleName, givenName) = ResolveNameParts(request);

        employee.FullName = request.FullName.Trim();
        employee.FamilyMiddleName = familyMiddleName;
        employee.GivenName = givenName;
        employee.Phone = request.Phone?.Trim();
        employee.Email = request.Email?.Trim();
        employee.DateOfBirth = request.DateOfBirth;
        employee.Address = request.Address?.Trim();
        employee.Note = request.Note?.Trim();
        employee.BaseSalary = request.BaseSalary;
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
        return result;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var deleted = await _repository.DeleteAsync(id);
        return deleted;
    }

    private static EmployeeDTO Map(Employee employee) => new()
    {
        Id = employee.Id,
        FullName = employee.FullName,
        FamilyMiddleName = employee.FamilyMiddleName,
        GivenName = employee.GivenName,
        Phone = employee.Phone,
        Email = employee.Email,
        Address = employee.Address,
        Note = employee.Note,
        BaseSalary = employee.BaseSalary,
        IsActive = employee.IsActive,
        DateOfBirth = employee.DateOfBirth,
        HasAccount = employee.Account is not null,
        AccountUsername = employee.Account?.Username
    };

    private static (string FamilyMiddleName, string GivenName) ResolveNameParts(EmployeeDTO request)
    {
        if (!string.IsNullOrWhiteSpace(request.FamilyMiddleName) || !string.IsNullOrWhiteSpace(request.GivenName))
            return (request.FamilyMiddleName?.Trim() ?? string.Empty, request.GivenName?.Trim() ?? string.Empty);

        var normalized = string.Join(' ', request.FullName.Split(
            ' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        var separator = normalized.LastIndexOf(' ');
        return separator < 0
            ? (string.Empty, normalized)
            : (normalized[..separator], normalized[(separator + 1)..]);
    }
}
