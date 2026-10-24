namespace backend.DTO;

public sealed class UserAccessDTO
{
    public string Role { get; set; } = string.Empty;
    public List<string> Permissions { get; set; } = new();
}
