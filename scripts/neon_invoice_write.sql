-- =========================================================================
-- كتابة الفواتير في قاعدة البيانات (تعديل/إلغاء) مع قفل تزامن ذري (Atomic Lock)
-- =========================================================================
-- يُسقط النسخ القديمة الزائدة ويفرض فحص التزامن المتفائل الذري في خطوة واحدة
-- لمنع حدوث Race Condition بين التحديثات المتزامنة.
-- =========================================================================

-- 1) إسقاط النسخ القديمة لعدم ترك دوال زائدة (Overload) بلا فحص version
DROP FUNCTION IF EXISTS fn_invoice_update(text, text, numeric, text, text, text);

-- 2) الدالة الذرية المحدثة بفحص expectedVersion إلزامي
CREATE OR REPLACE FUNCTION fn_invoice_update(
  p_tenant text,
  p_invoice_id text,
  p_net_amount numeric,
  p_payment_method text,
  p_reason text,
  p_actor text,
  p_expected_version integer
) RETURNS jsonb AS $$
DECLARE
  v_rows_affected integer;
  v_old_net numeric;
  v_new_version integer;
  v_diff numeric;
BEGIN
  IF COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'سبب التعديل مطلوب';
  END IF;

  IF p_expected_version IS NULL OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'expected_version_required';
  END IF;

  -- قراءة الصافي القديم لحساب فرق الأثر المحاسبي
  SELECT net_amount INTO v_old_net
    FROM sales_invoices
   WHERE tenant_id = p_tenant AND id = p_invoice_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: %', p_invoice_id;
  END IF;

  v_new_version := p_expected_version + 1;
  v_diff := p_net_amount - COALESCE(v_old_net, 0);

  -- تحديث ذري وحيد مشروط برقم الإصدار لمنع أي Race Condition
  UPDATE sales_invoices
     SET net_amount = p_net_amount,
         version = v_new_version,
         payload = jsonb_set(
           jsonb_set(
             jsonb_set(
               jsonb_set(
                 jsonb_set(COALESCE(payload, '{}'::jsonb), '{netAmount}', to_jsonb(p_net_amount), true),
                 '{paymentMethod}', to_jsonb(COALESCE(p_payment_method, payload->>'paymentMethod')), true),
               '{lastEditReason}', to_jsonb(p_reason), true),
             '{version}', to_jsonb(v_new_version), true),
           '{lastAdjustmentDiff}', to_jsonb(v_diff), true),
         updated_at = NOW(),
         updated_by = COALESCE(p_actor, 'ui')
   WHERE tenant_id = p_tenant
     AND id = p_invoice_id
     AND version = p_expected_version
     AND deleted_at IS NULL;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  -- إذا لم يتأثر أي صف، فهذا يعني أن مستخدماً آخر عدل الفاتورة وتغير رقم الإصدار
  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'conflict_version: invoice was modified concurrently';
  END IF;

  RETURN jsonb_build_object(
    'invoiceId', p_invoice_id,
    'version', v_new_version,
    'netAmount', p_net_amount,
    'adjustmentDiff', v_diff
  );
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_invoice_cancel(
  p_tenant text, p_invoice_id text, p_reason text, p_actor text
) RETURNS jsonb AS $$
BEGIN
  IF COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'سبب الإلغاء مطلوب';
  END IF;

  UPDATE sales_invoices
     SET status = 'Cancelled',
         version = COALESCE(version, 1) + 1,
         payload = jsonb_set(
           jsonb_set(COALESCE(payload, '{}'::jsonb), '{status}', to_jsonb('Cancelled'::text), true),
           '{cancelReason}', to_jsonb(p_reason), true),
         updated_at = NOW(),
         updated_by = COALESCE(p_actor, 'ui')
   WHERE tenant_id = p_tenant AND id = p_invoice_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: %', p_invoice_id;
  END IF;

  RETURN jsonb_build_object('invoiceId', p_invoice_id, 'status', 'Cancelled');
END; $$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_api') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION fn_invoice_update(text,text,numeric,text,text,text,integer) TO app_api';
    EXECUTE 'GRANT EXECUTE ON FUNCTION fn_invoice_cancel(text,text,text,text) TO app_api';
  END IF;
END $$;
