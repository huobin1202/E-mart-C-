using Microsoft.AspNetCore.Mvc;
using backend.DTO;
using backend.Models;
using backend.Services;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CategoriesController : ControllerBase
    {
        private readonly CategoryService _service;

        public CategoriesController(CategoryService service)
        {
            _service = service;
        }

        // GET api/categories?page=1&pageSize=10&keyword=...&status=active
        [HttpGet("")]
        public async Task<ActionResult> GetFilteredAndPaginatedCategories(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10,
            [FromQuery] string? keyword = null,
            [FromQuery] string? status = null)
        {
            var result = await _service.GetFilteredAndPaginatedAsync(page, pageSize, keyword, status);
            return Ok(result);
        }

        // GET api/categories/{id}
        [HttpGet("{id:int}")]
        public async Task<ActionResult> GetCategoryById(int id)
        {
            var result = await _service.GetCategoryByIdAsync(id);
            if (!result.Success && result.StatusCode == 404)
            {
                return NotFound(result.Errors);
            }
            return Ok(result.Data);
        }

        // POST api/categories
        [HttpPost("")]
        public async Task<ActionResult> CreateNewCategory([FromBody] CategoryCreateDTO createDto)
        {
            var result = await _service.CreateCategoryWithDtoAsync(createDto);
            if (!result.Success && result.StatusCode == 409)
            {
                return Conflict(result.Errors);
            }
            return StatusCode(201, result.Data);
        }

        // PATCH api/categories/{id}
        [HttpPatch("{id:int}")]
        public async Task<ActionResult> UpdateCategoryInfo(int id, [FromBody] CategoryUpdateDTO updateDto)
        {
            var result = await _service.UpdateCategoryWithDtoAsync(id, updateDto);
            if (!result.Success && result.StatusCode == 404)
            {
                return NotFound(result.Errors);
            }
            if (!result.Success && result.StatusCode == 409)
            {
                return Conflict(result.Errors);
            }
            if (!result.Success)
            {
                return BadRequest(result.Errors);
            }
            return Ok(result.Data);
        }

        // PUT api/categories/{id}
        [HttpPut("{id:int}")]
        public async Task<ActionResult> UpdateActiveCategoryStatus(int id, [FromBody] CategoryUpdateActiveDTO activeDto)
        {
            var result = await _service.UpdateActiveCategoryAsync(id, activeDto.IsActive);
            if (!result.Success && result.StatusCode == 404)
            {
                return NotFound(result.Errors);
            }
            return Ok(result.Data);
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> DeleteCategory(int id)
        {
            if (!await _service.DeleteCategoryAsync(id))
                return NotFound(new { message = "Không tìm thấy danh mục." });
            return NoContent();
        }

        // GET api/categories/paginated (endpoint cũ - giữ lại cho backward compatibility)
        [HttpGet("paginated")]
        public async Task<ActionResult<PaginationResult<CategoryDTO>>> GetPaginated(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 12,
            [FromQuery] string? search = null)
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 200) pageSize = 12;

            var result = await _service.GetPaginatedAsync(page, pageSize, search);
            return Ok(result);
        }

        // GET api/categories/all (đổi routing để tránh conflict)
        [HttpGet("all")]
        public async Task<ActionResult<IEnumerable<CategoryDTO>>> GetAll()
        {
            var list = await _service.GetAllAsync();
            return Ok(list);
        }
    }
}
