## 2026-10-14 — المراحل 3 و4 (محرك الشاشات · الأداء · البنية التشغيلية)

### المرحلة 3 — محرك الشاشات (Metadata Engine)
- **`scripts/neon_metadata_engine.sql`**: 5 جداول — `erp_views`, `erp_actions`,
  `erp_entities`, `erp_entity_fields`, `erp_screens`.
- **`scripts/generate_metadata_seed.ts`**: مولّد آلي يقرأ `SYSTEM_VIEWS` و
  `SYSTEM_ACTIONS` من الكود ويُخرج SQL. الناتج: **21 شاشة · 44 فعل · 6 كيانات · 32 حقل**.
- **`src/services/metadataRegistry.ts`**: خدمة العميل (تحميل من الـ API + كاش +
  كتالوج احتياطي مدمج حتى لا تتعطل الواجهة أبداً).
- **`server/src/index.ts`**: `GET /metadata/registry`.
- **`src/views/DynamicScreenView.tsx`**: شاشة عامة تُولّد جدولاً كاملاً من تعريف
  الكيان (عرض + بحث + ترقيم + تنسيق حسب نوع الحقل) — بلا كود مكتوب لكل حقل.
  تُفتح عبر المسار `meta_<entityCode>`، وترث صلاحية الشاشة التي ينتمي إليها الكيان.
- **خطأ واجهته عند الاختبار:** أول تشغيل للـ seed فشل لأن `erp_entities` يشير إلى
  `erp_views` (مفتاح أجنبي) قبل تعبئتها. فُصل المخطط عن البيانات وضُبط الترتيب.

### المرحلة 3 — الأداء (Code-splitting)
- **`vite.config.ts`**: تقسيم المكتبات (`vendor-react`, `vendor-charts`,
  `vendor-xlsx`, `vendor-icons`, `vendor-neon`, `vendor-motion`, `vendor-misc`).
- **`src/App.tsx`**: تحويل **36 شاشة** إلى `React.lazy` + `Suspense`.
- **النتيجة:** الملف الذي يجب تحميله قبل ظهور أي شاشة
  **من 3,827 KB إلى 515 KB** (تحسّن ~7.4×)، وباقي الشاشات تُحمَّل عند الطلب.

### المرحلة 4 — البنية التشغيلية
- **`scripts/neon_phase4_infrastructure.sql`**:
  - `outbox_events` (صندوق صادر) + `processed_events` (منع تكرار المعالجة).
  - `number_sequences` + `fn_next_document_number()` — تسلسل **بلا فجوات** إلزامي
    لفاتورة الضرائب المصرية.
  - **بج أُكتشف وأُصلح بالاختبار:** النسخة الأولى كانت تُفقد رقماً
    (`INV-1, INV-3, INV-4…`) بسبب معالجة خاصة للقيمة الابتدائية. أُعيد كتابة
    المنطق ليكون `next_value` هو الرقم المصروف نفسه.
- **`scripts/neon_phase4_missing_tables.sql`**: `attachments` · `currencies` ·
  `exchange_rates` · `eta_submissions` + فهارس Keyset لكل جدول كبير +
  دالة `ensure_monthly_partition()`.

### الاختبارات المنفّذة
| الفحص | النتيجة |
|---|---|
| `tsc` (الجذر + السيرفر) | 0 خطأ |
| `vitest run` | **63/63** |
| `vite build` | ناجح (515 KB بدل 3,827 KB) |
| ملفات المرحلة 4 على PostgreSQL حقيقي | ✅ تُطبَّق ومتكررة بأمان |
| **تسلسل الأرقام بلا فجوات** | ✅ `INV-1 … INV-5` |
| **تزامن: 20 طلب متوازٍ** | ✅ 20 رقماً فريداً، بلا فجوات، بلا أخطاء |
| بارتشنات سجل التدقيق | ✅ تُنشأ وتُدرج بنجاح |
| CI على GitHub | ✅ أخضر |

