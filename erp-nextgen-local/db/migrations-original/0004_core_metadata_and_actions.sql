-- 0004_core_metadata_and_actions.sql

-- 1. الموديولات (Modules Registry)
CREATE TABLE core.modules (
  code text PRIMARY KEY,
  name text NOT NULL,
  version text NOT NULL DEFAULT '1.0.0',
  depends_on text[] NOT NULL DEFAULT '{}',
  description text
);

-- 2. الموديولات المفعلة للمنشأة (Tenant Modules)
CREATE TABLE core.tenant_modules (
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  module_code text NOT NULL REFERENCES core.modules(code) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled')),
  installed_version text NOT NULL,
  enabled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT pk_tenant_modules PRIMARY KEY (tenant_id, module_code)
);

-- 3. الكيانات (Entities Definition)
CREATE TABLE core.entities (
  code text PRIMARY KEY, -- مثال: inventory.item, sales.invoice
  module_code text NOT NULL REFERENCES core.modules(code) ON DELETE CASCADE,
  table_name text NOT NULL,
  display_name_ar text NOT NULL,
  display_name_en text NOT NULL,
  soft_delete boolean NOT NULL DEFAULT true
);

-- 4. حقول الكيانات (Entity Fields - لتوليد الواجهات آلياً)
CREATE TABLE core.entity_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_code text NOT NULL REFERENCES core.entities(code) ON DELETE CASCADE,
  column_name text NOT NULL,
  label_ar text NOT NULL,
  label_en text NOT NULL,
  data_type text NOT NULL, -- string, number, currency, select, date, badge
  is_required boolean NOT NULL DEFAULT false,
  is_readonly boolean NOT NULL DEFAULT false,
  default_value text,
  lookup_entity text REFERENCES core.entities(code),
  grid_visible boolean NOT NULL DEFAULT true,
  form_order integer NOT NULL DEFAULT 10,
  width integer DEFAULT 150,
  validation jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT uq_entity_fields UNIQUE (entity_code, column_name)
);

-- 5. الشاشات (Screen Schemas)
CREATE TABLE core.screens (
  code text PRIMARY KEY,
  module_code text NOT NULL REFERENCES core.modules(code) ON DELETE CASCADE,
  entity_code text REFERENCES core.entities(code),
  kind text NOT NULL CHECK (kind IN ('grid', 'form', 'custom', 'report')),
  route text NOT NULL,
  menu_group text NOT NULL,
  sort_order integer NOT NULL DEFAULT 10,
  icon text NOT NULL DEFAULT 'Layers',
  config jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 6. سجل الأفعال المركزي (Action Registry - مصدر الأزرار الوحيد)
CREATE TABLE core.actions (
  code text PRIMARY KEY, -- نمط module.entity.action: e.g. pos.order.pay, invoice.approve
  module_code text NOT NULL REFERENCES core.modules(code) ON DELETE CASCADE,
  entity_code text REFERENCES core.entities(code),
  label_ar text NOT NULL,
  label_en text NOT NULL,
  type text NOT NULL CHECK (type IN ('button', 'menu', 'api', 'batch')),
  default_scope text NOT NULL DEFAULT 'branch' CHECK (default_scope IN ('all', 'branch', 'own'))
);

-- 7. مصفوفة الصلاحيات (Permissions - غياب الصف = ممنوع Default Deny)
CREATE TABLE core.permissions (
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  role_id uuid NOT NULL,
  action_code text NOT NULL REFERENCES core.actions(code) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'branch' CHECK (scope IN ('all', 'branch', 'own')),
  CONSTRAINT pk_permissions PRIMARY KEY (tenant_id, role_id, action_code),
  CONSTRAINT fk_permissions_role FOREIGN KEY (tenant_id, role_id) REFERENCES core.roles(tenant_id, id) ON DELETE CASCADE
);
