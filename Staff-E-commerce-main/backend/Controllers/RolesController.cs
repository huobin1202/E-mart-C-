using backend.DTO;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class RolesController : ControllerBase
{
    private readonly RoleService _service;
    public RolesController(RoleService service) => _service = service;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<RoleDTO>>> GetRoles() => Ok(await _service.GetRolesAsync());

    [HttpGet("permissions")]
    public async Task<ActionResult> GetPermissions() => Ok(await _service.GetPermissionsAsync());

    [HttpPost]
    public async Task<ActionResult<RoleDTO>> CreateRole(RoleDTO request)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var result = await _service.CreateAsync(request);
        return result.Result is not null
            ? CreatedAtAction(nameof(GetRoles), new { id = result.Result.Id }, result.Result)
            : StatusCode(result.StatusCode, result.Error);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<RoleDTO>> UpdateRole(int id, RoleDTO request)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var result = await _service.UpdateAsync(id, request);
        if (result.Result is not null) return Ok(result.Result);
        return result.StatusCode == 404 ? NotFound() : StatusCode(result.StatusCode, result.Error);
    }
}
