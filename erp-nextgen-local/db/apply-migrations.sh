#!/usr/bin/env bash
# =====================================================================
# apply-migrations.sh — تطبيق كل ملفات الـ SQL على قاعدة البيانات (Linux/macOS)
# الاستخدام:
#     chmod +x db/apply-migrations.sh
#     ./db/apply-migrations.sh
# =====================================================================
set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-erp}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_DIR="$SCRIPT_DIR/migrations"

if ! command -v psql >/dev/null 2>&1; then
  echo "خطأ: psql غير موجود. ثبّت PostgreSQL client أولاً."
  exit 1
fi

export PGPASSWORD="$DB_PASSWORD"

echo "=== ERP NextGen — تطبيق الـ Migrations ==="

if [ "$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tAc \
        "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME';")" != "1" ]; then
  echo "إنشاء قاعدة البيانات '$DB_NAME'..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"
fi

ok=0; failed=0
for file in $(ls "$MIGRATION_DIR"/*.sql | sort); do
  printf '  %-52s' "$(basename "$file")"
  if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
          -v ON_ERROR_STOP=1 -q -f "$file" >/dev/null 2>&1; then
    echo "OK"
    ok=$((ok + 1))
  else
    echo "FAIL"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
         -v ON_ERROR_STOP=1 -q -f "$file" 2>&1 | tail -5
    failed=$((failed + 1))
  fi
done

echo
echo "النتيجة: $ok ناجح / $failed فاشل"
[ "$failed" -eq 0 ] && echo "لعرض الجداول: psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f db/verify.sql"
