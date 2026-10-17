-- 0001_extensions_and_roles.sql
-- ينفذ بواسطة مستخدم erp_owner فقط كـ Job في الـ CI/CD

-- 1. تفعيل الامتدادات الأساسية
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 2. إنشاء الأدوار الثلاثة (Security Principals)
DO $$
BEGIN
  -- دور مدير التثبيت والترقيات فقط (لا يستخدمه تطبيق الويب)
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'erp_owner') THEN
    CREATE ROLE erp_owner WITH LOGIN PASSWORD 'CHANGE_IN_PRODUCTION';
  END IF;

  -- دور التطبيق الفعلي (.NET 10 Web App) - ليس مالكاً وممنوع تجاوزه للـ RLS
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'erp_app') THEN
    CREATE ROLE erp_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD 'APP_SECURE_PASSWORD';
  END IF;

  -- دور التقارير و Power BI (للقراءة فقط ومقيد أيضاً بالـ RLS)
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'erp_readonly') THEN
    CREATE ROLE erp_readonly WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD 'REPORTING_READONLY_PASS';
  END IF;
END $$;

-- 3. إنشاء Schemas المعمارية
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS sales;
CREATE SCHEMA IF NOT EXISTS purchasing;
CREATE SCHEMA IF NOT EXISTS accounting;
CREATE SCHEMA IF NOT EXISTS hr;
CREATE SCHEMA IF NOT EXISTS manufacturing;
CREATE SCHEMA IF NOT EXISTS clinic;
CREATE SCHEMA IF NOT EXISTS reporting;

-- منح الصلاحيات لدور التطبيق
GRANT USAGE ON SCHEMA core, inventory, sales, purchasing, accounting, hr, manufacturing, clinic, reporting TO erp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA core, inventory, sales, purchasing, accounting, hr, manufacturing, clinic TO erp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA core, inventory, sales, purchasing, accounting, hr, manufacturing, clinic TO erp_app;

-- دور التقارير: قراءة فقط
GRANT USAGE ON SCHEMA core, inventory, sales, purchasing, accounting, hr, manufacturing, clinic, reporting TO erp_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA core, inventory, sales, purchasing, accounting, hr, manufacturing, clinic, reporting TO erp_readonly;
