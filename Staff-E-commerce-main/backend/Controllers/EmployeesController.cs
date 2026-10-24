using backend.DTO;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class EmployeesController : ControllerBase
    {
        private readonly EmployeeService _service;
        public EmployeesController(EmployeeService service) => _service = service;

        [HttpGet]
        public async Task<ActionResult<IEnumerable<EmployeeDTO>>> GetAll()
        {
            return Ok(await _service.GetAllAsync());
        }

        [HttpGet("{id:int}")]
        public async Task<ActionResult<EmployeeDTO>> Get(int id)
        {
            var employee = await _service.GetByIdAsync(id);
            return employee == null ? NotFound() : Ok(ToDto(employee));
        }

        [HttpPost]
        public async Task<ActionResult<EmployeeDTO>> Create(EmployeeDTO request)
        {
            if (!ModelState.IsValid) return ValidationProblem(ModelState);
            var employee = await _service.CreateAsync(request);
            return CreatedAtAction(nameof(Get), new { id = employee.Id }, employee);
        }

        [HttpPut("{id:int}")]
        public async Task<ActionResult<EmployeeDTO>> Update(int id, EmployeeDTO request)
        {
            var employee = await _service.GetByIdAsync(id);
            if (employee == null) return NotFound();
            if (!ModelState.IsValid) return ValidationProblem(ModelState);
            try { return Ok(await _service.UpdateAsync(id, request)); }
            catch (InvalidOperationException ex) { return Conflict(new { message = ex.Message }); }
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            try
            {
                return await _service.DeleteAsync(id) ? NoContent() : NotFound();
            }
            catch (InvalidOperationException ex) { return Conflict(ex.Message); }
        }

        private static EmployeeDTO ToDto(EmployeeDTO employee) => employee;
    }
}
