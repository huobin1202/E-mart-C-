using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Repository
{
    public class CustomerRepository
    {
        private readonly AppDbContext _context;

        /*************  ✨ Windsurf Command ⭐  *************/
        /// <summary>
        /// Constructor for CustomerRepository.
        /// </summary>
        /// <param name="context">The AppDbContext instance.</param>
        /*******  de317274-e941-4a67-8e12-78d4c12762df  *******/
        public CustomerRepository(AppDbContext context)
        {
            _context = context;
        }

        // Lấy tất cả khách hàng
        public async Task<List<Customer>> GetAllAsync()
        {
            return await _context.Customers
                .OrderBy(c => c.FullName)
                .ToListAsync();
        }

        // Lấy khách hàng theo Id
        public async Task<Customer?> GetByIdAsync(int id)
        {
            return await _context.Customers
                .FirstOrDefaultAsync(c => c.Id == id);
        }

        // Lấy khách hàng theo phone hoặc email
        public async Task<Customer?> GetByPhoneAsync(string phone)
        {
            return await _context.Customers
                .FirstOrDefaultAsync(c => c.Phone == phone);
        }

        public async Task<Customer?> GetByEmailAsync(string email)
        {
            return await _context.Customers
                .FirstOrDefaultAsync(c => c.Email == email);
        }

        // Thêm khách hàng mới
        public async Task<Customer> AddAsync(Customer customer)
        {
            _context.Customers.Add(customer);
            await _context.SaveChangesAsync();
            return customer;
        }

        // Cập nhật khách hàng
        public async Task<Customer> UpdateAsync(Customer customer)
        {
            _context.Customers.Update(customer);
            await _context.SaveChangesAsync();
            return customer;
        }

        // Xóa khách hàng
        public async Task<bool> DeleteAsync(int id)
        {
            var customer = await _context.Customers.FindAsync(id);
            if (customer == null)
                return false;

            _context.Customers.Remove(customer);
            await _context.SaveChangesAsync();
            return true;
        }

        // Kiểm tra tồn tại khách hàng theo Id
        public async Task<bool> ExistsAsync(int id)
        {
            return await _context.Customers.AnyAsync(c => c.Id == id);
        }


        public async Task<int> CountAsync() =>
            await _context.Customers.CountAsync();
    }
}
