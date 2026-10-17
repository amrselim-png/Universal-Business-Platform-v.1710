# =====================================================================
# apply-migrations.ps1 — تطبيق كل ملفات الـ SQL على قاعدة البيانات
# ---------------------------------------------------------------------
# الاستخدام (من مجلد المشروع):
#     powershell -ExecutionPolicy Bypass -File db\apply-migrations.ps1
#
# أو بمعاملات مخصصة:
#     .\db\apply-migrations.ps1 -Port 5433 -Database erp -Password mypass
# =====================================================================
param(
    [string]$DbHost = "localhost",
    [int]$Port = 5432,
    [string]$Database = "erp",
    [string]$DbUser = "postgres",
    [string]$DbPassword = "postgres"
)

$ErrorActionPreference = "Stop"

Write-Host "=== ERP NextGen — تطبيق الـ Migrations ===" -ForegroundColor Cyan

# --- 1. إيجاد psql.exe -------------------------------------------------
$psql = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psql) {
    $found = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
             Sort-Object FullName -Descending
    if ($found) { $psql = $found[0].FullName }
}
if (-not $psql) {
    Write-Host "خطأ: لم يتم العثور على psql.exe" -ForegroundColor Red
    Write-Host "الحل: أضف مجلد bin الخاص بـ PostgreSQL إلى PATH، مثال:" -ForegroundColor Yellow
    Write-Host '  $env:Path += ";C:\Program Files\PostgreSQL\17\bin"' -ForegroundColor Yellow
    exit 1
}
Write-Host "psql: $psql" -ForegroundColor DarkGray

# --- 2. كلمة المرور ----------------------------------------------------
$env:PGPASSWORD = $DbPassword

# --- 3. إنشاء قاعدة البيانات إذا لم تكن موجودة ------------------------
$exists = & $psql -h $DbHost -p $Port -U $DbUser -d postgres -tAc `
          "SELECT 1 FROM pg_database WHERE datname = '$Database';"
if ($exists -ne "1") {
    Write-Host "إنشاء قاعدة البيانات '$Database'..." -ForegroundColor Yellow
    & $psql -h $DbHost -p $Port -U $DbUser -d postgres -c "CREATE DATABASE $Database;"
}
else {
    Write-Host "قاعدة البيانات '$Database' موجودة بالفعل." -ForegroundColor DarkGray
}

# --- 4. تطبيق الملفات بالترتيب ----------------------------------------
$migrationDir = Join-Path $PSScriptRoot "migrations"
$files = Get-ChildItem -Path $migrationDir -Filter "*.sql" | Sort-Object Name

$ok = 0; $failed = 0
foreach ($file in $files) {
    Write-Host -NoNewline ("  {0,-52}" -f $file.Name)
    $output = & $psql -h $DbHost -p $Port -U $DbUser -d $Database `
                      -v ON_ERROR_STOP=1 -q -f $file.FullName 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK" -ForegroundColor Green
        $ok++
    }
    else {
        Write-Host "FAIL" -ForegroundColor Red
        Write-Host ($output | Out-String) -ForegroundColor Red
        $failed++
    }
}

Write-Host ""
Write-Host "النتيجة: $ok ناجح / $failed فاشل" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })

if ($failed -eq 0) {
    Write-Host ""
    Write-Host "لمشاهدة الجداول، شغّل:" -ForegroundColor Cyan
    Write-Host "  psql -h $DbHost -p $Port -U $DbUser -d $Database -f db\verify.sql" -ForegroundColor Yellow
}
