using backend.DTO;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly UserService _users;
        private readonly AuthService _auth;

        public AuthController(UserService users, AuthService auth)
        {
            _users = users;
            _auth = auth;
        }

        [HttpPost("register")]
        [Authorize]
        public async Task<IActionResult> Register([FromBody] UserDTO req)
        {
            var created = await _users.CreateUserAsync(req);
            return Created($"/api/users/{created!.Id}", created);
        }

        [HttpPost("login")]
        [AllowAnonymous]
        public async Task<IActionResult> Login([FromBody] LoginRequest req)
        {

            var result = await _auth.LoginAsync(req);
            return result.Response is not null
                ? Ok(result.Response)
                : StatusCode(result.StatusCode, new { message = result.Error });
        }
    }
}
