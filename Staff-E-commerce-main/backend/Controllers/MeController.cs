using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using backend.DTO;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/me")]
    [Authorize]
    public class MeController : ControllerBase
    {
        private readonly UserService _userService;

        public MeController(UserService userService)
        {
            _userService = userService;
        }

        [HttpGet("access")]
        public async Task<IActionResult> GetAccess()
        {
            var id = ResolveUserId();
            if (id is null) return Unauthorized();
            var access = await _userService.GetAccessAsync(id.Value);
            return access == null ? Unauthorized() : Ok(access);
        }

        [HttpGet]
        public async Task<ActionResult> GetProfile()
        {
            var userId = ResolveUserId();
            if (userId == null)
                return Unauthorized("Missing user id in token.");

            var user = await _userService.GetUserByIdAsync(userId.Value);
            if (user == null)
                return NotFound("User not found.");

            return Ok(MapToMeDto(user));
        }

        [HttpPut]
        public async Task<ActionResult> UpdateProfile([FromBody] MeDTO request)
        {
            var userId = ResolveUserId();
            if (userId == null)
                return Unauthorized("Missing user id in token.");

            ModelState.Remove(nameof(MeDTO.Username));
            ModelState.Remove(nameof(MeDTO.Email));
            ModelState.Remove(nameof(MeDTO.FullName));

            ValidateProfilePayload(request);
            if (!ModelState.IsValid)
                return ValidationProblem(ModelState);

            if (await _userService.UserExistsUsernameAsync(request.Username, userId.Value))
                return Conflict("Username already exists.");

            if (await _userService.UserExistsEmailAsync(request.Email, userId.Value))
                return Conflict("Email already exists.");

            var updated = await _userService.UpdateProfileAsync(userId.Value, request);
            if (updated == null)
                return NotFound("User not found.");

            return Ok(MapToMeDto(updated));
        }

        [HttpPut("change-password")]
        public async Task<ActionResult> ChangePassword([FromBody] MeDTO request)
        {
            var userId = ResolveUserId();
            if (userId == null)
                return Unauthorized("Missing user id in token.");

            // Ignore profile fields when validating password-only payloads
            ModelState.Remove(nameof(MeDTO.Username));
            ModelState.Remove(nameof(MeDTO.Email));
            ModelState.Remove(nameof(MeDTO.FullName));

            if (string.IsNullOrWhiteSpace(request.CurrentPassword))
                ModelState.AddModelError(nameof(MeDTO.CurrentPassword), "Current password is required.");

            if (string.IsNullOrWhiteSpace(request.NewPassword))
                ModelState.AddModelError(nameof(MeDTO.NewPassword), "New password is required.");

            if (string.IsNullOrWhiteSpace(request.ConfirmNewPassword))
                ModelState.AddModelError(nameof(MeDTO.ConfirmNewPassword), "Password confirmation is required.");

            if (!ModelState.IsValid)
                return ValidationProblem(ModelState);

            var result = await _userService.ChangePasswordAsync(
                userId.Value,
                request.CurrentPassword!,
                request.NewPassword!
            );

            if (result == UserService.ChangePasswordResult.UserNotFound)
                return NotFound("User not found.");

            if (result == UserService.ChangePasswordResult.InvalidCurrentPassword)
                return BadRequest("Mật khẩu hiện tại sai.");

            return NoContent();
        }

        private int? ResolveUserId()
        {
            var userIdClaim = User.FindFirst("uid")
                            ?? User.FindFirst("userId")
                            ?? User.FindFirst(ClaimTypes.NameIdentifier);

            return int.TryParse(userIdClaim?.Value, out var uid) ? uid : (int?)null;
        }

        private static MeDTO MapToMeDto(UserDTO user)
        {
            return new MeDTO
            {
                Username = user.Username ?? string.Empty,
                Email = user.Email ?? string.Empty,
                FullName = user.FullName
            };
        }

        private void ValidateProfilePayload(MeDTO request)
        {
            if (string.IsNullOrWhiteSpace(request.Username))
            {
                ModelState.AddModelError(nameof(MeDTO.Username), "Username is required.");
            }
            else if (request.Username.Length < 3)
            {
                ModelState.AddModelError(nameof(MeDTO.Username), "Username must be at least 3 characters.");
            }
            else if (request.Username.Length > 150)
            {
                ModelState.AddModelError(nameof(MeDTO.Username), "Username must be at most 150 characters.");
            }

            if (string.IsNullOrWhiteSpace(request.Email))
            {
                ModelState.AddModelError(nameof(MeDTO.Email), "Email is required.");
            }
            else if (!new EmailAddressAttribute().IsValid(request.Email))
            {
                ModelState.AddModelError(nameof(MeDTO.Email), "Email is invalid.");
            }
            else if (request.Email.Length > 255)
            {
                ModelState.AddModelError(nameof(MeDTO.Email), "Email must be at most 255 characters.");
            }
        }
    }
}
