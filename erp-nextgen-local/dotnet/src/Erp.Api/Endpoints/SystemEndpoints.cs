using Dapper;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Erp.Common.Metadata;

namespace Erp.Api.Endpoints;

/// <summary>
/// نقاط نهاية تشخيصية: صحّة النظام، عرض الجداول الحقيقية، الكيانات المسجّلة،
/// وسجل الأفعال (Action Registry). مفيدة جداً أثناء التطوير المحلي.
/// </summary>
public static class SystemEndpoints
{
    public static void MapSystemRoutes(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/system").WithTags("System");

        // 1. فحص الاتصال بقاعدة البيانات
        group.MapGet("/health", async ([FromServices] NpgsqlDataSource db) =>
        {
            try
            {
                await using var conn = await db.OpenConnectionAsync();
                var version = await conn.ExecuteScalarAsync<string>("SELECT version();");
                var migrations = await conn.ExecuteScalarAsync<int>(
                    "SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'core';");

                return Results.Ok(new
                {
                    status = "healthy",
                    database = "connected",
                    postgresVersion = version?.Split(' ').FirstOrDefault(),
                    coreTables = migrations,
                    utcNow = DateTimeOffset.UtcNow
                });
            }
            catch (Exception ex)
            {
                return Results.Json(new
                {
                    status = "unhealthy",
                    database = "unreachable",
                    error = ex.Message
                }, statusCode: StatusCodes.Status503ServiceUnavailable);
            }
        })
        .AllowAnonymous()
        .WithSummary("فحص الاتصال بقاعدة البيانات");

        // 2. عرض كل الجداول الحقيقية في قاعدة البيانات
        group.MapGet("/tables", async ([FromServices] NpgsqlDataSource db) =>
        {
            await using var conn = await db.OpenConnectionAsync();

            var tables = await conn.QueryAsync(@"
                SELECT t.table_schema AS ""schema"",
                       t.table_name   AS ""table"",
                       (SELECT count(*) FROM information_schema.columns c
                         WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) AS ""columns"",
                       t.table_type   AS ""type""
                FROM information_schema.tables t
                WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
                ORDER BY t.table_schema, t.table_name;");

            var bySchema = tables
                .GroupBy(t => (string)t.schema)
                .Select(g => new { schema = g.Key, count = g.Count(), tables = g.Select(x => x.table) })
                .ToArray();

            return Results.Ok(new { totalTables = tables.Count(), schemas = bySchema, all = tables });
        })
        .AllowAnonymous()
        .WithSummary("عرض كل الجداول الموجودة في قاعدة البيانات");

        // 3. الكيانات المسجّلة في الـ Metadata Registry
        group.MapGet("/entities", ([FromServices] IMetadataRegistry metadata) =>
            Results.Ok(metadata.All.Select(e => new
            {
                code = e.Code,
                table = e.FullTableName,
                displayNameAr = e.DisplayNameAr,
                columnCount = e.Columns.Count,
                writableColumns = e.WritableColumns.Select(c => c.Name)
            })))
            .AllowAnonymous()
            .WithSummary("الكيانات المتاحة عبر الـ Generic Data API");

        // 4. سجل الأفعال (Action Registry)
        group.MapGet("/actions", async ([FromServices] NpgsqlDataSource db) =>
        {
            await using var conn = await db.OpenConnectionAsync();
            var actions = await conn.QueryAsync(@"
                SELECT a.code AS ""code"", a.module_code AS ""module"",
                       a.label_ar AS ""labelAr"", a.type AS ""type"",
                       a.default_scope AS ""defaultScope""
                FROM core.actions a
                ORDER BY a.module_code, a.code;");
            return Results.Ok(new { count = actions.Count(), actions });
        })
        .AllowAnonymous()
        .WithSummary("كل الأزرار/الأفعال المسجّلة في النظام");
    }
}
