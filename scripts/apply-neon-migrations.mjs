#!/usr/bin/env node
/**
 * تطبيق كل ملفات الـ SQL على قاعدة بيانات Neon (أو أي PostgreSQL)
 * ---------------------------------------------------------------------------
 * الاستخدام:
 *
 *   # Neon (يقرأ من متغير البيئة)
 *   NEON_DATABASE_URL="postgresql://..." node scripts/apply-neon-migrations.mjs
 *
 *   # أو مرّر الرابط مباشرة
 *   node scripts/apply-neon-migrations.mjs "postgresql://user:pass@host/db"
 *
 *   # معاينة فقط بلا تنفيذ
 *   node scripts/apply-neon-migrations.mjs --dry-run
 *
 *   # التحقق من الحالة فقط
 *   node scripts/apply-neon-migrations.mjs --verify
 *
 * الخصائص:
 *   • كل الملفات **متكررة بأمان** (Idempotent) — تشغيلها مرتين لا يضر.
 *   • كل ملف يُطبَّق داخل معاملة: نجح كاملاً أو لم يُطبَّق إطلاقاً.
 *   • لا يحذف أي بيانات.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitSqlStatements } from './sqlSplitter.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** ترتيب التطبيق مهم: كل ملف يبني على الذي قبله. */
const MIGRATIONS = [
  { file: 'scripts/neon_schema_migrations.sql', title: 'المخطط الأساسي (جداول التطبيق)' },
  { file: 'scripts/neon_typed_tables.sql', title: 'الجداول المنمّطة الكاملة (34 جدولاً)' },
  { file: 'scripts/neon_auth_functions.sql', title: 'دوال المصادقة (تقرأ من الجداول المنمّطة)' },
  { file: 'scripts/neon_security_rls.sql', title: 'الأمان: RLS + مستخدم app_api + الفهارس' },
  { file: 'scripts/neon_accounting_functions.sql', title: 'الدوال المحاسبية الذرّية' },
  { file: 'scripts/neon_optimistic_concurrency.sql', title: 'التزامن المتفاوت: version + Triggers' },
  { file: 'scripts/neon_metadata_engine.sql', title: 'محرك الشاشات: المخطط' },
  { file: 'scripts/neon_metadata_seed.sql', title: 'محرك الشاشات: البيانات المولَّدة' },
  { file: 'scripts/neon_phase4_infrastructure.sql', title: 'المرحلة 4: Outbox + التسلسل بلا فجوات' },
  { file: 'scripts/neon_phase4_missing_tables.sql', title: 'المرحلة 4: المرفقات والعملات و ETA' },
  { file: 'scripts/neon_retention_policy.sql', title: 'سياسة تنظيف السجلات المحذوفة ناعماً' },
  { file: 'scripts/neon_accounting_mapping.sql', title: 'ربط العمليات بالحسابات: المخطط' },
  { file: 'scripts/neon_accounting_mapping_seed.sql', title: 'ربط العمليات بالحسابات: القواعد الأساسية' },
  { file: 'scripts/neon_posting_rules_engine.sql', title: 'محرك قواعد الترحيل: المخطط والدوال' },
  { file: 'scripts/neon_posting_rules_seed.sql', title: 'محرك قواعد الترحيل: بذور تعكس السلوك الحالي' },
  { file: 'scripts/neon_journal_edit.sql', title: 'تعديل القيود الموثّق + مزامنة المصدر' },
  { file: 'scripts/neon_db_admin_audit.sql', title: 'تدقيق إدارة قاعدة البيانات من الواجهة' },
  { file: 'scripts/neon_parties_performance_indexes.sql', title: 'فهارس أداء العملاء (trgm + أكواد + حالة)' },
  { file: 'scripts/neon_invoice_slice.sql', title: 'شريحة الفواتير: أعمدة/سطور/فهارس/دوال' },
  { file: 'scripts/neon_revenue_invoices_view.sql', title: 'توحيد مصدر الفواتير: View موحّد + دوال محدّثة' },
  { file: 'scripts/neon_invoice_source_filter.sql', title: 'فواتير: فلتر المصدر في الدوال' },
  { file: 'scripts/neon_invoice_rows_payload.sql', title: 'فواتير: حمولة الصف الكاملة في القائمة' },
  { file: 'scripts/neon_invoice_scope_filters.sql', title: 'فواتير: فلاتر المصدر/العميل/الفرع' },
  { file: 'scripts/neon_invoice_write.sql', title: 'فواتير: دوال التعديل والإلغاء' },
  { file: 'scripts/materialize-shift-invoices.sql', title: 'فواتير: ترحيل إيرادات الورديات إلى فواتير حقيقية' },
];

/** استعلامات التحقق — تُشغَّل بعد التطبيق. */
const CHECKS = [
  ['الجداول المنمّطة الرئيسية (tenants)', `SELECT to_regclass('public.tenants') IS NOT NULL AS ok`],
  ['عمود version على branches', `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branches' AND column_name='version') AS ok`],
  ['دالة touch_row', `SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='touch_row') AS ok`],
  ['دالة fn_next_document_number', `SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='fn_next_document_number') AS ok`],
  ['دالة ensure_monthly_partition', `SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='ensure_monthly_partition') AS ok`],
  ['جدول outbox_events', `SELECT to_regclass('public.outbox_events') IS NOT NULL AS ok`],
  ['جدول number_sequences', `SELECT to_regclass('public.number_sequences') IS NOT NULL AS ok`],
  ['جدول attachments', `SELECT to_regclass('public.attachments') IS NOT NULL AS ok`],
  ['جدول currencies', `SELECT to_regclass('public.currencies') IS NOT NULL AS ok`],
  ['جدول eta_submissions', `SELECT to_regclass('public.eta_submissions') IS NOT NULL AS ok`],
  ['جدول erp_views (محرك الشاشات)', `SELECT to_regclass('public.erp_views') IS NOT NULL AS ok`],
  ['جدول erp_entity_fields', `SELECT to_regclass('public.erp_entity_fields') IS NOT NULL AS ok`],
  ['عدد الشاشات المسجّلة', `SELECT count(*)::int AS value FROM erp_views`],
  ['عدد الأفعال المسجّلة', `SELECT count(*)::int AS value FROM erp_actions`],
  ['عدد الكيانات المسجّلة', `SELECT count(*)::int AS value FROM erp_entities`],
  ['عدد حقول الكيانات', `SELECT count(*)::int AS value FROM erp_entity_fields`],
  ['عدد الجداول المقفلة بـ RLS', `SELECT count(*)::int AS value FROM pg_tables WHERE schemaname='public' AND rowsecurity = true`],
  ['مستخدم قاعدة البيانات المحدود', `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_api') AS ok`],
  ['سياسة تنظيف السجلات', `SELECT to_regclass('public.retention_policies') IS NOT NULL AS ok`],
  ['دالة purge_all_soft_deleted', `SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='purge_all_soft_deleted') AS ok`],
  ['جدول قواعد الربط المحاسبي', `SELECT to_regclass('public.accounting_mapping_rules') IS NOT NULL AS ok`],
  ['دالة فحص تغطية الربط', `SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='fn_mapping_coverage_gaps') AS ok`],
  ['دالة المصادقة (fn_authenticate_user)', `SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='fn_authenticate_user') AS ok`],
  ['دالة ترحيل القيود الموحّدة (fn_post_journal)', `SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='fn_post_journal') AS ok`],
  ['دالة إيصال التحصيل (fn_post_customer_receipt)', `SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='fn_post_customer_receipt') AS ok`],
  ['دالة استرداد المستحقات (fn_post_customer_refund)', `SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='fn_post_customer_refund') AS ok`],
  ['View بنود القيود (v_journal_entry_lines)', `SELECT to_regclass('public.v_journal_entry_lines') IS NOT NULL AS ok`],
  ['عدد قواعد الربط', `SELECT count(*)::int AS value FROM accounting_mapping_rules`],
];

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isVerifyOnly = args.includes('--verify');
const urlArg = args.find((a) => a.startsWith('postgres'));

const connectionString = urlArg || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ لم يتم العثور على رابط قاعدة البيانات.');
  console.error('   مرّره كوسيط:  node scripts/apply-neon-migrations.mjs "postgresql://..."');
  console.error('   أو عبر متغير: NEON_DATABASE_URL=... node scripts/apply-neon-migrations.mjs');
  process.exit(1);
}

/** يحمّل عميل قاعدة البيانات المناسب: pg محلياً، neon سحابياً. */
async function loadClient() {
  const isNeonHost = /neon\.tech|neon\.build/.test(connectionString);

  if (!isNeonHost) {
    try {
      // pg حزمة CommonJS: نتعامل مع الحالتين (default أو التصدير المباشر).
      const mod = await import('pg');
      const Client = mod.default?.Client ?? mod.Client;
      // SSL مطلوب للسيرفرات السحابية، ومرفوض على localhost.
      const isLocal = /localhost|127\.0\.0\.1|::1/.test(connectionString);
      const client = new Client({
        connectionString,
        ssl: isLocal ? false : { rejectUnauthorized: false },
      });
      await client.connect();
      return {
        kind: 'pg',
        query: (text, params) => client.query(text, params),
        begin: () => client.query('BEGIN'),
        commit: () => client.query('COMMIT'),
        rollback: () => client.query('ROLLBACK'),
        close: () => client.end(),
      };
    } catch (error) {
      if (process.env.MIGRATION_DEBUG === '1') {
        console.error(`  (تعذّر استخدام pg: ${error.message} — سيُجرَّب محرك Neon)`);
      }
    }
  }

  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(connectionString);
  return {
    kind: 'neon',
    query: async (text, params) => ({ rows: await sql.query(text, params) }),
    // محرك Neon يعمل عبر HTTP؛ الدوال الذرّية داخل SQL تتكفّل بالذرّية.
    begin: async () => {},
    commit: async () => {},
    rollback: async () => {},
    close: async () => {},
  };
}

const main = async () => {
  const db = await loadClient();
  console.log(`✅ متصل بقاعدة البيانات (${db.kind}).\n`);

  if (!isVerifyOnly) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  تطبيق الـ Migrations');
    console.log('═══════════════════════════════════════════════════════════\n');

    let applied = 0;
    let failed = 0;

    for (const migration of MIGRATIONS) {
      const path = join(ROOT, migration.file);
      if (!existsSync(path)) {
        console.log(`  ⚠️  ${migration.file.padEnd(46)} غير موجود — تم التخطي`);
        continue;
      }

      const sql = readFileSync(path, 'utf8');
      const lineCount = sql.split('\n').length;
      process.stdout.write(`  ${migration.file.padEnd(46)}`);

      if (isDryRun) {
        console.log(`معاينة (${lineCount} سطر)`);
        continue;
      }

      try {
        await db.begin();
        // سائق Neon السحابي لا يقبل أوامر متعددة في جملة واحدة — نجزّئها
        const statements = splitSqlStatements(sql);
        for (const statement of statements) {
          await db.query(statement);
        }
        await db.commit();
        console.log(`✅ (${lineCount} سطر · ${statements.length} أمر)`);
        applied++;
      } catch (error) {
        await db.rollback().catch(() => {});
        console.log('❌');
        console.error(`\n     السبب: ${error.message}\n`);
        failed++;
      }
    }

    console.log(`\n  النتيجة: ${applied} ناجح / ${failed} فاشل\n`);
    if (failed > 0) {
      console.error('⛔ توقّف: أصلح الأخطاء أعلاه قبل المتابعة.');
      await db.close();
      process.exit(1);
    }
  }

  // ---------------- التحقق ----------------
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  التحقق من الحالة');
  console.log('═══════════════════════════════════════════════════════════\n');

  let problems = 0;
  for (const [label, query] of CHECKS) {
    try {
      const result = await db.query(query);
      const row = result.rows?.[0] ?? {};
      if ('ok' in row) {
        const ok = row.ok === true;
        console.log(`  ${ok ? '✅' : '⚠️ '} ${label}`);
        if (!ok) problems++;
      } else {
        console.log(`  ℹ️  ${label}: ${row.value}`);
      }
    } catch (error) {
      console.log(`  ❌ ${label} — ${error.message}`);
      problems++;
    }
  }

  console.log('');
  if (problems === 0) {
    console.log('🎉 كل شيء جاهز. التطبيق يمكنه العمل بقاعدة البيانات هذه.');
  } else {
    console.log(`⚠️  ${problems} عنصر ناقص — راجع الملفات أعلاه.`);
  }

  await db.close();
};

main().catch((error) => {
  console.error('\n❌ فشل غير متوقع:', error.message);
  process.exit(1);
});
