-- 0006_core_rls_policies.sql

-- 1. تفعيل سياسات Row-Level Security على كل جداول core التابعة للـ tenants
ALTER TABLE core.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.branches FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.branches
  FOR ALL
  USING (tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid));

ALTER TABLE core.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.users FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.users
  FOR ALL
  USING (tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid));

ALTER TABLE core.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.roles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.roles
  FOR ALL
  USING (tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid));

ALTER TABLE core.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.permissions
  FOR ALL
  USING (tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid));

ALTER TABLE core.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.audit_log
  FOR ALL
  USING (tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid));

-- 2. ربط Triggers الثلاثة (touch_row + audit + realtime_notify)
CREATE TRIGGER trg_branches_touch
  BEFORE UPDATE ON core.branches
  FOR EACH ROW EXECUTE FUNCTION core.touch_row();

CREATE TRIGGER trg_branches_audit
  AFTER INSERT OR UPDATE OR DELETE ON core.branches
  FOR EACH ROW EXECUTE FUNCTION core.audit_trigger_func();

CREATE TRIGGER trg_branches_notify
  AFTER INSERT OR UPDATE OR DELETE ON core.branches
  FOR EACH ROW EXECUTE FUNCTION core.realtime_notify_func();

CREATE TRIGGER trg_users_touch
  BEFORE UPDATE ON core.users
  FOR EACH ROW EXECUTE FUNCTION core.touch_row();

CREATE TRIGGER trg_users_audit
  AFTER INSERT OR UPDATE OR DELETE ON core.users
  FOR EACH ROW EXECUTE FUNCTION core.audit_trigger_func();
