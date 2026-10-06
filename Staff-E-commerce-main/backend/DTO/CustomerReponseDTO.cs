namespace backend.DTO
{
    public class CustomerResponseDTO
    {
        public int Id { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string Phone { get; set; } = string.Empty;

        public string? Email { get; set; }
        public string? Address { get; set; }

        public bool IsActive { get; set; }
        public int RewardPoints { get; set; } = 0;

        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }
}