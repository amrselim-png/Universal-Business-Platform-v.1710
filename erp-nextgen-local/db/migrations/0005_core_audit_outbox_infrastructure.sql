-- 0005_core_audit_outbox_infrastructure.sql

-- 1. جدول سجل التدقيق الرئيسي (Partition شهري)
CREATE TABLE core.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  user_id uuid,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  operation text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  changed_columns text[],
  request_id text,
  ip text,
  CONSTRAINT pk_audit_log PRIMARY KEY (tenant_id, occurred_at, id)
) PARTITION BY RANGE (occurred_at);

-- إنشاء بارتشنات أولية لسنة 2026 (تتولى وظيفة Hangfire الشهرية إنشاء البارتشنات التالية)
CREATE TABLE IF NOT EXISTS core.audit_log_2026_10 PARTITION OF core.audit_log
  FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');
CREATE TABLE IF NOT EXISTS core.audit_log_2026_11 PARTITION OF core.audit_log
  FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');

CREATE INDEX idx_audit_log_keyset ON core.audit_log (tenant_id, occurred_at DESC, id DESC);
CREATE INDEX idx_audit_log_record ON core.audit_log (tenant_id, table_name, record_id);

-- 2. جدول أحداث الـ Outbox للـ Sagas والاتساق التدريجي
CREATE TABLE core.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_FLIGHT', 'PROCESSED', 'FAILED', 'COMPENSATED')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  processed_at timestamptz,
  error text
);
CREATE INDEX idx_outbox_pending ON core.outbox_events (status, next_attempt_at) WHERE status = 'PENDING';

-- 3. جدول منع تكرار معالجة الأحداث (Idempotent Consumer)
CREATE TABLE core.processed_events (
  consumer text NOT NULL,
  event_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT pk_processed_events PRIMARY KEY (consumer, event_id)
);

-- 4. التسلسلات الرقمية الدقيقة (بدون فجوات لـ ETA والضرائب)
CREATE TABLE core.number_sequences (
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  branch_id uuid,
  doc_type text NOT NULL,
  period text NOT NULL, -- e.g. 2026, 2026-10
  prefix text NOT NULL,
  next_value bigint NOT NULL DEFAULT 1,
  CONSTRAINT pk_number_sequences PRIMARY KEY (tenant_id, doc_type, period, prefix)
);

-- 5. جدول المرفقات (Attachments)
CREATE TABLE core.attachments (
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  entity_code text NOT NULL,
  record_id uuid NOT NULL,
  file_name text NOT NULL,
  content_type text NOT NULL,
  size bigint NOT NULL,
  storage_key text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by uuid,
  deleted_at timestamptz,
  CONSTRAINT pk_attachments PRIMARY KEY (tenant_id, id)
);

-- 6. جداول العملات والأسعار ومطابقة الفاتورة الإلكترونية ETA
CREATE TABLE core.currencies (
  code text PRIMARY KEY,
  name text NOT NULL,
  decimals integer NOT NULL DEFAULT 2
);

CREATE TABLE core.exchange_rates (
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  from_currency text NOT NULL REFERENCES core.currencies(code),
  to_currency text NOT NULL REFERENCES core.currencies(code),
  rate numeric(18, 6) NOT NULL,
  rate_date date NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by uuid,
  deleted_at timestamptz,
  CONSTRAINT pk_exchange_rates PRIMARY KEY (tenant_id, id)
);

CREATE TABLE core.eta_submissions (
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  document_type text NOT NULL, -- invoice, receipt
  document_id uuid NOT NULL,
  eta_uuid text,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'valid', 'invalid', 'cancelled')),
  response jsonb,
  attempts integer NOT NULL DEFAULT 1,
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by uuid,
  deleted_at timestamptz,
  CONSTRAINT pk_eta_submissions PRIMARY KEY (tenant_id, id)
);
