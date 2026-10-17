# نسخ احتياطية — مخزن المستندات

## `app_records-backup-2026-10-16.json`

نسخة كاملة من جدول `app_records` قبل حذفه.

| البند | القيمة |
|---|---|
| عدد الصفوف | **3** |
| التاريخ | 2026-10-16 |
| السبب | إلغاء ازدواجية التخزين — الجداول المنمّطة هي المصدر الوحيد |

## المحتوى

| المجموعة | المعرّف | الجدول المنمّط | التحقق |
|---|---|---|---|
| `erp_warehouses` | `wh-alex-store` | `warehouses` | ✅ موجود |
| `erp_tenants` | `tenant-eg-003` | `tenants` | ✅ موجود |
| `erp_branches` | `branch-9513` | `branches` | ✅ موجود |

**كل سجل تم التحقق من وجوده في جدوله المنمّط قبل الحذف** — فلا يوجد فقدان بيانات.

## الاستعادة (لو احتجت)

```sql
-- مثال: استعادة سجل واحد
INSERT INTO warehouses (id, tenant_id, payload)
SELECT record_id, tenant_id, payload
  FROM json_populate_recordset(null::app_records, '<محتوى الملف>'::json);
```

أو يدوياً من الملف مباشرة — البنية واضحة: `tenant_id`, `doc_key`, `record_id`, `payload`.
