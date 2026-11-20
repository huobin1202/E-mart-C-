using System.ComponentModel.DataAnnotations;

namespace backend.DTO
{
    public class CustomerUpdateDTO
    {
        [MaxLength(150, ErrorMessage = "Họ tên tối đa 150 ký tự.")]
        [MinLength(3, ErrorMessage = "Họ tên phải có ít nhất 3 ký tự.")]
        [RegularExpression(@"^[\p{L}\p{M}\s'.-]+$", ErrorMessage = "Họ tên chỉ được chứa chữ cái và khoảng trắng.")]
        public string? FullName { get; set; }

        [RegularExpression("^(0|\\+84)[35789]\\d{8}$", ErrorMessage = "Số điện thoại không hợp lệ.")]
        public string? Phone { get; set; }

        [EmailAddress(ErrorMessage = "Email không hợp lệ.")]
        public string? Email { get; set; }

        [MaxLength(250, ErrorMessage = "Địa chỉ tối đa 250 ký tự.")]
        public string? Address { get; set; }
    }
}