using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using backend.Models;

namespace backend.Services
{
    public class JwtService
    {
        private readonly IConfiguration _config;
        public JwtService(IConfiguration config) => _config = config;

        public (string token, int? expiresIn) GenerateToken(User user)
        {
            var claims = new List<Claim>
            {
                new Claim(JwtRegisteredClaimNames.Sub, user.Username),
                new Claim("uid", user.Id.ToString()),
                new Claim("session_version", user.SessionVersion.ToString()),
                new Claim(ClaimTypes.Name, user.Username),
                new Claim(ClaimTypes.Role, user.RoleEntity?.Name ?? string.Empty)
            };

            if (user.CustomerId.HasValue)
                claims.Add(new Claim("customer_id", user.CustomerId.Value.ToString()));

            return GenerateToken(claims);
        }

        public (string token, int? expiresIn) GenerateCustomerToken(Customer customer)
        {
            var claims = new List<Claim>
            {
                new Claim(JwtRegisteredClaimNames.Sub, customer.Phone ?? customer.Id.ToString()),
                new Claim("customer_id", customer.Id.ToString()),
                new Claim(ClaimTypes.Name, customer.Phone ?? customer.Id.ToString()),
                new Claim(ClaimTypes.Role, "customer")
            };

            return GenerateToken(claims);
        }

        private (string token, int? expiresIn) GenerateToken(IEnumerable<Claim> claims)
        {
            var key = _config["Jwt:Key"] ?? throw new Exception("Jwt:Key missing");
            var issuer = _config["Jwt:Issuer"];
            var audience = _config["Jwt:Audience"];
            var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
            var creds = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);
            // Sessions remain valid until sign-out or account/session revocation.
            // This policy is independent of the BUS data-cache TTL.
            var token = new JwtSecurityToken(issuer, audience, claims, signingCredentials: creds);
            return (new JwtSecurityTokenHandler().WriteToken(token), null);
        }
    }
}
