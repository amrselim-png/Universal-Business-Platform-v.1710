-- =========================================================================
-- شريحة الفواتير (Invoice Vertical Slice) — على مقياس مليون فاتورة
-- =========================================================================
-- الهدف: قائمة/ملخص/تفاصيل بسرعة p95 < 200ms على مليون فاتورة، تمهيداً لتعميم
-- الأسلوب على بقية الشاشات وإخراج الفواتير من حِزمة الإقلاع.
--
-- 1) أعمدة فلترة حقيقية على sales_invoices (بدل استخراج من JSONB في كل استعلام).
-- 2) جدول invoice_lines حقيقي لسطور الفاتورة (بدل payload.items).
-- 3) فهارس Keyset + فلاتر + بحث نصي.
-- 4) دوال: fn_invoice_list / fn_invoice_summary / fn_invoice_detail.
-- متكرر بأمان (Idempotent).
-- =========================================================================

-- 1) أعمدة الفلترة ---------------------------------------------------------
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS invoice_date DATE;
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS status VARCHAR(30);
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS customer_id VARCHAR(100);
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15, 2) NOT NULL DEFAULT 0;
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- تعبئة الأعمدة من payload للصفوف القديمة (مرة واحدة لكل صف ناقص)
UPDATE sales_invoices
   SET invoice_date = COALESCE(invoice_date, NULLIF(payload->>'invoiceDate', '')::date,
                               NULLIF(substr(COALESCE(payload->>'createdAt', ''), 1, 10), '')::date,
                               CURRENT_DATE),
       status = COALESCE(status, NULLIF(payload->>'status', ''), 'Paid'),
       customer_id = COALESCE(customer_id, NULLIF(payload->>'customerId', '')),
       customer_name = COALESCE(customer_name, NULLIF(payload->>'customerName', '')),
       version = COALESCE(version, (payload->>'version')::integer, 1),
       tax_amount = CASE WHEN tax_amount = 0 THEN COALESCE((payload->>'taxAmount')::numeric, 0) ELSE tax_amount END
 WHERE invoice_date IS NULL OR status IS NULL OR customer_name IS NULL OR version IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_invoices_keyset
  ON sales_invoices (tenant_id, invoice_date DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_invoices_status
  ON sales_invoices (tenant_id, status, invoice_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer
  ON sales_invoices (tenant_id, customer_id, invoice_date DESC)
  WHERE deleted_at IS NULL;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer_name_trgm
  ON sales_invoices USING gin (lower(customer_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_sales_invoices_number_trgm
  ON sales_invoices USING gin (invoice_number gin_trgm_ops);

-- قيد فريد مركب لضمان تكامل عزل المستأجرين
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'uq_sales_invoices_tenant_id' AND table_name = 'sales_invoices'
  ) THEN
    ALTER TABLE sales_invoices ADD CONSTRAINT uq_sales_invoices_tenant_id UNIQUE (tenant_id, id);
  END IF;
END $$;

-- 2) سطور الفاتورة --------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_lines (
  id BIGSERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) NOT NULL,
  invoice_id VARCHAR(200) NOT NULL,
  line_no INTEGER NOT NULL,
  product_id VARCHAR(100),
  product_name VARCHAR(255),
  quantity NUMERIC(15, 3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(15, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  tax NUMERIC(15, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_invoice_line UNIQUE (tenant_id, invoice_id, line_no),
  CONSTRAINT fk_invoice_lines_tenant_invoice FOREIGN KEY (tenant_id, invoice_id) REFERENCES sales_invoices(tenant_id, id) ON DELETE CASCADE
);

DO $$
BEGIN
  ALTER TABLE invoice_lines DROP CONSTRAINT IF EXISTS fk_invoice_lines_invoice;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'fk_invoice_lines_tenant_invoice' AND table_name = 'invoice_lines'
  ) THEN
    ALTER TABLE invoice_lines
      ADD CONSTRAINT fk_invoice_lines_tenant_invoice
      FOREIGN KEY (tenant_id, invoice_id) REFERENCES sales_invoices(tenant_id, id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice
  ON invoice_lines (tenant_id, invoice_id);


-- 3) دوال القراءة (القائمة / الملخص / التفاصيل) ---------------------------
--    Keyset على (invoice_date DESC, id DESC) — لا OFFSET.
CREATE OR REPLACE FUNCTION fn_invoice_list(
  p_tenant text,
  p_search text DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_after_date date DEFAULT NULL,
  p_after_id text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_items jsonb;
  v_last jsonb;
BEGIN
  WITH page AS (
    SELECT id, invoice_number, invoice_date, status, customer_name, net_amount, tax_amount, created_at
      FROM sales_invoices
     WHERE tenant_id = p_tenant
       AND deleted_at IS NULL
       AND (p_from IS NULL OR invoice_date >= p_from)
       AND (p_to IS NULL OR invoice_date <= p_to)
       AND (p_status IS NULL OR status = p_status)
       AND (p_search IS NULL OR p_search = '' OR
            invoice_number ILIKE '%' || p_search || '%' OR
            lower(customer_name) LIKE '%' || lower(p_search) || '%')
       AND (p_after_date IS NULL OR (invoice_date, id) < (p_after_date, p_after_id))
     ORDER BY invoice_date DESC, id DESC
     LIMIT v_limit
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(page)), '[]'::jsonb),
         (SELECT to_jsonb(p2) FROM page p2 ORDER BY p2.invoice_date ASC, p2.id ASC LIMIT 1)
    INTO v_items, v_last
    FROM page;

  RETURN jsonb_build_object(
    'items', v_items,
    'nextAfterDate', v_last->>'invoice_date',
    'nextAfterId', v_last->>'id',
    'limit', v_limit
  );
END; $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION fn_invoice_summary(
  p_tenant text,
  p_search text DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_status text DEFAULT NULL
) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'netTotal', COALESCE(SUM(net_amount), 0),
    'taxTotal', COALESCE(SUM(tax_amount), 0)
  )
    FROM sales_invoices
   WHERE tenant_id = p_tenant
     AND deleted_at IS NULL
     AND (p_from IS NULL OR invoice_date >= p_from)
     AND (p_to IS NULL OR invoice_date <= p_to)
     AND (p_status IS NULL OR status = p_status)
     AND (p_search IS NULL OR p_search = '' OR
          invoice_number ILIKE '%' || p_search || '%' OR
          lower(customer_name) LIKE '%' || lower(p_search) || '%');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION fn_invoice_detail(p_tenant text, p_invoice_id text)
RETURNS jsonb AS $$
DECLARE v_header jsonb; v_lines jsonb;
BEGIN
  SELECT to_jsonb(h) INTO v_header
    FROM (SELECT id, invoice_number, invoice_date, status, customer_id, customer_name,
                 net_amount, tax_amount, created_at
            FROM sales_invoices
           WHERE tenant_id = p_tenant AND id = p_invoice_id AND deleted_at IS NULL) h;

  SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.line_no), '[]'::jsonb) INTO v_lines
    FROM invoice_lines l
   WHERE l.tenant_id = p_tenant AND l.invoice_id = p_invoice_id;

  RETURN jsonb_build_object('header', v_header, 'lines', v_lines);
END; $$ LANGUAGE plpgsql STABLE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_api') THEN
    EXECUTE 'GRANT SELECT ON invoice_lines TO app_api';
    EXECUTE 'GRANT EXECUTE ON FUNCTION fn_invoice_list(text,text,date,date,text,integer,date,text) TO app_api';
    EXECUTE 'GRANT EXECUTE ON FUNCTION fn_invoice_summary(text,text,date,date,text) TO app_api';
    EXECUTE 'GRANT EXECUTE ON FUNCTION fn_invoice_detail(text,text) TO app_api';
  END IF;
END $$;
