using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Repository;

public sealed class EmployeeRepository
{
    private readonly AppDbContext _context;

    public EmployeeRepository(AppDbContext context) => _context = context;

    public Task<List<Employee>> GetAllAsync() => _context.Employees
        .AsNoTracking()
        .Include(e => e.Account)
        .OrderBy(e => e.FullName)
        .ToListAsync();

    public Task<Employee?> GetByIdAsync(int id) => _context.Employees
        .Include(e => e.Account)
        .FirstOrDefaultAsync(e => e.Id == id);

    public Task<bool> IsEmailUsedByOtherUserAsync(string email, int? accountId) =>
        _context.Users.AnyAsync(u => u.Id != accountId && u.Email == email);

    public async Task<Employee> CreateAsync(Employee employee)
    {
        _context.Employees.Add(employee);
        await _context.SaveChangesAsync();
        return employee;
    }

    public async Task<Employee> UpdateAsync(Employee employee)
    {
        _context.Employees.Update(employee);
        await _context.SaveChangesAsync();
        return employee;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var employee = await _context.Employees.FindAsync(id);
        if (employee is null) return false;
        if (await _context.Users.AnyAsync(u => u.EmployeeId == id))
            throw new InvalidOperationException("Không thể xóa hồ sơ đang được cấp tài khoản.");

        _context.Employees.Remove(employee);
        await _context.SaveChangesAsync();
        return true;
    }
}
