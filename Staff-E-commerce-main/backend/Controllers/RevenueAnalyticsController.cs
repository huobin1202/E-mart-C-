using backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers;

[ApiController]
[Route("api/revenue-analytics")]
public sealed class RevenueAnalyticsController(RevenueAnalyticsService service) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] int? fromYear, [FromQuery] int? toYear,
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, CancellationToken ct)
    {
        try
        {
            var today = DateTime.Today;
            return Ok(await service.GetAsync(fromYear ?? today.Year, toYear ?? today.Year, from, to, ct));
        }
        catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
    }

    [HttpGet("export/{section}")]
    public async Task<IActionResult> Export(string section, [FromQuery] int? fromYear, [FromQuery] int? toYear,
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, CancellationToken ct)
    {
        try
        {
            var today = DateTime.Today;
            var report = await service.GetAsync(fromYear ?? today.Year, toYear ?? today.Year, from, to, ct);
            var bytes = service.Export(report, section);
            return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"bao-cao-{section}-{DateTime.Now:yyyyMMdd}.xlsx");
        }
        catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
    }
}
