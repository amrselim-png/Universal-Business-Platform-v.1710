namespace Erp.Api.Auth;

/// <summary>جسم طلب تسجيل الدخول.</summary>
public sealed record LoginRequest(string TenantCode, string Email, string Password);

/// <summary>صف المستخدم كما يُقرأ من core.users (أسماء الأعمدة snake_case).</summary>
public sealed class UserAuthDto
{
    public Guid Id { get; init; }
    public Guid Tenant_Id { get; init; }
    public string Email { get; init; } = string.Empty;
    public string Full_Name { get; init; } = string.Empty;
    public string Password_Hash { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
}

/// <summary>نتيجة تسجيل الدخول.</summary>
public sealed record LoginResponse(
    string Token,
    DateTimeOffset ExpiresAt,
    UserInfo User);

public sealed record UserInfo(
    Guid Id,
    Guid TenantId,
    string Email,
    string FullName,
    int PermissionCount);
