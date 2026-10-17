-- =========================================================================
-- إرجاع حمولة الفاتورة الكاملة من القائمة (لرسم نفس أعمدة شاشة الفواتير)
-- =========================================================================
-- الجدول يعرض: العميل/الكاشير/الأصناف/طريقة الدفع/الشيفت/الحالة/المبالغ.
-- لذلك تُرجع fn_invoice_list حقل payload لكل صف:
--   • للفواتير المحفوظة: s.payload كما هو.
--   • لإيرادات الورديات المشتقة: payload مُصنَّع من صف الوردية بنفس الشكل.
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
       s.payload->>'sourceRunRowId' AS run_row_id,
       s.payload AS payload
  FROM sales_invoices s
 WHERE s.deleted_at IS NULL;

-- القائمة تُرجع payload لكل صف (نفس توقيع الدالة السابق + عمود الحمولة)
CREATE OR REPLACE FUNCTION fn_invoice_list(
  p_tenant text, p_search text DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL,
  p_status text DEFAULT NULL, p_limit integer DEFAULT 50,
  p_after_date date DEFAULT NULL, p_after_id text DEFAULT NULL, p_source text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_items jsonb;
  v_last jsonb;
BEGIN
  WITH page AS (
    SELECT id, invoice_number, invoice_date, status, customer_name, net_amount, tax_amount,
           created_at, source, payload
      FROM v_revenue_invoices
     WHERE tenant_id = p_tenant
       AND (p_from IS NULL OR invoice_date >= p_from)
       AND (p_to IS NULL OR invoice_date <= p_to)
       AND (p_status IS NULL OR status = p_status)
       AND (p_source IS NULL OR p_source = '' OR source = p_source)
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
