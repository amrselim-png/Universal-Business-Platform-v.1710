-- =========================================================================
-- ترحيل إيرادات الورديات إلى فواتير حقيقية في sales_invoices (Materialization)
-- =========================================================================
-- ينقل إيرادات الورديات غير المفوترة (reception_shifts.payload.runRows)
-- إلى صفوف حقيقية في sales_invoices و invoice_lines.
-- هذا يزيل الحاجة إلى حساب الـ View المشتق وقت الاستعلام، ويجعل الفهارس فعالة 100%.
-- =========================================================================

CREATE OR REPLACE FUNCTION fn_materialize_shift_invoices(p_tenant text, p_shift_id text DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  v_inserted_count integer := 0;
BEGIN
  WITH shift_rows AS (
    SELECT sh.id AS shift_id,
           sh.shift_number,
           sh.tenant_id,
           sh.branch_id,
           (r.value->>'id')::text AS run_row_id,
           'INV-OPS-' || upper(right(r.value->>'id', 6)) AS invoice_number,
           NULLIF(COALESCE(r.value->>'customerId', r.value->>'patientId'), '') AS customer_id,
           COALESCE(NULLIF(r.value->>'customerName', ''), NULLIF(r.value->>'patientName', ''), 'عميل تشغيل نقدي') AS customer_name,
           COALESCE((r.value->>'totalRevenue')::numeric, 0)::numeric AS net_amount,
           0::numeric AS tax_amount,
           COALESCE(NULLIF(r.value->>'date', '')::date, NULLIF(sh.shift_date, '')::date, CURRENT_DATE) AS invoice_date,
           COALESCE(NULLIF(r.value->>'date', '')::timestamptz, sh.updated_at) AS created_at,
           r.value AS row_value
      FROM reception_shifts sh
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(sh.payload->'runRows', '[]'::jsonb)) AS r(value)
     WHERE sh.tenant_id = p_tenant
       AND (p_shift_id IS NULL OR sh.id = p_shift_id)
       AND sh.deleted_at IS NULL
       AND COALESCE((r.value->>'totalRevenue')::numeric, 0) > 0
       AND COALESCE(r.value->>'description', '') NOT LIKE '%فاتورة نقطة بيع رقم INV-%'
       AND COALESCE(r.value->>'roomNumber', '') <> 'نقطة البيع (POS)'
       AND COALESCE(r.value->>'description', '') NOT LIKE '%فاتورة ضريبية رسمية رقم INV-%'
       AND COALESCE(r.value->>'roomNumber', '') <> 'فاتورة ضريبية رسمية'
       AND COALESCE(r.value->>'serviceName', '') NOT LIKE '%تسوية%'
       AND COALESCE(r.value->>'serviceName', '') NOT LIKE '%فرق تعديل%'
       AND COALESCE(r.value->>'description', '') NOT LIKE '%فرق تعديل%'
  ), new_invoices AS (
    INSERT INTO sales_invoices (
      id, tenant_id, branch_id, invoice_number, customer_id, customer_name,
      net_amount, tax_amount, status, invoice_date, created_at, version, payload
    )
    SELECT 'inv-ops-' || sr.run_row_id,
           sr.tenant_id,
           sr.branch_id,
           sr.invoice_number,
           sr.customer_id,
           sr.customer_name,
           sr.net_amount,
           sr.tax_amount,
           CASE WHEN COALESCE(sr.row_value->>'serviceName', '') LIKE '%(ملغي)%' THEN 'Cancelled' ELSE 'Posted' END,
           sr.invoice_date,
           sr.created_at,
           1,
           jsonb_build_object(
             'id', 'inv-ops-' || sr.run_row_id,
             'tenantId', sr.tenant_id,
             'branchId', sr.branch_id,
             'invoiceNumber', sr.invoice_number,
             'customerId', COALESCE(sr.customer_id, ''),
             'customerName', sr.customer_name,
             'paymentMethod', COALESCE(NULLIF(sr.row_value->>'paymentMethod', ''), 'نقداً (كاش)'),
             'source', 'reception_ops',
             'sourceShiftId', sr.shift_id,
             'sourceShiftNumber', sr.shift_number,
             'sourceRunRowId', sr.run_row_id,
             'status', CASE WHEN COALESCE(sr.row_value->>'serviceName', '') LIKE '%(ملغي)%' THEN 'Cancelled' ELSE 'Posted' END,
             'createdAt', sr.created_at,
             'netAmount', sr.net_amount,
             'taxAmount', 0,
             'subtotal', sr.net_amount,
             'items', jsonb_build_array(jsonb_build_object(
                'productId', 'srv-reception',
                'productNameAr', COALESCE(sr.row_value->>'serviceName', 'خدمة تشغيل'),
                'quantity', COALESCE((sr.row_value->>'consumedQuantity')::numeric, 1),
                'unitPrice', COALESCE((sr.row_value->>'unitPrice')::numeric, sr.net_amount),
                'lineTotal', sr.net_amount))
           )
      FROM shift_rows sr
     WHERE NOT EXISTS (
       SELECT 1 FROM sales_invoices s
        WHERE s.tenant_id = sr.tenant_id
          AND (s.id = 'inv-ops-' || sr.run_row_id OR s.payload->>'sourceRunRowId' = sr.run_row_id)
     )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_inserted_count FROM new_invoices;

  -- سطور الفاتورة في جدول invoice_lines
  INSERT INTO invoice_lines (tenant_id, invoice_id, line_no, product_id, product_name, quantity, unit_price, line_total, created_at)
  SELECT s.tenant_id,
         s.id,
         1,
         'srv-reception',
         COALESCE(s.payload->'items'->0->>'productNameAr', 'خدمة تشغيل'),
         COALESCE((s.payload->'items'->0->>'quantity')::numeric, 1),
         COALESCE((s.payload->'items'->0->>'unitPrice')::numeric, s.net_amount),
         s.net_amount,
         s.created_at
    FROM sales_invoices s
   WHERE s.tenant_id = p_tenant
     AND s.id LIKE 'inv-ops-%'
     AND NOT EXISTS (
       SELECT 1 FROM invoice_lines l
        WHERE l.tenant_id = s.tenant_id AND l.invoice_id = s.id
     )
  ON CONFLICT (tenant_id, invoice_id, line_no) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'materializedCount', v_inserted_count);
END; $$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_api') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION fn_materialize_shift_invoices(text,text) TO app_api';
  END IF;
END $$;

-- 2) Trigger تلقائي: ترحيل فوري لكل وردية تُحفظ أو تُغلق
CREATE OR REPLACE FUNCTION trg_materialize_reception_shift()
RETURNS trigger AS $$
BEGIN
  PERFORM fn_materialize_shift_invoices(NEW.tenant_id, NEW.id);
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reception_shifts_materialize ON reception_shifts;
CREATE TRIGGER trg_reception_shifts_materialize
  AFTER INSERT OR UPDATE ON reception_shifts
  FOR EACH ROW
  EXECUTE FUNCTION trg_materialize_reception_shift();

-- 3) ترحيل فوري للورديات التاريخية القائمة (مرة واحدة)
DO $$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reception_shifts') THEN
    FOR r IN SELECT tenant_id, id FROM reception_shifts WHERE deleted_at IS NULL LOOP
      PERFORM fn_materialize_shift_invoices(r.tenant_id, r.id);
    END LOOP;
  END IF;
END $$;
