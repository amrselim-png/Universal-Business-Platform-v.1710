-- 0002_core_functions_and_triggers.sql

-- 1. دالة تحديث الإصدار والوقت (Optimistic Concurrency & Touch)
CREATE OR REPLACE FUNCTION core.touch_row()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := clock_timestamp();
  NEW.updated_by := NULLIF(current_setting('app.user_id', true), '')::uuid;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. دالة التدقيق الآلي (Universal Audit Trigger)
CREATE OR REPLACE FUNCTION core.audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  v_old_data jsonb := NULL;
  v_new_data jsonb := NULL;
  v_tenant_id uuid;
  v_user_id uuid;
  v_record_id uuid;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_old_data := to_jsonb(OLD);
    v_tenant_id := OLD.tenant_id;
    v_record_id := OLD.id;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_tenant_id := NEW.tenant_id;
    v_record_id := NEW.id;
  ELSIF (TG_OP = 'INSERT') THEN
    v_new_data := to_jsonb(NEW);
    v_tenant_id := NEW.tenant_id;
    v_record_id := NEW.id;
  END IF;

  v_user_id := NULLIF(current_setting('app.user_id', true), '')::uuid;

  INSERT INTO core.audit_log (
    tenant_id,
    occurred_at,
    user_id,
    table_name,
    record_id,
    operation,
    old_data,
    new_data,
    request_id,
    ip
  ) VALUES (
    v_tenant_id,
    clock_timestamp(),
    v_user_id,
    TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
    v_record_id,
    TG_OP,
    v_old_data,
    v_new_data,
    NULLIF(current_setting('app.request_id', true), ''),
    NULLIF(current_setting('app.client_ip', true), '')
  );

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. دالة البث اللحظي عبر Postgres NOTIFY لربطها بـ SignalR
CREATE OR REPLACE FUNCTION core.realtime_notify_func()
RETURNS TRIGGER AS $$
DECLARE
  v_payload jsonb;
  v_tenant_id uuid;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_tenant_id := OLD.tenant_id;
    v_payload := jsonb_build_object(
      'op', TG_OP,
      'schema', TG_TABLE_SCHEMA,
      'table', TG_TABLE_NAME,
      'id', OLD.id,
      'tenant_id', v_tenant_id,
      'timestamp', clock_timestamp()
    );
  ELSE
    v_tenant_id := NEW.tenant_id;
    v_payload := jsonb_build_object(
      'op', TG_OP,
      'schema', TG_TABLE_SCHEMA,
      'table', TG_TABLE_NAME,
      'id', NEW.id,
      'version', NEW.version,
      'tenant_id', v_tenant_id,
      'timestamp', clock_timestamp()
    );
  END IF;

  PERFORM pg_notify('table_changes', v_payload::text);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
