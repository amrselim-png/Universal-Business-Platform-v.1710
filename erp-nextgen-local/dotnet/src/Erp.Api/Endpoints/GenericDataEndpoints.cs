using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Erp.Common.Metadata;
using Erp.Common.Security;

namespace Erp.Api.Endpoints;

/// <summary>
/// الـ Generic Data API: نقطة نهاية واحدة تخدم كل الكيانات المسجّلة في الـ Metadata.
/// هذه هي الفكرة التي تُلغي كتابة شاشات CRUD يدوياً.
/// </summary>
public static class GenericDataEndpoints
{
    public static void MapGenericDataRoutes(this IEndpointRouteBuilder app)
    {
        // ندعم الصيغتين: /api/v1/generic/core.branch  و  /api/v1/generic/core/branch
        MapFor(app, "/api/v1/generic/{module}.{entity}");
        MapFor(app, "/api/v1/generic/{module}/{entity}");
    }

    private static void MapFor(IEndpointRouteBuilder app, string pattern)
    {
        var group = app.MapGroup(pattern)
            .RequireAuthorization()
            .WithTags("Generic Data");

        group.MapGet("", ReadRecords)
            .RequireAction("generic.record.read")
            .AddEndpointFilter<RequireActionFilter>()
            .WithSummary("قراءة السجلات بـ Keyset Pagination (O(1) بدون OFFSET)");

        group.MapPut("", UpdateRecord)
            .RequireAction("generic.record.save")
            .AddEndpointFilter<RequireActionFilter>()
            .WithSummary("تحديث سجل مع Optimistic Concurrency عبر عمود version");

        group.MapDelete("", SoftDeleteRecord)
            .RequireAction("generic.record.delete")
            .AddEndpointFilter<RequireActionFilter>()
            .WithSummary("حذف ناعم (Soft Delete) مع فحص الارتباطات");
    }

    // ---------------------------------------------------------------
    // GET — Keyset Pagination
    // ---------------------------------------------------------------
    private static async Task<IResult> ReadRecords(
        string module,
        string entity,
        [FromQuery] DateTime? afterDate,
        [FromQuery] Guid? afterId,
        [FromQuery] int? limit,
        [FromServices] IMetadataRegistry metadata,
        [FromServices] NpgsqlDataSource dataSource,
        HttpContext ctx)
    {
        var tenantId = ctx.User.GetTenantId();
        var target = metadata.GetEntity(module, entity);
        var take = Math.Clamp(limit ?? 50, 1, 200);

        await using var conn = await dataSource.OpenConnectionAsync();
        await SetSessionContextAsync(conn, tenantId, ctx.User.GetUserId(), ctx);

        // أعمدة صريحة (لا SELECT *) — يسمح باستخدام Covering Index
        var selectList = target.BuildSelectList();

        var sql = $"""
            SELECT {selectList}
            FROM {target.QualifiedTableName}
            WHERE tenant_id = @tenantId
              AND deleted_at IS NULL
              AND (
                    (@afterDate)::timestamptz IS NULL
                    OR (created_at, id) < ((@afterDate)::timestamptz, (@afterId)::uuid)
                  )
            ORDER BY created_at DESC, id DESC
            LIMIT @limit;
            """;

        var rows = (await conn.QueryAsync(sql,
            new { tenantId, afterDate, afterId, limit = take })).ToArray();

        return Results.Ok(new
        {
            entity = target.Code,
            table = target.FullTableName,
            count = rows.Length,
            limit = take,
            hasMore = rows.Length == take,
            items = rows
        });
    }

    // ---------------------------------------------------------------
    // PUT — Optimistic Concurrency
    // ---------------------------------------------------------------
    private static async Task<IResult> UpdateRecord(
        string module,
        string entity,
        [FromBody] JsonElement payload,
        [FromServices] IMetadataRegistry metadata,
        [FromServices] NpgsqlDataSource dataSource,
        HttpContext ctx)
    {
        var tenantId = ctx.User.GetTenantId();
        var userId = ctx.User.GetUserId();
        var target = metadata.GetEntity(module, entity);

        if (!payload.TryGetProperty("id", out var idElement) ||
            !payload.TryGetProperty("version", out var versionElement))
        {
            return Results.BadRequest(new { error = "الحقول id و version مطلوبة في جسم الطلب." });
        }

        var id = idElement.GetGuid();
        var clientVersion = versionElement.GetInt32();

        var (assignments, parameters) = target.BuildUpdateAssignments(payload);
        parameters.Add("id", id);
        parameters.Add("tenantId", tenantId);
        parameters.Add("clientVersion", clientVersion);
        parameters.Add("userId", userId);

        var sql = $"""
            UPDATE {target.QualifiedTableName}
               SET {assignments},
                   version    = version + 1,
                   updated_at = clock_timestamp(),
                   updated_by = @userId
             WHERE id = @id
               AND tenant_id = @tenantId
               AND version = @clientVersion
               AND deleted_at IS NULL
            RETURNING version;
            """;

        await using var conn = await dataSource.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();
        await SetSessionContextAsync(conn, tenantId, userId, ctx, tx);

        var newVersion = await conn.ExecuteScalarAsync<int?>(sql, parameters, tx);

        if (newVersion is null)
        {
            await tx.RollbackAsync();
            return Results.Conflict(new
            {
                error = "DbConcurrencyException",
                message = "السجل تم تعديله من مشغل آخر، يرجى تحديث الشاشة.",
                expectedVersion = clientVersion
            });
        }

        await tx.CommitAsync();
        return Results.Ok(new { success = true, id, version = newVersion.Value });
    }

    // ---------------------------------------------------------------
    // DELETE — Soft Delete
    // ---------------------------------------------------------------
    private static async Task<IResult> SoftDeleteRecord(
        string module,
        string entity,
        [FromQuery] Guid id,
        [FromQuery] int? version,
        [FromServices] IMetadataRegistry metadata,
        [FromServices] NpgsqlDataSource dataSource,
        HttpContext ctx)
    {
        var tenantId = ctx.User.GetTenantId();
        var userId = ctx.User.GetUserId();
        var target = metadata.GetEntity(module, entity);

        var sql = $"""
            UPDATE {target.QualifiedTableName}
               SET deleted_at = clock_timestamp(),
                   updated_at = clock_timestamp(),
                   updated_by = @userId,
                   version    = version + 1
             WHERE id = @id
               AND tenant_id = @tenantId
               AND deleted_at IS NULL
               AND (@version = 0 OR version = @version)
            RETURNING version;
            """;

        await using var conn = await dataSource.OpenConnectionAsync();
        await SetSessionContextAsync(conn, tenantId, userId, ctx);

        var newVersion = await conn.ExecuteScalarAsync<int?>(sql,
            new { id, tenantId, userId, version = version ?? 0 });

        return newVersion is null
            ? Results.NotFound(new { error = "السجل غير موجود أو تم تعديله من مشغل آخر." })
            : Results.Ok(new { success = true, id, version = newVersion.Value, softDeleted = true });
    }

    /// <summary>
    /// ضبط متغيرات جلسة PostgreSQL التي تعتمد عليها سياسات الـ RLS والـ Triggers.
    /// يجب أن تُنفَّذ على نفس الاتصال ونفس المعاملة قبل أي استعلام.
    /// </summary>
    private static async Task SetSessionContextAsync(
        NpgsqlConnection conn,
        Guid tenantId,
        Guid userId,
        HttpContext ctx,
        System.Data.Common.DbTransaction? tx = null)
    {
        const string sql = """
            SELECT set_config('app.tenant_id',  @tenantId::text,  false);
            SELECT set_config('app.user_id',    @userId::text,    false);
            SELECT set_config('app.request_id', @correlationId,   false);
            SELECT set_config('app.client_ip',  @clientIp,        false);
            """;

        await conn.ExecuteAsync(sql, new
        {
            tenantId = tenantId.ToString(),
            userId = userId.ToString(),
            correlationId = ctx.Items["CorrelationId"]?.ToString() ?? string.Empty,
            clientIp = ctx.Connection.RemoteIpAddress?.ToString() ?? string.Empty
        }, tx);
    }
}
