-- 0003_core_tenants_and_identity.sql

-- 1. جدول المنشآت (Tenants)
CREATE TABLE core.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial')),
  base_currency text NOT NULL DEFAULT 'EGP',
  timezone text NOT NULL DEFAULT 'Africa/Cairo',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- 2. جدول الفروع (Branches)
CREATE TABLE core.branches (
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by uuid,
  deleted_at timestamptz,
  CONSTRAINT pk_branches PRIMARY KEY (tenant_id, id),
  CONSTRAINT uq_branches_code UNIQUE (tenant_id, code)
);

-- 3. جدول المستخدمين (Users)
CREATE TABLE core.users (
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email citext NOT NULL,
  full_name text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'locked')),
  last_login_at timestamptz,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  must_change_password boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by uuid,
  deleted_at timestamptz,
  CONSTRAINT pk_users PRIMARY KEY (tenant_id, id),
  CONSTRAINT uq_users_email UNIQUE (tenant_id, email)
);

-- 4. جدول الأدوار (Roles)
CREATE TABLE core.roles (
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by uuid,
  deleted_at timestamptz,
  CONSTRAINT pk_roles PRIMARY KEY (tenant_id, id),
  CONSTRAINT uq_roles_code UNIQUE (tenant_id, code)
);

-- 5. جدول ربط المستخدمين بالأدوار والفروع (User Roles)
CREATE TABLE core.user_roles (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  branch_id uuid, -- NULL تعني الصلاحية تسري على كل فروع الـ Tenant
  CONSTRAINT pk_user_roles PRIMARY KEY (tenant_id, user_id, role_id, branch_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (tenant_id, user_id) REFERENCES core.users(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (tenant_id, role_id) REFERENCES core.roles(tenant_id, id) ON DELETE CASCADE
);

-- 6. جدول الـ Refresh Tokens
CREATE TABLE core.refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  token_hash text NOT NULL,
  family_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_refresh_tokens_family ON core.refresh_tokens (tenant_id, family_id);
