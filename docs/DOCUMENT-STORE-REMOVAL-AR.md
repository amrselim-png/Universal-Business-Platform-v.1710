# خطة استبدال مخزن المستندات بالجداول المنمّطة

## الحالة: ✅ مكتمل (2026-10-16)

| # | البند | الحالة |
|---|---|---|
| 1 | حذف `app_records` / `app_documents` من قاعدة البيانات | ✅ تم (52 جدولاً بعد 54) |
| 2 | إزالة كود `app_documents` الميت من `neonService.ts` | ✅ تم (1831 → 1653 سطر) |
| 3 | تحويل الـ API للسيرفر للجداول المنمّطة | ✅ تم |

## ما تم تنفيذه

### السيرفر (`server/`)

| الملف | الوظيفة |
|---|---|
| `datasetTables.ts` | خريطة `docKey → table` + **Allow-list صارم** (حماية من حقن SQL) |
| `recordWriter.ts` | كتابة الأعمدة المنمّطة (تُكتشف من `information_schema`) + `payload` + حذف ناعم |
| `neon_auth_functions.sql` | `fn_authenticate_user` (SECURITY DEFINER) بديلاً عن `fn_login` |

**نقاط النهاية المحوّلة:** `POST /auth/login` · `GET /records/:docKey` · `GET /records/:docKey/changes` · `POST /records/:docKey` · `POST /records/:docKey/delete`

### الواجهة (`src/`)

- `commands.ts` — إلغاء الكتابة المزدوجة
- `recordSync.ts` — إزالة كل مسارات `app_records` (304 → 179 سطر)
- `neonService.ts` — إزالة `app_documents` الميت

### قاعدة البيانات

- `scripts/neon_typed_tables.sql` — 34 جدولاً منمّطاً كاملاً
- `scripts/neon_auth_functions.sql` — دالة المصادقة
- `scripts/neon_drop_document_store.sql` — إزالة مخزن المستندات (يدوي)
- `scripts/drop-document-store.mjs` — أداة الحذف بتحقق إلزامي

## ما تم التحقق منه قبل الحذف

| المجموعة | المعرّف | الجدول | النظير موجود؟ |
|---|---|---|---|
| `erp_warehouses` | `wh-alex-store` | `warehouses` | ✅ |
| `erp_tenants` | `tenant-eg-003` | `tenants` | ✅ |
| `erp_branches` | `branch-9513` | `branches` | ✅ |

**النسخة الاحتياطية:** `docs/backups/app_records-backup-2026-10-16.json`

---

## 🔴 فجوة مكتشفة (لم تُعالَج)

**جدول `users` فاضي — المستخدمون لم يُحفظوا في قاعدة البيانات قط.**

| المجموعة | عدد السجلات في Neon |
|---|---|
| `tenants` | 1 |
| **`users`** | **0** ← |
| `parties` | 14 |
| `products` | 6 |
| `branches` | 5 |
| `warehouses` | 4 |
| `accounts` | 12 |

**السبب:** كتابة المستخدمين في الجداول المنمّطة لم تكن منفّذة — حتى `app_records` (المحذوف) لم يكن يحتوي أي مستخدم.

**الأثر:**
- ✅ **تسجيل الدخول من الواجهة يعمل** (يقرأ من `initialData.ts` المحلي)
- ❌ **تسجيل الدخول عبر الـ API سيفشل** (`fn_authenticate_user` لن يجد صفاً)

**الحل المطلوب:** مزامنة المستخدمين إلى جدول `users` (إضافة `erp_users` إلى مسار المزامنة الأولي).

---

## القرارات المتبقية

1. **مزامنة المستخدمين:** هل نضيف `erp_users` لمزامنة البيانات الأولية؟
2. **الأعمدة المنمّطة:** هل نقبل أن `tableStore` يكتب `payload` فقط (بلا أعمدة منمّطة) لتسريع الحفظ، أم نوحّده مع `recordWriter`؟