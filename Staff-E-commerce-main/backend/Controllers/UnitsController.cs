using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using backend.Models;
using backend.DTO;
using backend.Services;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class UnitsController : ControllerBase
    {
        private readonly UnitService _unitService;

        public UnitsController(UnitService unitService)
        {
            _unitService = unitService;
        }

        // GET api/units
        [HttpGet]
        public async Task<ActionResult<List<UnitDTO>>> GetAll([FromQuery] bool? isActive = null)
        {
            return Ok(await _unitService.GetAllUnitsAsync(isActive));
        }

        // GET api/units/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<UnitDTO>> GetById(int id)
        {
            var unit = await _unitService.GetUnitByIdAsync(id);
            if (unit == null)
                return NotFound(new { message = "Unit not found" });
            return Ok(unit);
        }

        // POST api/units
        [HttpPost]
        [Authorize]
        public async Task<ActionResult<UnitDTO>> Create([FromBody] UnitDTO dto)
        {
            try
            {
                var result = await _unitService.CreateUnitAsync(dto);
                return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
            }
            catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
            catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
        }

        // PUT api/units/{id}
        [HttpPut("{id}")]
        [Authorize]
        public async Task<ActionResult<UnitDTO>> Update(int id, [FromBody] UnitDTO dto)
        {
            try
            {
                var result = await _unitService.UpdateUnitAsync(id, dto);
                return result == null ? NotFound(new { message = "Unit not found" }) : Ok(result);
            }
            catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
            catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
        }

        // DELETE api/units/{id}
        [HttpDelete("{id}")]
        [Authorize]
        public async Task<IActionResult> Delete(int id)
        {
            try
            {
                var deleted = await _unitService.DeleteUnitAsync(id);
                if (!deleted)
                    return NotFound(new { message = "Unit not found" });

                return Ok(new { message = "Unit deleted successfully" });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        // PATCH api/units/{id}/toggle-active
        [HttpPatch("{id}/toggle-active")]
        [Authorize]
        public async Task<ActionResult<UnitDTO>> ToggleActive(int id)
        {
            var result = await _unitService.ToggleActiveAsync(id);
            return result == null ? NotFound(new { message = "Unit not found" }) : Ok(result);
        }
    }
}
