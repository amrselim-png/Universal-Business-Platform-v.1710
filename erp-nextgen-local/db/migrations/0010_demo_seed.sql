-- 0010_demo_seed.sql
-- بيانات تجريبية للتشغيل المحلي (Tenant + Branch + User + Role + Permissions)
-- ---------------------------------------------------------------------
-- تُستخدم معرّفات ثابتة (Fixed UUIDs) لتسهيل الاختبار من Postman/Swagger.
-- كلمة مرور المستخدم التجريبي: Admin@123
--   (PBKDF2-SHA256, 100000 تكرار، مطابقة لتنفيذ Erp.Api.Auth.PasswordHasher)
--
-- ملاحظة: نضبط app.tenant_id في بداية السكربت لأن سياسات الـ RLS مفعّلة
-- بـ FORCE، أي أنها تُطبَّق حتى على مالك الجدول (erp_owner).
-- ---------------------------------------------------------------------

BEGIN;

SELECT set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('app.user_id',   '22222222-2222-2222-2222-222222222222', true);

-- 1. المنشأة
INSERT INTO core.tenants (id, code, name, status, base_currency, timezone)
VALUES ('11111111-1111-1111-1111-111111111111', 'DEMO', 'الشركة التجريبية', 'active', 'EGP', 'Africa/Cairo')
ON CONFLICT (code) DO NOTHING;

-- 2. الفرع
INSERT INTO core.branches (tenant_id, id, code, name, address)
VALUES ('11111111-1111-1111-1111-111111111111',
        '44444444-4444-4444-4444-444444444444',
        'MAIN', 'الفرع الرئيسي - القاهرة', 'القاهرة، مصر')
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 3. المستخدم (كلمة المرور: Admin@123)
INSERT INTO core.users (tenant_id, id, email, full_name, password_hash, status)
VALUES ('11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        'admin@demo.local',
        'مدير النظام التجريبي',
        'pbkdf2-sha256$100000$MDEyMzQ1Njc4OWFiY2RlZg==$t+/LKFaqsE++N+G0BuuCaechxCGF1PSFppgP56exer4=',
        'active')
ON CONFLICT (tenant_id, email) DO NOTHING;

-- 4. الدور
INSERT INTO core.roles (tenant_id, id, code, name, is_system)
VALUES ('11111111-1111-1111-1111-111111111111',
        '33333333-3333-3333-3333-333333333333',
        'admin', 'مدير النظام', true)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 5. ربط المستخدم بالدور على مستوى المنشأة بالكامل (branch_id = NULL)
INSERT INTO core.user_roles (tenant_id, user_id, role_id, branch_id)
SELECT '11111111-1111-1111-1111-111111111111',
       '22222222-2222-2222-2222-222222222222',
       '33333333-3333-3333-3333-333333333333',
       NULL
WHERE NOT EXISTS (
  SELECT 1 FROM core.user_roles
  WHERE tenant_id = '11111111-1111-1111-1111-111111111111'
    AND user_id   = '22222222-2222-2222-2222-222222222222'
    AND role_id   = '33333333-3333-3333-3333-333333333333'
    AND branch_id IS NULL
);

-- 6. منح دور admin كل الأفعال المسجلة في الـ Action Registry
INSERT INTO core.permissions (tenant_id, role_id, action_code, scope)
SELECT '11111111-1111-1111-1111-111111111111',
       '33333333-3333-3333-3333-333333333333',
       a.code,
       a.default_scope
FROM core.actions a
ON CONFLICT (tenant_id, role_id, action_code) DO NOTHING;

-- 7. تفعيل كل الموديولات لهذه المنشأة
INSERT INTO core.tenant_modules (tenant_id, module_code, installed_version)
SELECT '11111111-1111-1111-1111-111111111111', m.code, m.version
FROM core.modules m
ON CONFLICT (tenant_id, module_code) DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------
-- 8. بيانات محرك الـ Metadata (كيانات وحقول) — خارج الـ Transaction
--    لأنها جداول غير محمية بـ RLS
-- ---------------------------------------------------------------------
INSERT INTO core.entities (code, module_code, table_name, display_name_ar, display_name_en, soft_delete) VALUES
  ('core.branch', 'core', 'core.branches', 'الفروع', 'Branches', true),
  ('core.user',   'core', 'core.users',    'المستخدمون', 'Users', true),
  ('core.role',   'core', 'core.roles',    'الأدوار', 'Roles', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO core.entity_fields (entity_code, column_name, label_ar, label_en, data_type, is_required, is_readonly, grid_visible, form_order, width) VALUES
  ('core.branch', 'code',       'كود الفرع',  'Code',      'string',  true,  false, true, 10, 120),
  ('core.branch', 'name',       'اسم الفرع',  'Name',      'string',  true,  false, true, 20, 240),
  ('core.branch', 'address',    'العنوان',    'Address',   'string',  false, false, true, 30, 320),
  ('core.branch', 'is_active',  'مُفعّل',      'Active',    'boolean', false, false, true, 40, 100),
  ('core.branch', 'version',    'الإصدار',    'Version',   'number',  false, true,  true, 50, 90),
  ('core.user',   'email',      'البريد',     'Email',     'string',  true,  false, true, 10, 240),
  ('core.user',   'full_name',  'الاسم',      'Full Name', 'string',  true,  false, true, 20, 240),
  ('core.user',   'status',     'الحالة',     'Status',    'badge',   false, false, true, 30, 120),
  ('core.user',   'version',    'الإصدار',    'Version',   'number',  false, true,  true, 40, 90),
  ('core.role',   'code',       'كود الدور',  'Code',      'string',  true,  false, true, 10, 140),
  ('core.role',   'name',       'اسم الدور',  'Name',      'string',  true,  false, true, 20, 240),
  ('core.role',   'is_system',  'دور نظام',   'System',    'boolean', false, true,  true, 30, 100)
ON CONFLICT (entity_code, column_name) DO NOTHING;

INSERT INTO core.screens (code, module_code, entity_code, kind, route, menu_group, sort_order, icon) VALUES
  ('core.branches', 'core', 'core.branch', 'grid', '/core/branches', 'الإدارة العامة', 10, 'Building2'),
  ('core.users',    'core', 'core.user',   'grid', '/core/users',    'الإدارة العامة', 20, 'Users'),
  ('core.roles',    'core', 'core.role',   'grid', '/core/roles',    'الإدارة العامة', 30, 'ShieldCheck')
ON CONFLICT (code) DO NOTHING;
