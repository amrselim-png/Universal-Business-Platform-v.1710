using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Dapper;
using Microsoft.IdentityModel.Tokens;
using Npgsql;

namespace Erp.Api.Auth;

public interface ITokenService
{
    string GenerateAccessToken(UserAuthDto user, IEnumerable<string> permissions, string[] roles);
    DateTimeOffset GetExpiry();
    Task<string> CreateRefreshTokenAsync(Guid tenantId, Guid userId, NpgsqlConnection connection);
    Task RevokeRefreshTokenAsync(string refreshToken, NpgsqlDataSource db);
}

public sealed class TokenService(IConfiguration configuration) : ITokenService
{
    private readonly string _issuer = configuration["Jwt:Issuer"] ?? "erp-nextgen";
    private readonly string _audience = configuration["Jwt:Audience"] ?? "erp-nextgen-clients";
    private readonly string _signingKey = configuration["Jwt:SigningKey"]
        ?? throw new InvalidOperationException("Jwt:SigningKey غير مضبوط في appsettings.json");
    private readonly int _accessTokenMinutes = int.TryParse(configuration["Jwt:AccessTokenMinutes"], out var m) ? m : 15;

    public string GenerateAccessToken(UserAuthDto user, IEnumerable<string> permissions, string[] roles)
    {
        var now = DateTime.UtcNow;

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            // الـ Claims التالية هي التي تقرأها سياسات الـ RLS عبر app.tenant_id
            new("tenant_id", user.Tenant_Id.ToString()),
            new("user_id", user.Id.ToString()),
            new("full_name", user.Full_Name)
        };

        claims.AddRange(roles.Select(r => new Claim(ClaimTypes.Role, r)));
        claims.AddRange(permissions.Select(p => new Claim("perm", p)));

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_signingKey)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            notBefore: now,
            expires: now.AddMinutes(_accessTokenMinutes),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public DateTimeOffset GetExpiry() => DateTimeOffset.UtcNow.AddMinutes(_accessTokenMinutes);

    /// <summary>
    /// ينشئ Refresh Token عشوائياً ويخزّن هاشه فقط (SHA-256) في core.refresh_tokens.
    /// family_id يسمح بكشف إعادة استخدام توكن مسروق وإبطال العائلة بالكامل.
    /// </summary>
    public async Task<string> CreateRefreshTokenAsync(Guid tenantId, Guid userId, NpgsqlConnection connection)
    {
        var rawToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
        var tokenHash = HashToken(rawToken);
        var familyId = Guid.NewGuid();

        await connection.ExecuteAsync(@"
            INSERT INTO core.refresh_tokens
                (tenant_id, user_id, token_hash, family_id, expires_at)
            VALUES
                (@tenantId, @userId, @tokenHash, @familyId, clock_timestamp() + interval '7 days');",
            new { tenantId, userId, tokenHash, familyId });

        return rawToken;
    }

    public async Task RevokeRefreshTokenAsync(string refreshToken, NpgsqlDataSource db)
    {
        await using var connection = await db.OpenConnectionAsync();
        await connection.ExecuteAsync(@"
            UPDATE core.refresh_tokens
               SET revoked_at = clock_timestamp()
             WHERE token_hash = @tokenHash
               AND revoked_at IS NULL;",
            new { tokenHash = HashToken(refreshToken) });
    }

    private static string HashToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
