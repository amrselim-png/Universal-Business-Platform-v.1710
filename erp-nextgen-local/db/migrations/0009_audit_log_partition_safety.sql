-- 0009_audit_log_partition_safety.sql
-- أمان البارتشنات لسجل التدقيق
-- ---------------------------------------------------------------------
-- المخطط الأصلي ينشئ بارتشنين فقط: 2026-10 و 2026-11.
-- أي إدراج في core.audit_log بتاريخ خارج هذين الشهرين يفشل بالخطأ:
--     ERROR: no partition of relation "audit_log" found for row
-- وبما أن كل INSERT/UPDATE/DELETE على core.branches و core.users يُطلق
-- trigger تدقيق، فإن التطبيق سيتعطل تماماً بعد 2026-12-01.
--
-- الحل: بارتشن افتراضي (DEFAULT) + دالة لتوليد بارتشنات شهرية تلقائياً.
-- ---------------------------------------------------------------------

-- 1. بارتشن افتراضي يمنع فشل الإدراج في أي تاريخ
CREATE TABLE IF NOT EXISTS core.audit_log_default PARTITION OF core.audit_log DEFAULT;

-- 2. دالة توليد بارتشن شهري (تُستدعى من Job مجدول)
CREATE OR REPLACE FUNCTION core.ensure_audit_partition(p_month date)
RETURNS text AS $$
DECLARE
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name  text := format('audit_log_%s', to_char(v_start, 'YYYY_MM'));
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS core.%I PARTITION OF core.audit_log FOR VALUES FROM (%L) TO (%L);',
    v_name, v_start, v_end
  );
  RETURN v_name;
END;
$$ LANGUAGE plpgsql;

-- 3. توليد بارتشنات للشهر الحالي والشهرين القادمين
SELECT core.ensure_audit_partition(CURRENT_DATE);
SELECT core.ensure_audit_partition((CURRENT_DATE + interval '1 month')::date);
SELECT core.ensure_audit_partition((CURRENT_DATE + interval '2 months')::date);
