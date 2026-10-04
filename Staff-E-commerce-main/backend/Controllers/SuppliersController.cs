using Microsoft.AspNetCore.Mvc;
using backend.DTO;
using backend.Models;
using backend.Services;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class SuppliersController : ControllerBase
    {
        private readonly SupplierService _service;

        public SuppliersController(SupplierService service)
        {
            _service = service;
        }

        // GET api/suppliers/paginated
        [HttpGet("paginated")]
        public async Task<ActionResult<PaginationResult<SupplierDTO>>> GetPaginated(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 12,
            [FromQuery] string? search = null)
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 200) pageSize = 12;

            var result = await _service.GetPaginatedAsync(page, pageSize, search);
            return Ok(result);
        }

        // GET api/suppliers
        [HttpGet]
        public async Task<ActionResult<IEnumerable<SupplierDTO>>> GetAll()
        {
            var list = await _service.GetAllAsync();
            return Ok(list);
        }

        // GET api/suppliers/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<SupplierDTO>> GetById(int id)
        {
            var dto = await _service.GetByIdAsync(id);
            if (dto == null) return NotFound("Supplier not found");
            return Ok(dto);
        }

        // POST api/suppliers
        [HttpPost]
        public async Task<ActionResult<SupplierDTO>> Create([FromBody] SupplierDTO dto)
        {
            if (dto == null) return BadRequest("Payload required");
            if (string.IsNullOrWhiteSpace(dto.Name)) return BadRequest("Supplier name required");

            try
            {
                var supplier = new Supplier
                {
                    Name = dto.Name,
                    ContactName = dto.ContactName,
                    Phone = dto.Phone,
                    Email = dto.Email,
                    Address = dto.Address,
                    IsActive = dto.IsActive
                };

                var created = await _service.CreateSupplierAsync(supplier);
                return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Server error: {ex.Message}");
            }
        }

        // PUT api/suppliers/{id}
        [HttpPut("{id}")]
        public async Task<ActionResult<SupplierDTO>> Update(int id, [FromBody] SupplierDTO dto)
        {
            if (dto == null) return BadRequest("Payload required");
            try
            {
                var supplier = new Supplier
                {
                    Id = id,
                    Name = dto.Name,
                    ContactName = dto.ContactName,
                    Phone = dto.Phone,
                    Email = dto.Email,
                    Address = dto.Address,
                    IsActive = dto.IsActive
                };

                var updated = await _service.UpdateSupplierAsync(supplier);
                return Ok(updated);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (Exception)
            {
                return StatusCode(500, "Server error updating supplier");
            }
        }

        // DELETE api/suppliers/{id}
        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var ok = await _service.DeleteSupplierAsync(id);
            if (!ok) return NotFound("Supplier not found");
            return Ok(new { message = "Đã ngừng hoạt động nhà cung cấp." });
        }
    }
}
