using Microsoft.AspNetCore.Mvc;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using backend.DTO;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class UsersController : ControllerBase
    {
        private readonly UserService _userService;

        public UsersController(UserService userService)
        {
            _userService = userService;
        }

        // GET api/users/paginated?page=1&pageSize=10
        [HttpGet("paginated")]
        public async Task<ActionResult> GetPaginated(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10,
            [FromQuery] string? role = null,
            [FromQuery] bool? isActive = null,
            [FromQuery] string? search = null)
        {
            if (page < 1) page = 1;
            pageSize = Math.Clamp(pageSize, 1, 100);

            var users = await _userService.GetPaginatedAsync(page, pageSize, role, isActive, search);
            return Ok(users);
        }

        [HttpGet("getalluser")]
        public async Task<ActionResult> GetAllUsers()
        {
            var users = await _userService.GetAllUsersAsync();
            return Ok(users);
        }

        [HttpGet("{id:int}")]
        public async Task<ActionResult> GetUserById(int id)
        {
            var user = await _userService.GetUserByIdAsync(id);
            if (user == null)
                return NotFound($"User with ID {id} not found");

            return Ok(user);
        }

        [HttpPost]
        public async Task<ActionResult> CreateUser([FromBody] UserDTO? request)
        {
            if (request == null)
                return BadRequest("Dữ liệu tạo tài khoản không được để trống.");

            NormalizeUserDto(request);
            ModelState.Clear();
            if (request.Role != "customer" && !request.EmployeeId.HasValue)
                return BadRequest("Tài khoản nội bộ (admin/staff) phải gắn với một hồ sơ nhân viên.");
            if (request.Role == "customer" && !request.CustomerId.HasValue)
                return BadRequest("CustomerId is required for a customer account.");
            if (request.Role == "admin" && request.CustomerId.HasValue)
                return BadRequest("Admin accounts cannot be linked to a customer profile.");

            if (string.IsNullOrWhiteSpace(request.Password))
            {
                ModelState.AddModelError(nameof(UserDTO.Password), "Password is required.");
            }

            if (!TryValidateModel(request))
                return ValidationProblem(ModelState);

            if (await _userService.UserExistsUsernameAsync(request.Username))
                return Conflict("Username already exists.");

            if (!string.IsNullOrWhiteSpace(request.Email) && await _userService.UserExistsEmailAsync(request.Email))
                return Conflict("Email already exists.");

            UserDTO? createdUser;
            try
            {
                createdUser = await _userService.CreateUserAsync(request);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            if (createdUser == null)
                return StatusCode(500, "Unable to create user.");

            return CreatedAtAction(nameof(GetUserById), new { id = createdUser.Id }, createdUser);
        }

        [HttpPut("{id:int}")]
        public async Task<ActionResult> UpdateUser(int id, [FromBody] UserDTO? request)
        {
            if (id <= 0)
                return BadRequest("User ID must be greater than 0.");
            if (request == null)
                return BadRequest("Dữ liệu cập nhật tài khoản không được để trống.");

            NormalizeUserDto(request);
            ModelState.Clear();
            if (request.Role != "customer" && !request.EmployeeId.HasValue)
                return BadRequest("Tài khoản nội bộ (admin/staff) phải gắn với một hồ sơ nhân viên.");
            if (request.Role == "customer" && !request.CustomerId.HasValue)
                return BadRequest("CustomerId is required for a customer account.");
            if (request.Role == "admin" && request.CustomerId.HasValue)
                return BadRequest("Admin accounts cannot be linked to a customer profile.");

            if (!TryValidateModel(request))
                return ValidationProblem(ModelState);

            if (await _userService.UserExistsUsernameAsync(request.Username, id))
                return Conflict("Username already exists.");

            if (!string.IsNullOrWhiteSpace(request.Email) && await _userService.UserExistsEmailAsync(request.Email, id))
                return Conflict("Email already exists.");

            UserDTO? updatedUser;
            try
            {
                updatedUser = await _userService.UpdateUserAsync(id, request);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            if (updatedUser == null)
                return NotFound($"User with ID {id} not found");

            return Ok(updatedUser);
        }

        [HttpPatch("{id:int}/status")]
        public async Task<ActionResult> UpdateStatus(int id, [FromQuery] bool isActive)
        {
            if (id <= 0)
                return BadRequest("User ID must be greater than 0.");

            var updatedUser = await _userService.UpdateStatusAsync(id, isActive);
            if (updatedUser == null)
                return NotFound($"User with ID {id} not found");

            return Ok(updatedUser);
        }

        [HttpDelete("{id:int}")]
        public async Task<ActionResult> DeleteUser(int id)
        {
            if (id <= 0)
                return BadRequest("User ID must be greater than 0.");

            var deleted = await _userService.DeleteUserAsync(id);
            if (!deleted)
                return NotFound($"User with ID {id} not found");

            return NoContent();
        }

        private static void NormalizeUserDto(UserDTO request)
        {
            request.Role = request.Role?.Trim().ToLowerInvariant() ?? "staff";
            request.Username = request.Username?.Trim() ?? string.Empty;
            request.Email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim();
            request.FullName = string.IsNullOrWhiteSpace(request.FullName)
                ? null
                : request.FullName.Trim();
        }
    }
}
