using System.ComponentModel.DataAnnotations;

namespace backend.DTO
{
    public class EmployeeDTO
    {
        public int Id { get; set; }

        [Required, MinLength(2), MaxLength(255)]
        public string FullName { get; set; } = string.Empty;

        [MaxLength(200)]
        public string? FamilyMiddleName { get; set; }

        [MaxLength(100)]
        public string? GivenName { get; set; }

        [MaxLength(50)]
        public string? Phone { get; set; }

        [EmailAddress, MaxLength(255)]
        public string? Email { get; set; }
        public DateTime? DateOfBirth { get; set; }

        public string? Address { get; set; }
        public string? Note { get; set; }
        [Range(0, double.MaxValue)]
        public decimal BaseSalary { get; set; }
        public bool IsActive { get; set; } = true;
        public bool HasAccount { get; set; }
        public string? AccountUsername { get; set; }
    }
}
