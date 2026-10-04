using backend.DTO;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers;

[ApiController]
[Route("api/purchase-orders")]
public class PurchaseOrdersController : ControllerBase
{
    private readonly PurchaseOrderService _service;
    public PurchaseOrdersController(PurchaseOrderService service) => _service = service;

    [HttpGet]
    public async Task<ActionResult<PaginationResult<PurchaseOrderListDTO>>> GetPaged([FromQuery] int page = 1, [FromQuery] int pageSize = 10, [FromQuery] string? search = null, [FromQuery] string? status = null, [FromQuery] int? supplierId = null)
    {
        return Ok(await _service.GetPagedAsync(Math.Max(page, 1), Math.Clamp(pageSize, 1, 100), search, status, supplierId));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<PurchaseOrderDetailDTO>> GetById(int id)
    {
        var result = await _service.GetByIdAsync(id);
        return result == null ? NotFound(new { message = "Không tìm thấy phiếu nhập." }) : Ok(result);
    }

    [HttpPost]
    public async Task<ActionResult<PurchaseOrderDetailDTO>> Create([FromBody] PurchaseOrderCreateDTO request)
    {
        try { var created = await _service.CreateAsync(request); return CreatedAtAction(nameof(GetById), new { id = created.Id }, created); }
        catch (ArgumentException exception) { return BadRequest(new { message = exception.Message }); }
    }

    [HttpPost("{id:int}/complete")]
    public Task<ActionResult<PurchaseOrderDetailDTO>> Complete(int id) => ExecuteTransition(() => _service.CompleteAsync(id));

    [HttpPost("{id:int}/cancel")]
    public Task<ActionResult<PurchaseOrderDetailDTO>> Cancel(int id) => ExecuteTransition(() => _service.CancelAsync(id));

    private async Task<ActionResult<PurchaseOrderDetailDTO>> ExecuteTransition(Func<Task<PurchaseOrderDetailDTO>> operation)
    {
        try { return Ok(await operation()); }
        catch (KeyNotFoundException exception) { return NotFound(new { message = exception.Message }); }
        catch (InvalidOperationException exception) { return Conflict(new { message = exception.Message }); }
    }
}
