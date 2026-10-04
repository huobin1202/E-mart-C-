using backend.Data;
using backend.DTO;
using backend.Models;
using backend.Services;
using BCrypt.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly JwtService _jwt;

        public AuthController(AppDbContext db, JwtService jwt)
        {
            _db = db;
            _jwt = jwt;
        }

        [HttpPost("register")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> Register([FromBody] LoginRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Password))
                return BadRequest("Username and password required.");

            var exists = await _db.Users.AnyAsync(u => u.Username == req.Username);
            if (exists) return BadRequest("Username already exists.");

            var user = new User
            {
                Username = req.Username,
                PasswordHash = HashPassword(req.Password),
                FullName = req.Username,
                Role = "staff",
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };

            _db.Users.Add(user);
            await _db.SaveChangesAsync();

            return Created("", new { message = "Created" });
        }

        [HttpPost("login")]
        [AllowAnonymous]
        public async Task<IActionResult> Login([FromBody] LoginRequest req)
        {
            Console.WriteLine($"🔍 Login attempt - Username: '{req.Username}', Password length: {req.Password}");

            if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Password))
            {
                Console.WriteLine("❌ Username or password is empty");
                return BadRequest(new { message = "Vui lòng nhập tên đăng nhập và mật khẩu" });
            }

            var user = await _db.Users
                .FirstOrDefaultAsync(u => u.Username == req.Username);

            if (user == null)
            {
                Console.WriteLine($"❌ User not found: {req.Username}");
                return Unauthorized(new { message = "Tên đăng nhập hoặc mật khẩu không đúng" });
            }

            Console.WriteLine($"✅ User found - ID: {user.Id}, IsActive: {user.IsActive}");

            if (!user.IsActive || user.IsLocked)
            {
                Console.WriteLine("❌ User is inactive");
                return Unauthorized(new { message = "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên" });
            }

            bool passwordValid = BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash);
            Console.WriteLine($"🔐 Password verification: {passwordValid}");

            if (!passwordValid)
            {
                Console.WriteLine("❌ Password incorrect");
                return Unauthorized(new { message = "Tên đăng nhập hoặc mật khẩu không đúng" });
            }

            var (token, expiresIn) = _jwt.GenerateToken(user);
            Console.WriteLine($"✅ Token generated successfully");

            return Ok(new AuthResponse
            {
                Token = token,
                TokenType = "Bearer",
                ExpiresIn = expiresIn,
                UserId = user.Id,
                UserName = user.Username,
                Role = user.Role
            });
        }

        private const int BcryptWorkFactor = 11;
        private static string HashPassword(string password) => BCrypt.Net.BCrypt.HashPassword(password, workFactor: BcryptWorkFactor);
    }
}
