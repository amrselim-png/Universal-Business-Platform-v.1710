-- 0008_performance_indexes.sql
-- فهارس أداء Keyset Pagination والـ RLS
-- ---------------------------------------------------------------------
-- المخطط الأصلي يحتوي على 4 فهارس فقط لـ 23 جدولاً. الاستعلامات المعيارية
-- في الـ Generic Data API تعتمد على:
--     WHERE (created_at, id) < (@afterDate, @afterId)
--     ORDER BY created_at DESC, id DESC
-- وبدون فهرس مركّب مطابق سيتحول الاستعلام إلى Seq Scan + Sort كامل.
-- كما أن سياسات الـ RLS تُضيف شرط tenant_id على كل استعلام، لذا يجب أن
-- يكون tenant_id هو العمود الأول في كل فهرس.
-- ---------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_branches_keyset  ON core.branches  (tenant_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_users_keyset     ON core.users     (tenant_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_roles_keyset     ON core.roles     (tenant_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_attachments_keyset ON core.attachments (tenant_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_keyset ON core.exchange_rates (tenant_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_eta_submissions_keyset ON core.eta_submissions (tenant_id, created_at DESC, id DESC);

-- البحث بالبريد الإلكتروني (تسجيل الدخول)
CREATE INDEX IF NOT EXISTS idx_users_email_lookup ON core.users (tenant_id, email) WHERE deleted_at IS NULL;

-- الـ Refresh Tokens (تدوير الجلسات)
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON core.refresh_tokens (token_hash);

-- الـ Audit Log: البحث بسجل معيّن
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_time ON core.audit_log (tenant_id, occurred_at DESC);
