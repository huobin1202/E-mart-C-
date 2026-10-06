namespace backend.DTO
{
    public class CustomerDTO
    {
        public int Id { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string? Phone { get; set; }
        public string? Email { get; set; }
        public string? Address { get; set; }
        public int RewardPoints { get; set; } = 0;
    }
}
