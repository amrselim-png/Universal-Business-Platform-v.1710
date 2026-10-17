-- =====================================================================
-- verify.sql — استعلامات لعرض الجداول والتحقق من نجاح التثبيت
-- شغّله في pgAdmin أو DBeaver أو من سطر الأوامر:
--     psql -h localhost -U postgres -d erp -f db/verify.sql
-- =====================================================================

\echo '=== 1. كل الجداول في قاعدة البيانات ==='
SELECT table_schema AS "المخطط",
       table_name   AS "الجدول",
       (SELECT count(*) FROM information_schema.columns c
         WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) AS "عدد_الأعمدة"
FROM information_schema.tables t
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY 1, 2;

\echo ''
\echo '=== 2. عدد الصفوف في كل جدول من جداول core ==='
SELECT relname AS "الجدول", n_live_tup AS "عدد_الصفوف"
FROM pg_stat_user_tables
WHERE schemaname = 'core'
ORDER BY relname;

\echo ''
\echo '=== 3. حالة Row-Level Security (عزل المستأجرين) ==='
SELECT tablename AS "الجدول",
       rowsecurity AS "RLS_مفعّل",
       forcerowsecurity AS "RLS_إجباري"
FROM pg_tables
WHERE schemaname = 'core'
ORDER BY tablename;

\echo ''
\echo '=== 4. سياسات العزل ==='
SELECT tablename AS "الجدول", policyname AS "السياسة", cmd AS "العملية"
FROM pg_policies
WHERE schemaname = 'core'
ORDER BY tablename;

\echo ''
\echo '=== 5. أدوار قاعدة البيانات ==='
SELECT rolname AS "الدور", rolcanlogin AS "يستطيع_الدخول", rolbypassrls AS "يتجاوز_RLS"
FROM pg_roles
WHERE rolname LIKE 'erp_%'
ORDER BY rolname;

\echo ''
\echo '=== 6. الإضافات المثبتة ==='
SELECT extname AS "الإضافة" FROM pg_extension ORDER BY 1;

\echo ''
\echo '=== 7. الموديولات المسجّلة ==='
SELECT code AS "الكود", name AS "الاسم", version AS "الإصدار" FROM core.modules ORDER BY code;

\echo ''
\echo '=== 8. عدد الأفعال المسجّلة (Action Registry) ==='
SELECT module_code AS "الموديول", count(*) AS "عدد_الأفعال"
FROM core.actions GROUP BY module_code ORDER BY 1;

\echo ''
\echo '=== 9. بيانات المستخدم التجريبي ==='
SELECT t.code AS "كود_المنشأة", t.name AS "المنشأة",
       u.email AS "البريد", u.full_name AS "الاسم",
       r.code AS "الدور",
       (SELECT count(*) FROM core.permissions p WHERE p.role_id = r.id) AS "عدد_الصلاحيات"
FROM core.users u
JOIN core.tenants t ON t.id = u.tenant_id
LEFT JOIN core.roles r ON r.tenant_id = u.tenant_id
WHERE u.email = 'admin@demo.local';

\echo ''
\echo '=== 10. سجل التدقيق (آخر 10 حركات) ==='
SELECT occurred_at AS "الوقت", table_name AS "الجدول", operation AS "العملية"
FROM core.audit_log ORDER BY occurred_at DESC LIMIT 10;
