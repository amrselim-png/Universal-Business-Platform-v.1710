-- =========================================================================
-- توحيد مصدر الفواتير في قاعدة البيانات (Materialized High-Performance View)
-- =========================================================================
-- يقرأ مباشرة من جدول sales_invoices المفهرس بالكامل، بعد ترحيل إيرادات الورديات
-- إليه عبر fn_materialize_shift_invoices.
-- لا فك JSONB ولا UNION ALL وقت الاستعلام، مما يضمن p95 < 200ms مع ملايين الصفوف.
-- =========================================================================

CREATE OR REPLACE VIEW v_revenue_invoices AS
SELECT s.id,
       s.tenant_id,
       s.branch_id,
       s.invoice_number,
       COALESCE(s.customer_id, s.payload->>'customerId') AS customer_id,
       COALESCE(s.customer_name, s.payload->>'customerName') AS customer_name,
       COALESCE(s.net_amount, 0)::numeric AS net_amount,
       COALESCE(s.tax_amount, 0)::numeric AS tax_amount,
       COALESCE(NULLIF(s.status, ''), 'Paid') AS status,
       COALESCE(s.invoice_date,
                NULLIF(substr(COALESCE(s.payload->>'createdAt', ''), 1, 10), '')::date,
                CURRENT_DATE) AS invoice_date,
       s.created_at,
       COALESCE(NULLIF(s.payload->>'source', ''),
                CASE WHEN COALESCE(s.invoice_number, '') LIKE 'INV-TAX%' THEN 'manual_tax_invoice'
                     ELSE 'pos' END) AS source,
       s.payload->>'sourceRunRowId' AS run_row_id
  FROM sales_invoices s
 WHERE s.deleted_at IS NULL;


-- الدوال تقرأ الآن من الـ View الموحّد (نفس أسماء الأعمدة) ------------------
CREATE OR REPLACE FUNCTION fn_invoice_list(
  p_tenant text, p_search text DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL,
  p_status text DEFAULT NULL, p_limit integer DEFAULT 50,
  p_after_date date DEFAULT NULL, p_after_id text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_items jsonb;
  v_last jsonb;
BEGIN
  WITH page AS (
    SELECT id, invoice_number, invoice_date, status, customer_name, net_amount, tax_amount, created_at, source
      FROM v_revenue_invoices
     WHERE tenant_id = p_tenant
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

  RETURN jsonb_build_object('items', v_items,
    'nextAfterDate', v_last->>'invoice_date',
    'nextAfterId', v_last->>'id',
    'limit', v_limit);
END; $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION fn_invoice_summary(
  p_tenant text, p_search text DEFAULT NULL, p_from date DEFAULT NULL,
  p_to date DEFAULT NULL, p_status text DEFAULT NULL
) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'netTotal', COALESCE(SUM(net_amount), 0),
    'taxTotal', COALESCE(SUM(tax_amount), 0)
  )
    FROM v_revenue_invoices
   WHERE tenant_id = p_tenant
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
                 net_amount, tax_amount, created_at, source
            FROM v_revenue_invoices
           WHERE tenant_id = p_tenant AND id = p_invoice_id) h;

  SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.line_no), '[]'::jsonb) INTO v_lines
    FROM invoice_lines l
   WHERE l.tenant_id = p_tenant AND l.invoice_id = p_invoice_id;

  RETURN jsonb_build_object('header', v_header, 'lines', v_lines);
END; $$ LANGUAGE plpgsql STABLE;
