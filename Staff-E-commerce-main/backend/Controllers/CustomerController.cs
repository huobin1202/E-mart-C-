using Microsoft.AspNetCore.Mvc;
using backend.Services;
using backend.DTO;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CustomersController : ControllerBase
    {
        private readonly CustomerService _service;

        public CustomersController(CustomerService service)
        {
            _service = service;
        }

        // GET api/customers/paginated?page=1&pageSize=10
        [HttpGet("paginated")]
        public async Task<ActionResult> GetPaginated(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10)
        {
            var (items, totalPages) = await _service.GetPaginatedAsync(page, pageSize);
            return Ok(new { items, totalPages });
        }

        // GET api/customers/search?keyword=...
        [HttpGet("search")]
        public async Task<ActionResult> Search([FromQuery] string keyword)
        {
            if (string.IsNullOrWhiteSpace(keyword))
                return BadRequest("Keyword is required");

            var items = await _service.SearchByNameAsync(keyword);
            return Ok(items);
        }

        //GET api/customers?page=1&pageSize=10&keyword=
        [HttpGet("")]
        public async Task<ActionResult> GetFilteredAndPaginatedCustomers(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10,
            [FromQuery] string? keyword = null,
            [FromQuery] string? status = null)
        {
            var result = await _service.GetFilteredAndPaginatedAsync(page, pageSize, keyword, status);
            return Ok(result);
        }

        [HttpGet("{id:int}")]
        public async Task<ActionResult> GetCustomerById(int id)
        {
            var result = await _service.GetCustomerByIdAsync(id);
            if (!result.Success && result.StatusCode == 404)
            {
                return NotFound(result.Errors);
            }
            return Ok(result.Data);
        }

        // POST api/customers
        [HttpPost("")]
        public async Task<ActionResult> CreateCustomer([FromBody] CustomerCreateDTO createDto)
        {
            var result = await _service.CreateCustomerAsync(createDto);
            if (!result.Success && result.StatusCode == 409)
            {
                return Conflict(result.Errors);
            }
            return StatusCode(201, result.Data);
        }

        // PATCH api/customers/{id}
        [HttpPatch("{id:int}")]
        public async Task<ActionResult> UpdateCustomer(int id, [FromBody] CustomerUpdateDTO updateDto)
        {
            var result = await _service.UpdateCustomerAsync(id, updateDto);
            if (!result.Success && result.StatusCode == 404)
            {
                return NotFound(result.Errors);
            }
            return Ok(result.Data);
        }

        // PUT api/customers/{id}
        [HttpPut("{id:int}")]
        public async Task<ActionResult> UpdateActiveCustomer(int id, [FromBody] CustomerUpdateActiveDTO activeDto)
        {
            Console.WriteLine($"[CONTROLLER] UpdateActiveCustomerAsync called with id={id}, isActive={activeDto.IsActive}");
            var result = await _service.UpdateActiveCustomerAsync(id, activeDto.IsActive);
            if (!result.Success && result.StatusCode == 404)
            {
                return NotFound(result.Errors);
            }
            return Ok(result.Data);
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> DeleteCustomer(int id)
        {
            if (await _service.HasLoginAccountAsync(id))
                return Conflict(new { message = "Không thể xóa khách hàng đang có tài khoản đăng nhập. Hãy chuyển trạng thái khách hàng sang Không hoạt động để khóa đăng nhập và giữ nguyên lịch sử." });

            try
            {
                if (!await _service.DeleteCustomerAsync(id))
                    return NotFound(new { message = "Không tìm thấy khách hàng." });
                return NoContent();
            }
            catch (DbUpdateException)
            {
                return Conflict(new { message = "Không thể xóa khách hàng vì hồ sơ đang được dữ liệu nghiệp vụ khác tham chiếu." });
            }
        }
    }
}
