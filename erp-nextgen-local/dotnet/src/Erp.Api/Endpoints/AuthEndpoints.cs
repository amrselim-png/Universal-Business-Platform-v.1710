using Dapper;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Erp.Api.Auth;

namespace Erp.Api.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuthRoutes(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/auth").WithTags("Auth");

        // auth.login — دخول آمن وتوليد التوكن
        group.MapPost("/login", async (
            [FromBody] LoginRequest req,
            [FromServices] ITokenService tokenService,
            [FromServices] NpgsqlDataSource db,
            HttpContext ctx) =>
        {
            await using var conn = await db.OpenConnectionAsync();

            // 1. تحديد المنشأة أولاً (core.tenants غير محمي بـ RLS)
            var tenant = await conn.QuerySingleOrDefaultAsync<(Guid Id, string Code)>(
                "SELECT id, code FROM core.tenants WHERE code = @Code AND status <> 'suspended';",
                new { Code = req.TenantCode });

            if (tenant.Id == Guid.Empty)
                return Results.Unauthorized();

            // 2. ضبط سياق الـ Tenant قبل قراءة core.users لأن RLS مفعّل بـ FORCE
            await conn.ExecuteAsync(
                "SELECT set_config('app.tenant_id', @tenantId::text, false);",
                new { tenantId = tenant.Id.ToString() });

            // 3. قراءة المستخدم
            var user = await conn.QuerySingleOrDefaultAsync<UserAuthDto>(@"
                SELECT id, tenant_id, email, full_name, password_hash, status
                FROM core.users
                WHERE tenant_id = @TenantId
                  AND email = @Email
                  AND deleted_at IS NULL;",
                new { TenantId = tenant.Id, req.Email });

            if (user is null || !PasswordHasher.Verify(req.Password, user.Password_Hash))
                return Results.Unauthorized();

            if (user.Status != "active")
                return Results.Problem("الحساب معطل أو مقفل حالياً", statusCode: StatusCodes.Status403Forbidden);

            // 4. استخراج الصلاحيات والأدوار
            var permissions = (await conn.QueryAsync<string>(@"
                SELECT p.action_code
                FROM core.permissions p
                JOIN core.user_roles ur
                  ON ur.role_id = p.role_id
                 AND ur.tenant_id = p.tenant_id
                WHERE ur.user_id = @UserId
                  AND ur.tenant_id = @TenantId;",
                new { UserId = user.Id, TenantId = tenant.Id })).ToArray();

            var roles = (await conn.QueryAsync<string>(@"
                SELECT r.code
                FROM core.roles r
                JOIN core.user_roles ur
                  ON ur.role_id = r.id
                 AND ur.tenant_id = r.tenant_id
                WHERE ur.user_id = @UserId
                  AND ur.tenant_id = @TenantId;",
                new { UserId = user.Id, TenantId = tenant.Id })).ToArray();

            // 5. توليد التوكنات
            var accessToken = tokenService.GenerateAccessToken(user, permissions, roles);
            var refreshToken = await tokenService.CreateRefreshTokenAsync(tenant.Id, user.Id, conn);

            ctx.Response.Cookies.Append("erp_refresh", refreshToken, new CookieOptions
            {
                HttpOnly = true,
                // على localhost بدون HTTPS يجب تعطيل Secure وإلا لن يُحفظ الكوكي
                Secure = ctx.Request.IsHttps,
                SameSite = SameSiteMode.Strict,
                Expires = DateTimeOffset.UtcNow.AddDays(7)
            });

            await conn.ExecuteAsync(
                "UPDATE core.users SET last_login_at = clock_timestamp() WHERE tenant_id = @TenantId AND id = @Id;",
                new { TenantId = tenant.Id, user.Id });

            return Results.Ok(new LoginResponse(
                accessToken,
                tokenService.GetExpiry(),
                new UserInfo(user.Id, tenant.Id, user.Email, user.Full_Name, permissions.Length)));
        })
        .WithName("auth.login")
        .WithSummary("تسجيل الدخول وتوليد Access Token + Refresh Cookie");

        // auth.logout — إلغاء الجلسة
        group.MapPost("/logout", async (
            [FromServices] ITokenService tokenService,
            [FromServices] NpgsqlDataSource db,
            HttpContext ctx) =>
        {
            if (ctx.Request.Cookies.TryGetValue("erp_refresh", out var refreshToken))
            {
                await tokenService.RevokeRefreshTokenAsync(refreshToken, db);
                ctx.Response.Cookies.Delete("erp_refresh");
            }

            return Results.Ok(new { message = "تم تسجيل الخروج بنجاح" });
        })
        .WithName("auth.logout")
        .WithSummary("إلغاء الـ Refresh Token وإنهاء الجلسة");
    }
}
