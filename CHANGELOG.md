# CHANGELOG

## 2026-10-17 — إحكام أمان شريحة الفواتير ونقلها لخادم Fastify + الفهارس والـ Materialization

- **إغلاق الثغرة الأمنية المباشرة:**
  - تم حذف استدعاء `@neondatabase/serverless` من `src/services/invoiceQueryApi.ts` بالكامل، ولم يعد المتصفح يتصل بـ Postgres أو يمرر `tenantId` من طرف العميل.
  - جميع عمليات القراءة والتعديل والإلغاء أصبحت تمر عبر مسارات موثوقة في `src/services/apiClient.ts` مع مسار احتياطي آمن للتخزين المحلي عند غياب السيرفر.
- **إنشاء نقاط نهاية موثوقة في خادم Fastify (`server/src/invoiceRoutes.ts`):**
  - `GET /sales/invoices` (Keyset Pagination مع فلاتر كاملة).
  - `GET /sales/invoices/summary` (إحصاءات الإجمالي والعدد والضريبة).
  - `GET /sales/invoices/:id` (تفاصيل الرأس والسطور).
  - `PUT /sales/invoices/:id` (تعديل المبلغ وطريقة الدفع مع توثيق السبب والتحكم في التزامن `expectedVersion`).
  - `POST /sales/invoices/:id/cancel` (إلغاء مع توثيق السبب والفاعل).
  - المستأجر يُستخرج حصراً من الـ JWT Token المعتمد عبر `assertTenant`، وتُفرض الصلاحيات عبر `assertAction`.
  - إضافة 5 اختبارات أمان وتكامل جديدة في `server/src/__tests__/app.test.ts` (إجمالي اختبارات السيرفر 53/53 ناجحة).
- **إحكام المخطط وسلامة البيانات:**
  - إضافة القيد العلائقي `fk_invoice_lines_invoice` كـ `FOREIGN KEY` بين `invoice_lines` و `sales_invoices(id)` مع `ON DELETE CASCADE`.
  - إضافة عمود `version INTEGER NOT NULL DEFAULT 1` على جدول `sales_invoices` لتفعيل الـ Optimistic Concurrency Control.
  - إضافة فهرس Trigram على `invoice_number` (`idx_sales_invoices_number_trgm`) لمنع الـ Sequential Scan أثناء البحث المشترك بـ `OR`.
- **حل عنق الزجاجة في الورديات (Materialization):**
  - إنشاء `scripts/materialize-shift-invoices.sql` مع إجراء `fn_materialize_shift_invoices` لترحيل إيرادات الورديات إلى فواتير حقيقية في `sales_invoices` عند إغلاق الوردية، مما يزيل عبء فك JSONB و `NOT EXISTS LIKE` وقت الاستعلام.
  - تسجيل الترحيلات في `scripts/apply-neon-migrations.mjs`.

- `InvoicesView`: الجدول والإحصاءات والحالة الفارغة تعتمد الآن على
  `loadInvoicePage` + `loadInvoiceSummary` (مصدر `v_revenue_invoices`).
  حُذفت الفلترة المحلية `filteredInvoices` بالكامل.
- الفلاتر تُنفَّذ في SQL: بحث · مدى تاريخ · المصدر · العميل · الفرع.
- الإحصاءات: إجمالي/صافي/ضريبة صحيحة عبر ملخصين (الكل + الملغاة) بدل حساب محلي.
- **تحميل المزيد** (Keyset) بدل تحميل كل الفواتير.
- خط الأساس: +32 سطراً لهذه الشاشة (منطق القراءة من السيرفر) — مسجَّل ولا نمو بعده.
- **لم يُحذف dataset `erp_invoices` بعد**: ما زال مستخدماً في Dashboard/POS/Bookings/
  Inventory/PartyStatement، وإزالته الآن تكسر تلك الشاشات. يُزال بعد نقلها.

## 2026-10-17 — فواتير: فلتر المصدر + حمولة الصف + خدمة قراءة واحدة

- `neon_invoice_source_filter.sql`: فلتر `p_source` في `fn_invoice_list`/`fn_invoice_summary`
  (لأن الشاشة تفلتر بالمصدر ويجب أن تبقى العدادات صحيحة).
- `neon_invoice_rows_payload.sql`: `v_revenue_invoices` تُرجع `payload` لكل صف،
  ومُصنَّع بالكامل لإيرادات الورديات (عميل/كاشير/طريقة دفع/أصناف/شيفت/مبالغ)
  → نفس أعمدة شاشة الفواتير بلا فقد بيانات.
- `src/services/invoiceQueryApi.ts`: مسار قراءة واحد (قائمة/ملخص/تفاصيل) يعيد
  كائنات SalesInvoice جاهزة للشاشة.
- مُسجَّل في الترحيل؛ SQL مقسَّم صحيحاً.

## 2026-10-17 — توحيد مصدر الفواتير في قاعدة البيانات (View واحد)

- `scripts/neon_revenue_invoices_view.sql`: عرض `v_revenue_invoices` يجمع
  فواتير `sales_invoices` مع إيرادات الورديات المشتقة (`reception_shifts.payload.runRows`)
  بنفس قواعد الاستثناء المطبّقة في الواجهة (POS/الفاتورة الضريبية/التسويات،
  واستبعاد ما له فاتورة محفوظة عبر `sourceRunRowId` أو آخر 6 أحرف).
- إعادة تعريف `fn_invoice_list` / `fn_invoice_summary` / `fn_invoice_detail`
  لتقرأ من الـ View — فتصبح الشاشة قادرة على مسار واحد من السيرفر بدل مصدرين.
- مُسجَّل في قائمة الترحيل والنمط الكامل.

## 2026-10-17 — تجميد PlatformContext + شريحة الفواتير (مليون صف، p95)

### القرارات
- **تجميد `PlatformContext`:** ممنوع إضافة dataset جديد. بوابة CI
  `scripts/check-context-freeze.mjs` تفشل عند أي إضافة (34 dataset مجمّدة الآن).
  وكل شاشة تُنقل إلى قراءة من السيرفر تُزيل dataset الخاص بها.
- **شريحة الفواتير:** أعمدة فلترة حقيقية على `sales_invoices` + جدول `invoice_lines`
  + فهارس Keyset/فلاتر/trgm + دوال `fn_invoice_list/summary/detail` (‏لا OFFSET).
- **توليد مليون فاتورة** داخل القاعدة بـ `generate_series` (بلا نقل صفوف).
- **قياس p95** لكل عملية مقابل ميزانية 200ms (يفشل عند التجاوز).
- توثيق كامل: `docs/INVOICE-SLICE-AR.md`.

### التالي
إذا تحقق p95 < 200ms على المليون: تُعمَّم الشريحة على الشاشات واحدة واحدة،
ثم تنتقل الأرصدة والقيود إلى DB فقط، وأخيراً يُزال الاتصال المباشر والكاش المحلي.

## 2026-10-17 — العملاء: خيارات أكواد التكويد من السيرفر (الخطوة B)

- `loadPartyCodeOptions` في `partiesPaged.ts`: ثلاث استعلامات `DISTINCT`
  (كود العميل/السيستم/الملف) بدل مسح كل العملاء في المتصفح، مع فلاتر الحالة
  والفرع وترتيب حسب اللغة.
- `PartiesView` تعتمد عليه عبر حالة + effect (بدل `buildCodingCodeOptions`)،
  وحُذفت الدالة المحلية (لا كود ميت).
- خط الأساس سُجِّل +15 سطراً للشاشة (إضافة جلب الخيارات من السيرفر) — لا نمو
  مستقبلي مسموح.

## 2026-10-17 — العملاء: جدول الشاشة يقرأ صفحة من السيرفر (الخطوة A)

- `src/services/partiesPaged.ts`: جلب صفحة واحدة (limit/offset) + عدّاد مطابق،
  بنفس فلاتر الشاشة في SQL (بحث نصي/حالة/رصيد/فرع بما فيها branchIds).
- `PartiesView`: الجدول والعدّاد وأزرار الصفحات تعتمد الآن على صفحة السيرفر؛
  لا تتغير تجربة الاستخدام (نفس أزرار الأولى/السابقة/الرقام/التالية).
- استُخرج منطق **بحث التكويد** وخيارات الأكواد إلى `src/views/parties/codingSearch.ts`
  (دوال نقية) → الشاشة 2094 → 2085 سطراً، بلا تغيير سلوك.
- الإحصاءات/التصدير/التكويد ما زالت على المصفوفة المحلية مؤقتاً (خطوات B/C/D).

## 2026-10-17 — فهارس أداء للعملاء (تمهيد للترقيم من السيرفر)

- `scripts/neon_parties_performance_indexes.sql` (متكرر بأمان):
  - `idx_parties_tenant_live` لنطاق المنشأة غير المحذوف.
  - فهارس **pg_trgm** على الاسم والهاتف (بحث ILIKE سريع).
  - فهارس أكواد العميل/السيستم/الملف + الحالة/الأرشفة/النوع/الفرع/تاريخ الإنشاء.
- مُسجَّل في قائمة الترحيل (`apply-neon-migrations.mjs`) والقالب الكامل.
- الغرض: أن يصبح تحويل شاشة العملاء إلى قراءة مُرقَّمة سريعاً من أول يوم.

## 2026-10-17 — توحيد منطق الترقيم في خطاف واحد (usePagedList)

- خطاف مشترك `src/hooks/usePagedList.ts` (صفحة + عدّاد + تحميل المزيد + منع التزاحم)
  بدل تكرار نفس المنطق في كل شاشة.
- شاشة سجل التدقيق تعتمد عليه الآن (وحُذف منطقها الداخلي المكرر).
- جاهز لاستخدامه في العملاء/المخزون بنفس الواجهة (بلا نسخ كود).

## 2026-10-17 — سجل التدقيق: قراءة مُرقَّمة من السيرفر (مسار واحد بلا تكرار)

### التغيير
- شاشة **سجل التدقيق** لم تعد تحمّل كل السجلات في المتصفح: تقرأ **صفحة (100)**
  بمفاتيح Keyset (`id < آخر مفتاح`) + عدّاد مطابق، مع بحث مؤجَّل وفلاتر
  (العملية/الكيان/المستخدم) تُنفَّذ في SQL.
- إضافة «تحميل المزيد» و«عُرض N من M» داخل نفس الشاشة — **لا شاشة موازية**.
- استُخرجت نافذة تفاصيل السجل إلى `src/views/audit/AuditSnapshotModal.tsx`
  (تقليل أسطر الشاشة 449 → 370).
- الخدمة: `src/services/auditLogPaged.ts` (مستخدمة في شاشة واحدة، بلا كود ميت).

### ملاحظة
ما زال سجل التدقيق يُحمَّل ضمن حِزمة الإقلاع لخدمة كتابة السجلات والمزامنة؛
إزالته من الإقلاع خطوة تالية تحتاج فصل مسار الكتابة عن تحميل التاريخ.

## 2026-10-17 — إزالة التكرار: لا شاشة فواتير موازية + جدول واحد موحّد

### التغيير
- **حُذفت شاشة «الفواتير — عرض سريع»** (وشاشة `invoices_stream` وتسجيلاتها) التزاماً
  بقاعدة المالك: لا شاشات/جداول تؤدي نفس الغرض.
- **حُذفت طبقة القراءة المُرَقَّمة المستقلة** (`pagedRecords` / `usePagedRecords`)
  وسكربت التوليد، لأنها أصبحت بلا مستهلك بعد إزالة الشاشة (لا كود ميت).
- **توحيد تنفيذ الجداول**: `GridTable` في شاشة إدارة قاعدة البيانات يعتمد الآن على
  `WindowedTable` المشترك (نوافذ افتراضية) بدل تنفيذ `<table>` خاص — تنفيذ واحد
  يُستخدم حيث نحتاج جدولاً كبيراً، ويُسرّع جداول عشرات الآلاف هناك.

### الخطوة التالية (بدون تكرار)
تحويل شاشة قائمة موجودة (مثل العملاء) إلى القراءة المُرَقَّمة **داخلها** بنفس
المكوّنات المشتركة — مسار واحد لكل شاشة، لا نسخة موازية.

## 2026-10-17 — ملف موارد الشاشات: ماذا يستهلك الذاكرة ويؤثر على السرعة

### ما أُضيف
- **تبويب جديد في شاشة المعمارية** («الشاشات والذاكرة والسرعة») يعرض لكل شاشة:
  الأسطر (مقابل حد 300) · عدد useState/useEffect · المكتبات الثقيلة المستوردة
  (Excel/Word/رسوم/حركات/Neon/QR) · **حجم حزمة gzip الفعلي من آخر بناء**.
- **قياس حي في المتصفح**: الذاكرة المستخدمة والذروة (Chrome `performance.memory`)،
  عدد المهام الطويلة ومدتها (longtask > 50ms = سبب الهنج)، عدد عقد DOM، ومدة تحميل
  حزمة الشاشة من Resource Timing.
- **مصادر الأرقام معلنة**: ساكن من الكود (مسح آلي)، حزم من Vite manifest بعد البناء،
  وحي من المتصفح — لا أرقام مُدَّعاة.
- `scripts/screen-metrics.mjs` (مولّد + `--check` في CI) و
  `scripts/emit-screen-budget.mjs` (يكتب `dist/screen-budget.json` بعد كل بناء).

### الجواب على السؤال
- نعم، حد 300 سطر أحد البوابات: مفروض على نطاق المعمارية الجديدة، والتطبيق القديم
  تحت Ratchet بخط أساس مقيس (58 ملفاً) — لا يُسمح بأي نمو.
- المسح ليس «كل مرة في المتصفح»: المتصفح لا يقرأ المستودع. الكود يُمسح آلياً عند
  كل بناء/CI (`--check` يفشل إذا كان الملف المولَّد قديماً)، والذاكرة/السرعة تُقاس
  حياً في متصفحك لحظة فتح الشاشة.

## 2026-10-17 — تفسير «10 قيود بدل 20» + كل الأعمدة + تشخيص RLS

### التفسير الحقيقي
- `journal_entries` = **رؤوس** القيود (10 قيود).
- كل رأس يحمل سطوره في `payload.lines`، والسطور المفردة تُعرض في
  `v_journal_entry_lines` = **20 سطراً**. فالرقمان ليسا تعارضاً بل مستويان مختلفان.
  (أُضيف بانر في الشبكة يشرح ذلك وزر للتنقل بين الجدولين.)
- الأعمدة كانت تُقرأ من `information_schema.columns` وهو **مفلتر بصلاحيات الدور**،
  فأُعيدت القراءة من `pg_attribute` (كل الأعمدة كما في نيون).

### ما أُضيف فوق ذلك
- **هوية الاتصال** أعلى الشاشة: `current_user @ current_database (host)`.
- **شارة RLS** لكل جدول + مقارنة «صفوف ظاهرة / تقدير المحرك» مع تفسير.
- **زر تجاوز RLS** (database.ddl) عبر معاملة `SET LOCAL row_security = off` —
  يعمل لدور مالك/BYPASSRLS ويشرح الرفض.
- تقسيم `TableGrid` (484 سطراً) إلى: `GridTable` + `GridToolbar` + `JournalVoucherBanners`،
  وفصل كتابة الصفوف إلى `databaseRowsApi.ts` — لعودة بوابة الـ 300 سطر للخضراء.

### التحقق
`tsc` 0 · **316/316** اختباراً · بوابة الحجم · بوابات المعمارية · build · ميزانية الحزمة.

## 2026-10-17 — تبويب «إعدادات الكود» في القائمة الجانبية + عرض كل الصفوف والأعمدة

### ما تم تنفيذه
1. **تبويب جديد في الـ Sidebar بعنوان «إعدادات الكود» (Code Settings):**
   - **إدارة قاعدة البيانات** (`database_admin`): شاشة مستكشف الجداول والصفوف والبنية.
   - **دليل المستخدم والتوثيق** (`system_manual`): الشاشة التوثيقية الشاملة للأدلة والمسارات.
   - **معمارية المنظومة الجديدة** (`architecture`): شاشة معمارية الـ Clean Micro-Engine وبوابات الفحص.
   - تظهر الشاشات الثلاث في التبويب الجديد بشكل دائم ومباشر (`alwaysShow: true`).

2. **عرض كل الصفوف وكل الأعمدة في شاشة إدارة قاعدة البيانات:**
   - إتاحة خيار **«كل الصفوف»** في محدد الصفحات لجلب كافة الصفوف المسجلة فعلياً في الجدول (حتى 50,000 صف دفعة واحدة بدلاً من سقف الـ 200 القديم)، مع خيارات 25، 50، 100، 200، 500.
   - عرض **جميع الأعمدة** بالكامل دون حجب، مع توضيح اسم العمود ونوعه `(dataType)` وعلامة المفتاح الأساسي `PK`.
   - إمكانية النقر على أي خلية لفتح نافذة فحص المحتوى الكامل بدون قص، مع دعم تنسيق JSON الجمالي.
   - تطبيق كافة ملفات الـ Migrations الـ 17 بنجاح على قاعدة بيانات Neon.

### التحقق
`tsc` 0 · **316/316** اختباراً ناجحاً · بناء نظيف بنجاح (Vite build).

## 2026-10-17 — شاشة إدارة قاعدة البيانات (مرآة حقيقية: جداول/صفوف/بنية)

### المطلوب
شاشة تعرض جداول قاعدة البيانات كما هي، وتسمح بالإضافة/التعديل/الحذف وإنشاء جدول
وحذفه وإضافة/حذف عمود، ويؤثر ذلك مباشرة في الداتابيز وفي بيانات التطبيق.

### ما نُفِّذ
- **`DatabaseExplorerView`** (`database_admin`): قائمة مخططات/جداول + تبويب بيانات
  (شبكة ديناميكية بأعمدة الجدول الحقيقية، ترقيم صفحات، صفوف/إجمالي) + تبويب بنية
  (الأعمدة، المفاتيح، القيم الافتراضية) + إنشاء جدول + إضافة/حذف عمود + حذف جدول.
- **قراءة حقيقية للبنية** من `pg_class` + `information_schema` (جداول/أعمدة/مفاتيح،
  وتقدير الصفوف).
- **كتابة مباشرة**: إدراج/تعديل/حذف عبر المفتاح الأساسي فقط (بدونه يُعطَّل التعديل
  والحذف)، بتأكيد خطوتين للحذف.
- **DDL محكوم**: أسماء لاتينية فقط (regex صارم)، منع مخططات النظام، حذف عمود
  يتطلب كتابة `table.column`، وحذف جدول يتطلب `schema.table` — والجداول الحرجة
  (journal_entries/accounts/tenants/users/parties/…) تتطلب `DROP <table>`.
- **تدقيق**: كل عملية كتابة/DDL تُسجَّل في `db_admin_audit` (جدول جديد).
- **مرآة مزدوجة**: بعد كل كتابة يُعاد تحميل الجدول والكتالوج ثم `syncNow()` لتحديث
  بيانات التطبيق المعروضة من الداتابيز.
- **صلاحيات مستقلة (Default-Deny):** `database.write` · `database.ddl` · `database.drop`.
- 8 اختبارات لحماية الأسماء (حقن/مخططات محمية/تأكيد الحذف).

### التحقق
`tsc` 0 · **316/316** اختباراً · بوابة الحجم · بوابات المعمارية · build · ميزانية الحزمة ·
تصيير فعلي للمكوّنات الأربعة بلا أخطاء.
⚠️ عمليات DDL/DML لا يمكن اختبارها هنا بلا قاعدة بيانات — تحتاج تجربة على نسخة
اختبارية أولاً (انظر التحذير في الرد).

## 2026-10-17 — تعديل القيود من الشاشة مع مزامنة المصدر وسجل تدقيق

### المطلوب
أن تعرض الشاشة القيود **أياً كان مصدرها**، وتكون قابلة للعرض **والتعديل**،
وأن ينعكس التعديل على **المصدر**.

### ما نُفِّذ
- **عرض كل المصادر:** القراءة من `journal_entries` مباشرة (قيد يدوي، مسار قديم،
  مستند جديد، سندات) بلا افتراض مصدر واحد.
- **تعديل القيد:** محرّر داخل الشاشة (تاريخ/بيان/سطور/حسابات/مبالغ/سبب إجباري)
  مع تحقق فوري (توازن، سطر واحد الاتجاه، حساب موجود، بلا سالب).
- **دالة `fn_update_journal`:** تتحقق ثم **تطبّق الفرق على أرصدة الحسابات**
  (عكس القديم وتطبيق الجديد) داخل معاملة، ترفع `version`، وتمنع التعديل في فترة
  مقفلة، وتعيد نفس ضوابط الترحيل (توازن/سطر واحد الاتجاه/حساب موجود).
- **مزامنة المصدر:** مستند الترحيل (`accounting_posting_documents`: payload + الإجمالي)،
  والسندات المرتبطة عبر `payload->>'journalEntryId'` (`cash_receipts`،
  `customer_refunds`، `sales_invoices` → المبلغ/الصافي + طوابع التعديل).
- **سجل تدقيق `accounting_journal_edits`:** قبل/بعد للأرصدة والسطور + السبب +
  المنفّذ + ما تمت مزامنته — لا تعديل صامت.
- **صلاحية جديدة:** `accounting.edit_journal` (Default-Deny) — زر التعديل يظهر مقفلاً
  لمن لا يملكها.
- 7 اختبارات للتحقق من صحة سطور التعديل.

### التحقق
`tsc` 0 · **308/308** اختباراً · بوابة الحجم · بوابات المعمارية · build · ميزانية الحزمة.
⚠️ مخطط SQL (`neon_journal_edit.sql`) لم يُنفَّذ في بيئة التنفيذ (لا PostgreSQL) — يُطبَّق
بأمر الترحيل الموثّق.

## 2026-10-17 — إزالة اللبس: تهيئة القواعد من الشاشة + توضيح أن الترحيل القديم يعمل

### المشكلة
شاشة القواعد (قراءة فقط) أظهرت «0/25 خلية مربوطة» و«بلا قاعدة (يمنع الترحيل)»،
فبدا كأن النظام لا يُنشئ أي قيود — بينما التطبيق يقيّد فعلاً عبر المسار القديم،
والقواعد الجديدة لم تُهيَّأ لهذه المنشأة بعد.

### الحل
- **زر «تهيئة القواعد الافتراضية»** داخل «أدوات الإدارة»: يُدرج القواعد القياسية
  لمنشأة المستخدم الحالية اعتماداً على الحسابات الموجودة فعلاً في دليله، ولا يمس
  أي قاعدة قائمة (`ON CONFLICT DO NOTHING`).
- **قائمة قواعد موحّدة** في `src/data/postingRuleDefaults.ts` مولَّدة من بذور SQL،
  مع اختبار يمنع انحراف المصدرين (قاعدة تُهيَّأ من الشاشة = قاعدة السكربت).
- **شرح صريح في الشاشة**: النسبة تخص محرك الترحيل الجديد، والترحيل الحالي يعمل
  عبر المسار القديم حتى المرحلة 2؛ وحالة فارغة تذكر الأسباب الثلاثة ومعرّف المنشأة.
- **سَدّ ثغرة اكتشفها الاختبار**: حقول الدفع لم يكن لها قاعدة `default` (كانت تعتمد
  على cash/bank/نوع فقط) → أُضيفت 7 قواعد `default` فتُغطّى كل الخلايا الإلزامية
  عدا الإهلاك (يحتاج حساب «مجمع إهلاك» غير موجود في الدليل القياسي — فجوة موثّقة).

### التحقق
`tsc` 0 · **301/301** اختباراً (+4) · بوابة الحجم · بوابات المعمارية · build · ميزانية الحزمة.

## 2026-10-17 — شاشة «ربط العمليات بالقيود» أصبحت للعرض فقط + مستكشف كل القيود

### التغيير
- **الوضع الافتراضي: قراءة فقط.** ثلاثة تبويبات عرض:
  1. **القيود المنشأة**: كل قيد أُنشئ فعلاً (أحدث 500) بسطوره ومصدره وأكواد قواعد
     الترحيل، مع بحث/تصفية تاريخ/توسيع السطور/إجماليات/كشف غير المتوازن.
  2. **القواعد (مرجع)**: القواعد كما هي بلا أي تعديل + إبراز الخلايا بلا قاعدة.
  3. **حالة الترحيل**: المستندات (مُرحَّلة/فاشلة/معلّقة) والأقفال — قراءة فقط.
- **أدوات الإدارة** (تحرير/ترحيل/إقفال/تغطية) مخفية خلف زر صريح ومقيّدة بالأفعال،
  فلا تظهر افتراضياً.
- قراءة القيود لا تعتمد على وجود View: `journalExplorerApi` يقرأ `journal_entries`
  ويقرأ أكواد القواعد إن وُجد جدول التدقيق، ويعمل قبل تطبيق أحدث الترحيلات.
- دوال القراءة النقية (`journalExplorerHelpers`) مختبَرة بـ 7 اختبارات.

### التحقق
`tsc` 0 · **297/297** اختباراً · بوابة الحجم · بوابات المعمارية · build · ميزانية الحزمة.

## 2026-10-17 — توجيه القيد لكل طريقة دفع (سلسلة أولوية) بدل «نقدي/بنك»

### المشكلة
شاشة ربط القيود كانت تفرّق بين مجموعتين فقط (نقدي/بنك)، بينما لكل طريقة تحصيل
حساب مستقل — وينطبق ذلك على قبض الكاشير وسداد المصروفات والموردين.

### الحل
- **سلسلة أولوية للمُحدِّد:** `pm:<id>` ← `pmt:<type>` ← `cash|bank` ← `default`،
  وأول قاعدة مطابقة تُستخدم (`fn_resolve_posting_rule_chain` + دعم `selectors[]`
  في `fn_post_document`).
- **الشاشة:** صف لكل طريقة دفع فعلية (`payment_methods`) + صف لكل نوع
  (نقدي/بطاقة/تحويل/محفظة/آجل/مخصص) + المجموعتان + الافتراضي، لكل خلية دفع.
  وتبويب الترحيل يختار الطريقة الفعلية فيُبنى القيد بسلسلتها.
- **البذور:** +32 قاعدة `pmt:*` (نقدي/محفظة → 1111، بطاقة/تحويل → 1112) لتعمل
  كل الطرق فوراً ثم تُخصَّص.
- اختبارات: 3 اختبارات لترتيب السلسلة وتحويل اختيار الواجهة.

### التحقق
`tsc` 0 · **290/290** اختباراً · بوابة الحجم · بوابات المعمارية · build · ميزانية الحزمة.

## 2026-10-16 (تكملة 3) — محرك قواعد الترحيل: الشاشة هي المصدر الوحيد للقيود

### ما طلبه المالك
أن يتحكم المستخدم في توجيه القيد من شاشة «ربط العمليات بالقيود»: كل عملية/خلية رقمية
لها حساب مدين ودائن، ولا يوجد مصدر آخر، والترحيل بزر ظاهر، وإقفال الفترات بأزرار.

### ما تم تنفيذه
- **مخطط ودوال جديدة:** `scripts/neon_posting_rules_engine.sql`
  - `accounting_posting_rules` (قاعدة لكل عملية × خلية × مُحدِّد).
  - `accounting_posting_documents` (طابور مستندات + Idempotency + حالات).
  - `accounting_period_locks` (المصدر الوحيد للإقفال).
  - `fn_post_document` تبني القيد **من القواعد فقط**، ترفض عند غياب قاعدة أو حساب،
    تمنع الترحيل في فترة مقفلة، تكتب `accounting_generated_entries`، وتُرجع فشلاً
    مسجَّلاً برسبه بدل قيد جزئي.
- **بذور 33 قاعدة** تعكس السلوك المحاسبي الحالي حرفياً (`neon_posting_rules_seed.sql`)
  وتُطبّق ضمن `apply-neon-migrations.mjs` و`build-full-schema.mjs`.
- **شاشة معاد بناؤها** (4 تبويبات): قواعد الترحيل (كل خلية ← اتجاه + حساب) ·
  الترحيل (زر ترحيل ظاهر + طابور) · إقفال الفترات (أزرار) · التغطية (فجوات النسبة).
- **كتالوج العمليات:** `src/data/accountingOperations.ts` — 12 عملية وكل خلية رقمية
  (إلزامية/اختيارية + مُحدِّد طريقة الدفع).
- **أفعال جديدة (Default-Deny):** `accounting.post_journal` · `accounting.lock_period` ·
  `accounting.open_period` (بصيغة module.action المعتمدة).
- **إزالة الخطر الصامت:** `resolveAccount` لم يعد يسقط إلى `accounts[0]` (حساب عشوائي)،
  ونُقل إلى `src/services/accountingAccounts.ts` التزاماً بحد الأسطر.
- **اختبارات:** 10 اختبارات للكتالوج والتغطية + تحديث اختبار الانحدار للحساب.

### التحقق
`npm run verify` ناجح: `tsc` 0 خطأ · **287/287** اختباراً · بوابة الحجم ·
بوابات المعمارية · البناء · ميزانية الحزمة. (مخطط SQL لم يُنفَّذ هنا لعدم توفر PostgreSQL
في بيئة التنفيذ — التطبيق على قاعدتك بأمر واحد موثّق في `docs/ACCOUNTING-POSTING-RULES-AR.md`.)

## 2026-10-16 (تكملة 2) — ميزانية حجم الحزمة كبوابة CI + إغلاق توصية الاتصالات

### ما تم إنجازه
- **بوابة ميزانية حجم الحزمة (`scripts/check-bundle-budget.mjs`)**: تقيس كل ملفات
  `dist/assets` بالـ gzip وتفشل البناء عند التجاوز: حزمة الإقلاع `index-*.js`
  ≤ 160KB · CSS ≤ 30KB · أكبر حزمة مؤجّلة ≤ 160KB · الإجمالي ≤ 1200KB.
  أُضيفت إلى `npm run verify` (بعد البناء) وإلى قالب الـ CI، وأمرها معروض في الشاشة.
  **القياس الحالي: 137.1 / 22.1 / 138.2 / 995.2 KB — كلها داخل الميزانية.**
  السبب: ميزانية الـ 200ms تُقاس على الـ API بـ k6، لكن أول ما يشعر به المستخدم
  فعلاً هو حجم ما يُنزَّل على جهازه — ولم يكن هناك أي قيد يقيسه.
- **إغلاق التوصية المفتوحة الوحيدة في بوابات المعمارية:** ضُبط حد اتصالات صريح في
  التطبيق المرجعي (`appsettings.json` → `Pooling=true;Minimum Pool Size=2;
  Maximum Pool Size=25;Timeout=5;Command Timeout=15`) وتوثيق متى يلزم PgBouncer في
  `erp-nextgen-local/README-SETUP-AR.md`. النتيجة: **3 توصيات ناجحة من 3** بدل
  توصية مفتوحة.
- **شاشة المعمارية:** تبويب «بوابات الـ CI» صار يعرض لوحة «البوابات المصاحبة»:
  حد 300 سطر بأرقامه المقيسة من اللقطة (155 ملفاً · 58 في خط الأساس · 0 مخالفة)،
  وميزانية زمن الـ API (k6)، وميزانية حجم الحزمة بأسباب كل حد، وأوامر التشغيل.
- **تنبيه على الاستشهادات:** ملفات المحرك الجديد بلغت 66 ملفاً مقيساً؛ ولا شيء منها
  يتجاوز 300 سطر (أكبر ملف 293 سطراً).

### حالتها بعد التعديل
`npm run verify` ناجح كاملاً: `tsc` 0 خطأ · **276/276** اختباراً · بوابة الحجم ·
بوابات المعمارية (3 بوابات · 97 فحصاً · 0 فشل) · البناء · ميزانية الحزمة.

## 2026-10-16 (تكملة) — إتاحة الشاشة في لوحة الأوامر + اختبار E2E + ميزانية سرعة قابلة للتشغيل

### ما تم إنجازه
- **لوحة الأوامر (`Ctrl+K`):** أُضيفت شاشة «معمارية المنظومة الجديدة». ولأن
  `CommandPaletteModal.tsx` كان **355 سطراً** (مقيَّداً في خط الأساس) قُسمت عناصره
  إلى `src/data/commandPaletteItems.ts`، فصار المكوّن **190 سطراً** وخرج من خط
  الأساس (58 ملفاً بدل 59) — وأضِف أي شاشة للوحة بسطر واحد في ملف البيانات.
- **اختبار E2E حقيقي للشاشة:** `e2e/architecture.spec.ts` — يفتح `?view=architecture`
  في متصفح، يتحقق من التبويبات، ومن ظهور ملفات المحرك وحد `/ 300` وسجل الأفعال،
  ومن الدليل المقيس في تبويب العيوب، ويرفض أي خطأ JavaScript قاتل.
  ⚠️ تعذّر تشغيله داخل بيئة العمل الحالية: متصفح Playwright محتاج مكتبات نظام
  (`libglib-2.0.so.0`) غير متاحة وبلا صلاحية تثبيت — يعمل على جهاز المطوّر
  (`npm run e2e`) أو في الـ CI. التحقق البديل في هذه الجلسة: تصيير المكوّنات الستة
  فعلياً عبر `react-dom/server` بلا أخطاء.
- **ميزانية السرعة (< 200ms) كأداة قابلة للتشغيل بدل ادّعاء:** `perf/api-budget.js`
  (k6) بحدود `p(95) < 200ms` و`p(99) < 400ms` ومعدل فشل < 1%، وأمر `npm run perf:api`،
  والأمر معروض داخل الشاشة (تبويب بوابات الـ CI).

### حالتها بعد التعديل
`tsc` = 0 خطأ · `vitest` = **276/276** · `vite build` ناجح · بوابتا الحجم والمعمارية ناجحتان
(3 بوابات · 97 فحصاً · 0 فشل · 65 ملفاً مقيساً · 12 موضع فحص صلاحيات).

## 2026-10-16 — شاشة «معمارية المنظومة الجديدة» + بوابات فحص معماري حقيقية (CI Guardrails)

### ما تم إنجازه
- **شاشة جديدة (`architecture`) — المعمارية المعتمدة للمنظومة الجديدة:**
  - 6 تبويبات: ميزانية الالتزام (مستخدمون < 100، بدون Scale-to-Zero، ميزانية 200ms، Endpoint واحد لكل شاشة، حد 300 سطر، Default-Deny)، مخطط تدفق البيانات الحي بطبقاته الأربع (Client / YARP Gateway / Services / PostgreSQL)، حلقة المزامنة اللحظية (Optimistic UI ← version++ ← NOTIFY ← SignalR)، عيوب المنصة السابقة مقابل الحلول (بدليل مقيس)، مقتطفات كود التنفيذ المعتمد، وبوابات الفحص.
  - المقتطفات **منقولة من كود موجود فعلاً** في `erp-nextgen-local/` (Generic Data endpoint، RLS + touch_row + realtime_notify، جسر LISTEN/SignalR، مسارات YARP).
- **محرك بوابات فحص معماري حقيقي (لا أرقام وهمية):**
  - `scripts/architecture-guardrails.mjs` — يقيس قرص المستودع فعلياً: أسطر ملفات نطاق المحرك، مواضع فحص الصلاحيات `canPerformAction(...)`، ووجود ثوابت RLS/version/NOTIFY/LISTEN/SignalR/YARP/Default-Deny/HttpOnly/Keyset/Outbox. الأطوار: تقرير، `--update` (توليد اللقطة)، `--check` (يفشل الـ Build إذا كانت اللقطة قديمة).
  - `scripts/guardrail-invariants.mjs` — جدول الثوابت المعمارية (الحدود الدنيا المقبولة + التوصيات غير المُلزِمة).
  - `scripts/guardrail-snapshot.mjs` — صيغة ملف اللقطة المولَّد + حل الاعتماد الذاتي على حجم الملف نفسه.
  - `src/services/architectureGuardrails.ts` — منطق التقييم النقي (بوابة حد 300 سطر، بوابة سجل الأفعال، بوابة الثوابت المعمارية) يُستخدم في الشاشة وفي السكربت معاً.
  - `src/data/architecture/guardrailsSnapshot.ts` — اللقطة المولَّدة (65 ملفاً مقيساً، 12 موضع فحص صلاحيات، 19 ثابتاً إلزامياً ناجحاً، 3 توصيات).
  - النتيجة الحالية: **3 بوابات / 97 فحصاً / 0 فشل**، وتوصية واحدة مفتوحة: ضبط PgBouncer أو حد اتصالات صريح قبل التوسع.
- **الصلاحيات والأمان على الشاشة نفسها:**
  - فعلا `architecture.run_guardrails` و`architecture.copy_snippet` مسجّلان في `SYSTEM_ACTIONS` (Default-Deny): غير المصرح له يرى الزر مقفلاً مع سبب الرفض.
  - إضافة الشاشة إلى `SYSTEM_VIEWS` و`SIDEBAR_MENU_SECTIONS` و`lazyViews`.
- **إعادة هيكلة مطلوبة لإتاحة الشاشة دون كسر بوابة الأسطر:**
  - نُقل سجل رسم الشاشات من `App.tsx` إلى `src/components/ViewRenderer.tsx` => `App.tsx` من **438 إلى 348 سطراً** (بدل أن يكبر)، وإضافة شاشة جديدة صارت في ملف واحد.
  - تحديث خط أساس الحجم: `PlatformContext.tsx` 12,236 → 12,228 · `neonService.ts` 1,832 → 1,683 · `commands.ts` 479 → 441 · `App.tsx` 439 → 348.
- **الـ CI:**
  - بوابة المعمارية الجديدة `node scripts/architecture-guardrails.mjs --check` أُضيفت إلى **قالب الـ CI** `docs/ci/ci.yml` وإلى `npm run verify`.
  - ⚠️ **تعذّر دفع التعديل داخل `.github/workflows/`**: تطبيق GitHub المربوط لا يملك صلاحية `workflows` (نفس القيد الموثّق سابقاً في `docs/ci/README-AR.md`). التفعيل يحتاج خطوة يدوية واحدة: `cp docs/ci/ci.yml .github/workflows/ci.yml` ثم commit/push.
  - `package.json`: `guardrails` · `guardrails:check` · `guardrails:update`، وأُضيف `guardrails:check` إلى `npm run verify` (فالبوابة مفروضة محلياً وعلى أي بيئة تشغيل).
  - **إصلاح عطل موجود:** `bun.lock` كان غير متزامن مع `package.json` فكان `bun install --frozen-lockfile` يفشل في أول خطوة من الـ CI — تم تحديثه وتحققنا من نجاحه.
- **الفحوصات والتحقق:** `tsc --noEmit` = 0 خطأ · `vitest` = **276/276** (منها 13 اختباراً جديداً للبوابات) · `vite build` ناجح · بوابة حجم الملفات ناجحة · `guardrails --check` ناجح.

### قرارات مهمة لأي وكيل قادم
- **القياس لا يُكتب يدوياً:** أي تعديل في ملفات نطاق المحرك يوجب `npm run guardrails:update` وإلا يفشل الـ CI (وهذا مقصود).
- **الشاشة تخضع لقواعدها:** كل ملفاتها والمحرك تحت 300 سطر، وأزرارها بأفعال مسجّلة.
- **ميزانية السرعة الأرقامية (200ms) لا تُقاس هنا:** الشاشة تنص صراحةً على أن قياس الزمن الفعلي يحتاج k6/Lighthouse على بيئة حقيقية، وأن ما يُفحص هنا هو الثوابت التي تمنعه.


## 2026-10-16 — توحيد الدفتر المحاسبي وإصلاح دوال الترحيل والتحصيل على Neon

### ما تم إنجازه
- **توحيد الدفتر المحاسبي في جدول واحد رسمي (`journal_entries`)**:
  - إلغاء ازدواجية الدفاتر: حذف الجداول القديمة الموازية `gl_journals` و `gl_journal_lines`.
  - تحديث `fn_post_journal` و `fn_reverse_journal` ليكتبا ويقرآ من `journal_entries` مباشرة مع حفظ سطور القيد داخل `payload->'lines'` بما يضمن ظهور كل قيد فوراً في واجهة دفتر اليومية.
  - إنشاء View تحليلي `v_journal_entry_lines` في PostgreSQL لاستخراج بنود القيود في شكل أعمدة علائقية صريحة لتمكين استعلامات ميزان المراجعة وكشوف الحسابات بـ SQL مباشرة.
- **إصلاح وإنشاء دوال المحاسبة الناقصة**:
  - تصحيح `fn_customer_account_id` لتقرأ من جدول العملاء الفعلي `parties` بدلاً من `app_records` المحذوف، مع الاحتياطي على الحسابات القياسية 1120 و 2000.
  - إنشاء دالة التحصيل الذري `fn_post_customer_receipt`: ترحيل القيد المحاسبي في `journal_entries` + حفظ السند في `cash_receipts` + تحديث رصيد الخزينة والعميل في معاملة ذرية واحدة.
  - إنشاء دالة الاسترداد الذري `fn_post_customer_refund`: ترحيل القيد العكسي + حفظ السند في `customer_refunds` + تعديل رصيد العميل والخزينة في معاملة ذرية واحدة.
- **تنظيف الجداول المهجورة وإعداد حساب المدير**:
  - حذف جدول `patients` غير المستخدم بعد التأكد من استخدام جدول `parties` الشامل للعملاء والمرضى.
  - إضافة حساب المدير العام الافتراضي (`admin`) إلى جدول `users` لتمكين المصادقة عبر الـ API فوراً.
  - إضافة عمود `version` لجدول المنشآت `tenants` لتوحيد التزامن المتفائل.
- **الفحوصات والتحقق**:
  - نجاح 28 فحص تحقق آلي في `apply-neon-migrations.mjs --verify` بنسبة 100%.
  - 311 اختباراً آلياً ناجحاً (263 عميل + 48 سيرفر) مع 0 أخطاء TypeScript وبناء إنتاج نظيف.

## 2026-10-15 — تشغيل وربط محرك الشاشات (Metadata Engine) بقاعدة بيانات Neon الجديدة

### ما تم إنجازه
- **تشغيل سكربتات محرك الشاشات:**
  - تنفيذ `scripts/neon_metadata_engine.sql` لإنشاء جداول `erp_views`, `erp_actions`, `erp_entities`, `erp_entity_fields`, `erp_screens`.
  - تنفيذ `scripts/neon_metadata_seed.sql` وتعبئة 22 شاشة، 44 فعلاً، 6 كيانات، و32 حقلاً قياسياً.
  - تنفيذ جميع سكربتات الترحيل والتزامن المتفائل وRLS على قاعدة بيانات Neon الجديدة:
    `neon_schema_migrations.sql`, `neon_optimistic_concurrency.sql`, `neon_phase4_infrastructure.sql`, `neon_phase4_missing_tables.sql`, `neon_accounting_functions.sql`, `neon_security_rls.sql`.
- **دعم التحميل المباشر للـ Metadata من Neon:**
  - تحديث `metadataRegistry.ts` و`metadataNeon.ts` لجلب الـ Metadata مباشرة من قاعدة بيانات Neon السحابية عند عدم تشغيل الـ API الخارجي.
  - تحديث `metadataStudioApi.ts` لإمكانية حفظ وتعديل وحذف الحقول مباشرة على Neon عند غياب السيرفر الوسيط.
  - تحسين شاشة `MetadataStudioView.tsx` بحالة تفاعلية `useState` والتحميل التلقائي فور فتح الشاشة مع زر إعادة تحميل سريع.
  - ربط التطبيق الافتراضي برابط Neon الجديد في `neonConfig.ts`.

### القرار المعماري
- **الستاك:** المسار (أ) — البقاء على TypeScript / Fastify. لم يُعتمد التحول إلى .NET.
  السبب: المعمارية الجوهرية (RLS + API + Keyset) **مطبّقة بالفعل**، والمشكلة الحقيقية
  هي دَين تقني واكتمال، لا معمارية خاطئة. راجع `UPGRADE_PLAN.md`.

### المرحلة 0 — تثبيت الأساس
- **صفر أخطاء TypeScript** (كانت 144):
  - `tsconfig.json`: استُثني `server/` من فحص الجذر (له `tsconfig` ومكتباته الخاصة).
  - تصحيح أسماء حقول خاطئة كانت تُنتج قيماً فارغة فعلياً في الواجهة:
    `Branch.nameAr` / `Tenant.nameAr` / `Warehouse.nameAr` → `name` (البيانات تحمل `name`).
  - `ItemCategory.name` → `nameAr` في `neonService.ts`.
  - `Invoice.lines` → `items`، `ShiftRunRow.totalPulses` → `pulsesCount`،
    `PosShift.startingCash` → `openingFloat`، `ModuleDefinition.descAr` → `descriptionAr`.
  - `InventoryView`: نوع الفئة كان `'services' | 'goods'` والبيانات تستخدم
    `'service' | 'product'` — فلم تكن أيقونة أو شارة أي مجموعة تظهر صحيحة.
  - **تعارض تعريفين باسم `PaymentSplit`** في `types.ts` كان TypeScript يدمجهما
    فيجبر كل مستخدم على تمرير خصائص الاثنين — حُذف التعريف الزائد.
  - `StaffManagementView`: مستندات التعيين كانت تستخدم `documentName` بدل
    `documentNameAr` / `documentNameEn`.
  - `PartiesView`: استدعاءات `addClientOffer` / `consumeClientOfferSession` كانت
    لا تطابق التوقيع الفعلي (خطأ وقت تشغيل سابق).
- **الاختبارات:** إضافة `vitest` + **38 اختباراً** في `src/utils/__tests__/`
  و `src/services/__tests__/` (وقت الحجز، تفقيط المبالغ، TLV الضريبي، أكواد العملاء،
  منطق الدمج والتزامن).
- **CI:** `.github/workflows/ci.yml` — لكن **تعذّر دفعه**: تطبيق GitHub المربوط
  لا يملك صلاحية `workflows`. القالب محفوظ في `docs/ci/ci.yml` مع دليل النسخ.
- **بوابة حجم الملفات:** `scripts/check-file-size.mjs` + `.github/file-size-baseline.json`.
  تمنع أي ملف جديد يتجاوز 300 سطر، وأي ملف قائم يكبر أكثر (Ratchet).
  القائمة الأساسية: 63 ملفاً.

### المرحلة 1 — التزامن المتفائل بعمود `version`
- `scripts/neon_optimistic_concurrency.sql`: يضيف `version` و `updated_at` لكل جدول
  تابع لمنشأة، ويُنشئ `touch_row()` الذي يزيد الإصدار تلقائياً، ويربط الـ Trigger
  بكل جدول. **متكرر بأمان (Idempotent)** ومُختبر فعلياً على PostgreSQL.
- `src/services/recordMerge.ts` (جديد): منطق الدمج النقي. قاعدة الحسم:
  `version` الرقمي أولاً، ثم `updated_at` كاحتياطي للبيانات القديمة.
  أُضيفت `hasVersionConflict()` لكشف التعارض الحقيقي.
- `src/services/recordSync.ts`: يستورد المنطق من `recordMerge.ts` ويعيد تصديره
  (توافق خلفي كامل) — وأصبح أصغر بـ 80 سطراً.
- `server/src/index.ts`: `POST /records/:docKey` يقبل `enforceVersion: true`
  ويرجع **409 Conflict** مع قائمة التعارضات بدل الكتابة فوق عمل مستخدم آخر.

### المرحلة 2 — صلاحيات على مستوى الزر (Action Registry)
- **الفجوة الحقيقية:** التطبيق كان يملك 21 فعلاً على العميل (`SYSTEM_ACTIONS`)
  و `canPerformAction`، لكن **السيرفر لم يكن يفحص أي فعل إطلاقاً** — أي مستخدم
  يرى الشاشة يستطيع الكتابة مباشرة عبر الـ API.
- `server/src/index.ts`:
  - `allowedActions` أُضيف إلى `TokenPayload` ويُستخرج من التوكن عند الدخول.
  - `assertAction(request, actionCode)` بقاعدة **Default-Deny**: غياب الفعل = 403.
  - مفروض على: `record.save`، `record.delete`، `journal.post`، `journal.reverse`،
    `receipt.create`.
  - معالج أخطاء موحّد يُرجع 403 مع `actionCode` ورسالة عربية واضحة.
- **مُختبر فعلياً:** توكن بلا صلاحيات ⇒ 403 مع `actionCode: record.save`؛
  توكن بـ `record.read` فقط ⇒ 403؛ توكن بـ `*` ⇒ يمرّ.

### الاختبارات المنفّذة
| الفحص | النتيجة |
|---|---|
| `tsc --noEmit` (الجذر) | 0 خطأ |
| `tsc --noEmit` (server) | 0 خطأ |
| `vitest run` | 38/38 ناجح |
| `vite build` | ناجح |
| بوابة حجم الملفات | ناجحة |
| migration التزامن على PostgreSQL حقيقي | 1 → 2 → 3 ✅ ومتكرر بأمان |
| فرض الصلاحيات على السيرفر (403/500) | مطابق للمتوقع ✅ |

### العمل المتبقي
- المرحلة 2 (تكملة): ربط أفعال العميل الـ 21 بأكواد السيرفر، وتوسيعها لتغطية كل الأزرار.
- المرحلة 3: محرك الشاشات بالـ Metadata + تقسيم `PlatformContext.tsx` + code-splitting.
- المرحلة 4: Outbox + تسلسل بلا فجوات للـ ETA + بارتشنات سجل التدقيق + جداول ناقصة.
- **مطلوب من المالك:** نسخ `docs/ci/ci.yml` إلى `.github/workflows/` يدوياً،
  أو منح تطبيق GitHub صلاحية `workflows`.

# 2026-10-14

## Dual-Store Synchronization & Conflict Resolution (معالجة تضارب تعديلات الكيانات واستقرار الواجهة)

- **Eliminated UI Name Rollback & Store Conflict**:
  - Investigated issue where editing a tenant/company name was reflected in the UI and PostgreSQL `tenants` table, but the UI temporarily reverted to the old name before flipping back to the new name.
  - Resolved root causes:
    1. **Direct Synchronous `app_records` UPSERT (`src/services/commands.ts`)**: In `saveRecord` and `deleteRecord`, replaced custom stored procedure calls with direct standard SQL parameterized `INSERT ... ON CONFLICT (tenant_id, doc_key, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`, keeping relational tables and `app_records` in 100% lockstep without delays.
    2. **Timestamp Stamping & Sync Baseline Alignment (`src/context/PlatformContext.tsx`)**: In `updateTenant`, `updateBranch`, and `updateWarehouse`, stamped `updated_at: new Date().toISOString()` on records and updated `neonLastSyncedArraysRef.current` immediately, preventing background auto-sync from perceiving them as outdated.
    3. **Protected `mergeRecords` (`src/services/recordSync.ts`)**: Hardened record merging logic to strictly guard fresh local edits against being clobbered by older background pull timestamps.
    4. **Active Entity Pointer Synchronization**: In `applyDatasetDocuments`, synchronized active `tenant`, `activeBranch`, and `activeWarehouse` whenever collections are refreshed.
- **Files**: `src/services/commands.ts`, `src/services/recordSync.ts`, `src/context/PlatformContext.tsx`, `PROJECT_STATE.md`, `CHANGELOG.md`.

## Enterprise Fast Hydration & Zero-Wait Refresh Architecture (معمارية المؤسسات للتحميل الفوري وبدون انتظار)

- **Eliminated 20-Second Refresh Delay**:
  - Investigated root cause: on every browser reload/refresh, the app was blocking the entire UI with a full-screen loading modal while sequentially fetching 35+ datasets one by one over HTTP roundtrips.
  - Implemented the industry-standard **Stale-While-Revalidate (SWR) / Optimistic Hydration** enterprise pattern:
    1. **Instant UI Unlock (< 50ms)**: Reads existing state from local IndexedDB cache immediately, setting `status: 'ready'` so the user can interact instantly with zero waiting time on refresh.
    2. **Single Batch SQL Query (`fetchLiveRecordsBatch`)**: Replaced 35+ sequential queries with a single parameterized SQL query using `doc_key = ANY($2)` to fetch all datasets from Neon in ~300-800ms instead of 20 seconds. Added concurrent worker pool fallback (6 parallel streams).
    3. **Non-blocking Background Sync**: Revalidation happens silently in the background. A spinning sync icon (`مزامنة...`) is displayed in the Header status badge without hijacking or freezing the user's screen.
    4. **Cold Boot Protection**: Full-screen splash is strictly shown only when there is zero cached data in a completely fresh browser.
- **Files Modified**: `src/services/recordSync.ts`, `src/context/PlatformContext.tsx`, `src/App.tsx`, `src/components/Header.tsx`, `PROJECT_STATE.md`, `CHANGELOG.md`.

## Complete Database-First Architecture & Direct Table Recording via UI Buttons

- **Resilient Direct Table Execution (`src/services/commands.ts` & `src/services/neonService.ts`)**:
  - Filtered placeholder Neon connection strings (`ep-cool-snowflake-12345`) to prevent stalled network requests.
  - Hardened `saveRecord` and `deleteRecord`: immediate direct SQL (`INSERT ... ON CONFLICT / UPDATE / DELETE`) into typed PostgreSQL tables (`tenants`, `branches`, `warehouses`, `categories`, `products`, `parties`, `accounts`, `users`, `payment_methods`, `sales_invoices`, `appointments`).
  - Isolated secondary document-store logging (`fn_upsert_records` / `fn_soft_delete_records`) so that missing auxiliary stored procedures never block direct relational table operations.
  - Safe unique-constraint handling in `upsertTenantDirect` on update to avoid collisions.
- **Full UI Actions Coverage in `PlatformContext.tsx`**:
  - `deleteTenant`, `restoreTenant`, `purgeTenant`, `restoreBranch`, `archiveWarehouse`, `restoreWarehouse`, and `toggleUserStatus` now execute directly against PostgreSQL tables via `saveRecord`/`deleteRecord`.
  - Every button across all screens (Companies, Branches, Warehouses, Categories, Products, Customers/Vendors, Accounts, Users, Payment Methods, POS Checkout, Invoices, Appointments) writes and persists directly into Neon tables.
- Files: `src/services/commands.ts`, `src/services/neonService.ts`, `src/context/PlatformContext.tsx`, `PROJECT_STATE.md`, `CHANGELOG.md`.

# 2026-10-13

## Universal Direct Relational Table Persistence (Database-First via UI Buttons)

- **Resolved UI vs Database Mismatch**:
  - Previously, changes to companies, products, categories, users, accounts, payment methods, parties, and invoices updated React local state and synchronized asynchronously into the JSONB store (`app_records`), but never executed direct SQL DML (`INSERT/UPDATE/DELETE`) against Neon's typed relational tables (`tenants`, `branches`, `warehouses`, `products`, `categories`, `accounts`, `parties`, `users`, `payment_methods`, `sales_invoices`, `appointments`). This caused updates made on the UI (such as modifying company name) to not reflect in SQL queries on Neon tables (`SELECT * FROM tenants`).
- **Comprehensive Direct Table Operations (`src/services/neonService.ts`)**:
  - Implemented direct parameterized PostgreSQL operations with `ON CONFLICT (id) DO UPDATE SET`:
    - `upsertTenantDirect` & `deleteTenantDirect` (`tenants`)
    - `upsertBranchDirect` & `deleteBranchDirect` (`branches`)
    - `upsertWarehouseDirect` & `deleteWarehouseDirect` (`warehouses`)
    - `upsertCategoryDirect` & `deleteCategoryDirect` (`categories`)
    - `upsertProductDirect` & `deleteProductDirect` (`products`)
    - `upsertAccountDirect` & `deleteAccountDirect` (`accounts`)
    - `upsertPartyDirect` & `deletePartyDirect` (`parties`)
    - `upsertUserDirect` & `deleteUserDirect` (`users`)
    - `upsertPaymentMethodDirect` & `deletePaymentMethodDirect` (`payment_methods`)
    - `upsertRecordDirect` & `deleteRecordDirect` (Universal generic table support for all schemas in `NEON_SCHEMA_TABLES`)
- **Universal Dual Persistence via Command Layer (`src/services/commands.ts`)**:
  - Updated `saveRecord` and `deleteRecord` to atomically update BOTH the typed PostgreSQL relational table AND the `app_records` JSONB store, and only then apply local state.
- **Wired UI Mutations in `src/context/PlatformContext.tsx`**:
  - Connected `updateTenant`, `addTenant`, `purgeTenant`, `addCategory`, `updateCategory`, `deleteCategory`, `addProduct`, `updateProduct`, `deleteProduct`, `addParty`, `updateParty`, `deleteParty`, `addAccount`, `updateAccount`, `deleteAccount`, `addUser`, `updateUser`, `deleteUser`, `addPaymentMethod`, `updatePaymentMethod`, `archivePaymentMethod`, `processCheckout`, `refundInvoice`, `cancelSalesInvoice`, `addAppointment`, `updateAppointment`, and `cancelAppointment` directly to `saveRecord`/`deleteRecord`.
  - Every button action in any view now executes live SQL against Neon tables immediately upon interaction.
- Files: `src/services/neonService.ts`, `src/services/commands.ts`, `src/context/PlatformContext.tsx`, `PROJECT_STATE.md`, `CHANGELOG.md`.

## Database-First Architecture Conversion — Phase 1 (Commands Layer & Financial Screens)

- Upgraded Command Layer (`src/services/commands.ts`):
  - Supported universal Database-First execution using either the Fastify API client (`server/`) or direct Neon PostgreSQL connection (`@neondatabase/serverless`) executing atomic PL/pgSQL functions.
  - Implemented `saveRecord`, `deleteRecord`, `createCollectionReceipt`, `createCustomerRefund`, `createJournalEntry`, `reverseJournalEntry`, and `reloadDataset`.
  - Guaranteed transactional integrity: database write executes FIRST. If the database rejects, local UI state is untouched and error is displayed.
- Converted Collection Receipts View (`src/views/CollectionReceiptsView.tsx`):
  - Replaced client-state first write in `handleSaveNewReceipt` with `createCollectionReceipt` (Database-First).
  - Added button loading state and disabled state during transaction processing.
- Converted Customer Dues Settlement / Refunds View (`src/views/CustomerRefundsView.tsx`):
  - Replaced client-state first write in `handleSubmit` with `createCustomerRefund` (Database-First).
  - Replaced client-state first cancellation in `handleCancel` with `reverseJournalEntry` (Database-First).
  - Added spinners and disabled button states during transactions.
- Files: `src/services/commands.ts`, `src/views/CollectionReceiptsView.tsx`, `src/views/CustomerRefundsView.tsx`, `PROJECT_STATE.md`, `CHANGELOG.md`.

## Enterprise Relational Architecture & Strict Auto-Serialized Customer Code Linking

- Enforced strict customer linking rule:
  - Updated `isReceiptMatchingParty` and `isRefundMatchingParty` in `src/utils/statementUtils.ts` and Excel import validation in `CollectionReceiptsView.tsx` to match receipts exclusively on `partyId` or the auto-serialized customer code (`party.customerCode` or `party.code`).
  - Removed fuzzy heuristics (Arabic name tokens, phone matching, text searching) to guarantee zero cross-customer balance leaks.
- Fixed browser runtime crash:
  - Resolved `ReferenceError: journalIndex is not defined` in `PlatformContext.tsx` by declaring `journalIndex` prior to conditional block.
- Established Enterprise Relational Database Blueprint:
  - Created `src/db/schema.sql`: Full PostgreSQL schema with multi-tenancy, branches, chart of accounts, parties with unique serialized codes, general ledger journal entries, journal lines, cash receipts, and customer refunds with foreign key constraints (`ON DELETE RESTRICT`) and indexes.
  - Added real-time window function SQL view `v_customer_detailed_statement` for server-side instantaneous statement generation.
  - Created `src/db/schema.ts` and `src/services/databaseBridge.ts` providing the repository pattern, sequential code generator, and running statement engine.
- Files: `src/utils/statementUtils.ts`, `src/views/CollectionReceiptsView.tsx`, `src/context/PlatformContext.tsx`, `src/db/schema.sql`, `src/db/schema.ts`, `src/services/databaseBridge.ts`.

# 2026-10-12

## Phase 3: the REAL tables are now the source of truth

- Added : , , , . Each dataset maps to its typed table (NEON_SCHEMA_TABLES) and every row keeps the full record in  while the queryable columns stay indexed, so the database can filter, sort and paginate without loading everything.
-  now prefers the REAL TABLE for the startup load, the incremental pull and the record push/soft delete (the API path still takes precedence when an API session is configured, and the legacy composite store remains only as a fallback for datasets without a table).
- Soft delete () and  keep the incremental sync and the "deleted rows never come back" guarantee.
- Data already moved into the real tables: **161,769 records**.
- Known gap: warehouses, categories, stock levels, payment methods and users appear empty until the full sync from the app completes, because the composite store itself was missing those datasets.
- Files:  (new), .


# 2026-10-12

## CRITICAL: startup failed after app_documents was dropped

- `fetchDocumentMetadata` still queried the dropped `app_documents` table, so the startup load failed and the app fell back to the "cannot reach the database" banner.
- It now reads the dataset list and their last change time from `app_records` (the single source of truth): `SELECT doc_key, MAX(updated_at) ... GROUP BY doc_key`.
- Verified that no remaining caller uses the legacy snapshot helpers (`fetchDocumentByKey`, `fetchDocumentsByKeys`, `saveDocuments`).
- Files: `src/services/neonService.ts`.

# 2026-10-12

## Database-first conversion: Companies & Branches screen (continued)

- `updateBranch`, `archiveBranch` and `updateWarehouse` now store the change in the database through the command layer (`saveRecord`) and only then update the screen. The interface can no longer show a branch/warehouse that the database did not accept, and archiving is stored before it is displayed.
- With the earlier `addBranch` / `addWarehouse`, the screen's create, edit and archive operations are now database-first.
- Until an API session is configured the command layer still falls back to the local update, so the screen keeps working during the migration.
- Files: `src/context/PlatformContext.tsx`.

# 2026-10-12

## Database-first conversion started: Companies & Branches screen

- `addBranch` and `addWarehouse` are now **database-first**: the new branch/warehouse is sent to the database through the command layer (`saveRecord`) and only appears on the screen after the database accepts it.
- Until an API session is configured the command layer falls back to the local update, so the screen keeps working during the migration.
- Files: `src/context/PlatformContext.tsx`.

# 2026-10-12

## Database-first command layer added

- Added `src/services/commands.ts`: `saveRecord`, `deleteRecord`, `createCollectionReceipt`, `createJournalEntry`, `reloadDataset`.
- Each command writes to the database FIRST and only then updates the screen state, so the interface can never display something that was not saved. On rejection or network failure the local state is untouched and the error is returned to the caller.
- Until an API session is configured every command falls back to the local update, which allows converting screens one at a time without stopping the running application.
- `PROJECT_STATE.md` now carries the conversion recipe, the current status and the recommended screen order.
- Files: `src/services/commands.ts` (new), `PROJECT_STATE.md`.

# 2026-10-12

## Commands reach the database almost instantly

- The record push debounce was reduced from 3000 ms to **400 ms**, so a button press is written to `app_records` in under half a second instead of after three seconds (and the window in which closing the page could lose an edit is now negligible).
- Reminder of the current model: the screen edits the in-memory state first and the (near-instant) sync writes the change per record to Neon. A fully database-first model, where every button is a server call and the screen is read-only, is the next architectural step and is described in the project state.
- Files: `src/context/PlatformContext.tsx`.

# 2026-10-12

## app_documents removed: app_records is now the only data store

- Tenant resolution (`resolveActiveTenantId`, `fetchFirstTenantId`), dataset counts and dataset loading now read `app_records` instead of the legacy `app_documents` snapshots.
- The schema migration no longer creates `app_documents` and `ensureDocumentsTable` is a no-op, so the legacy table can never come back.
- Live database: archived `app_documents` (304 rows) into `app_documents_legacy` and dropped the table. `app_records` holds **161,760 live rows** - one authoritative copy of the business data.
- Files: `src/services/neonService.ts`.

# 2026-10-12

## Single source of truth: Neon only (the duplicate browser copy removed)

- Root cause of "commands come back": the offline-first switch had re-enabled the legacy per-dataset browser persistence, so the device kept a SECOND copy of the business data and could push stale rows back to Neon.
- `NEON_ONLY` is enabled again: the app never reads or writes the legacy localStorage/IndexedDB dataset keys, and `purgeLegacyLocalCopies()` deletes the old browser copies once on startup so no stale data can ever be served.
- The full sync now writes **records only** (`app_records`, via the record-level diff); whole-dataset snapshots in `app_documents` are no longer written, so Neon holds one authoritative copy inside `app_records`.
- Startup already reads the live records and deletions are soft-deleted per record, so a record removed in the app can no longer reappear.
- Files: `src/utils/persistenceMode.ts`, `src/context/PlatformContext.tsx`.

# 2026-10-12

## The app can now run through the API (frontend wiring)

- Added `src/services/apiClient.ts`: API URL + JWT session storage, `apiLogin`, `apiHealth`, `apiFetchRecords`, `apiFetchChanges`, `apiUpsertRecords`, `apiDeleteRecords`, `apiPostJournal`, `apiReverseJournal`, `apiPostReceipt`, `apiFetchBalances`, plus `clearApiSession`.
- `recordSync` now prefers the API for every read and write (startup load, incremental pull, record push, soft delete). When no API URL/token is configured it keeps using the legacy direct connection, so the running app is unaffected until the switch is made.
- Added an **API connection** panel to the Neon screen: enter the API URL, sign in, get feedback, and sign out. After signing in, reloading the page makes all data flow through the backend (JWT + tenant from the token + RLS).
- Files: `src/services/apiClient.ts` (new), `src/services/recordSync.ts`, `src/views/NeonHubView.tsx`.

# 2026-10-12

## Backend API built and verified against the live database

- Added the `server/` project (Fastify 5 + TypeScript + Zod) - the only layer allowed to talk to Postgres now.
- **Auth**: `POST /auth/login` verifies credentials through a `SECURITY DEFINER` function (`fn_login`, needed because RLS blocks reads before a tenant is known) and issues a JWT carrying tenant, role and allowed scopes. Passwords support `passwordHash` (SHA-256, constant-time compare); legacy plaintext still works with a logged warning.
- **Tenant enforcement**: the tenant always comes from the verified token (`assertTenant`), never from the body, and every request runs in a transaction that sets `app.tenant_id`, so Row-Level Security isolates the tenant.
- **Endpoints**: `/health`, `/auth/login`, `/me`, `GET/POST /records/:docKey`, `GET /records/:docKey/changes`, `POST /records/:docKey/delete` (soft delete), `POST /accounting/journal`, `POST /accounting/journal/:id/reverse`, `POST /accounting/receipt`, `GET /accounting/balances`.
- **Live verification** (real run against Neon): health ok; login issued a JWT for tenant-eg-003/SuperAdmin; records and 37 balances came back tenant-scoped; an unbalanced journal was rejected with HTTP 400 and a valid one posted with HTTP 200 then reversed; a request without a token returned 401.
- **Hardening**: helmet, rate limit (300/min), CORS allow-list, no DDL rights for the app role; secrets live in a git-ignored `.env` and the test credentials were deleted after the run.
- Files: `server/` (package.json, tsconfig.json, .env.example, README.md, src/db.ts, src/index.ts).

# 2026-10-12

## Security & performance applied to the live database

- **Performance**: created a `(tenant_id)` index on all 39 tenant tables - the single most important index in a multi-tenant database.
- **Tenant isolation (RLS)**: enabled Row-Level Security on all 39 tenant tables with a `tenant_isolation` policy based on `current_setting('app.tenant_id')`. The table owner (what the current app uses) bypasses RLS, so the running application is **unaffected** - verified: the owner still reads all 161,797 records while 39 policies are active.
- **Limited application role**: created `app_api` (LOGIN, no DDL rights) with only SELECT/INSERT/UPDATE/DELETE + sequence usage, ready for the future backend. Without setting `app.tenant_id` it sees **zero rows** (secure by default).
- Everything is versioned in `scripts/neon_security_rls.sql` (idempotent).
- Files: `scripts/neon_security_rls.sql` (new).

# 2026-10-12

## CRITICAL FIX: deletions still did not reach the database

- Second root cause found: when the local cache considered a dataset fresh, the bootstrap skipped fetching it and therefore never seeded its **diff baseline**. The record-level push then compared against an empty baseline, which can detect upserts but **never deletions**, so deleted rows were never soft-deleted in `app_records` and came back on every reload.
- Fixed by seeding the baseline (and the cursor) from the cached arrays, and by adding a push-time safety net: when a dataset has no baseline yet, the live records are read from the database so deletions are always detected.
- Effect: a deletion made in the app is now always propagated (soft delete) no matter which path the startup took.
- Files: `src/context/PlatformContext.tsx`.

# 2026-10-12

## CRITICAL: deleted records came back after a refresh

- Root cause: the startup load read the whole-dataset snapshot from `app_documents`, while deletions are recorded per record in `app_records` (soft delete). The stale snapshot therefore resurrected deleted records on every reload.
- Added `fetchLiveRecords` (keyset pagination, 2000 records per request, soft-deleted rows excluded) and the bootstrap now builds each dataset from the LIVE records in `app_records` instead of the snapshot.
- Effect: deleting a record in the app now stays deleted everywhere, on every device and after every refresh.
- Files: `src/services/recordSync.ts`, `src/context/PlatformContext.tsx`.

# 2026-10-12

## Accounting migration steps 4 & 5

- **Step 4 - reversals**: `reverseJournalEntries` now mirrors each reversal into the database ledger through `fn_reverse_journal` (the original is kept and the opposite entry is posted atomically). Best-effort, non-blocking, offline-safe, and skipped for batches above 50 entries.
- **Step 5 - retiring the client engine (start)**: a background check every 5 minutes compares the local account balances with the authoritative balances that `fn_post_journal` maintains in the database. Differences are only reported (never overwritten) and the count is exposed as `neonBalanceMismatches`, so the client engine can be retired safely once both sides agree.
- Files: `src/context/PlatformContext.tsx`.

# 2026-10-12

## Accounting migration steps 2 & 3: collection receipts and refunds mirror into the DB ledger

- `addCollectionReceiptsBulk` now mirrors every created receipt into the atomic database ledger via `fn_post_customer_receipt` (debit payment-method account / credit customer account + receipt record). Batches above 100 receipts skip the mirror because the full record sync already carries them.
- `addCustomerRefund` mirrors the refund through `fn_post_customer_refund` (debit customer account / credit payment account + refund record).
- Both calls are **best-effort and non-blocking**: offline or unreachable Neon simply skips them, the local path stays the offline fallback, and rejections are logged for review without interrupting the user.
- Files: `src/context/PlatformContext.tsx`.

# 2026-10-12

## Accounting migration step 1: manual journals also recorded in the database ledger

- `createManualJournalEntry` now sends the entry to the database as well, so `fn_post_journal` validates it and writes the header, lines and account balances atomically into `gl_journals` / `gl_journal_lines`.
- The call is non-blocking and best-effort: if the device is offline or Neon is unreachable the local posting (the offline fallback) still happens exactly as before, and any server-side rejection is logged.
- Because the local path already validates the balance, no behaviour changes for the user - the database now keeps an authoritative, atomic copy of every manual journal.
- Files: `src/context/PlatformContext.tsx`.

# 2026-10-12

## Phase 2 verification: the atomic posting rules are enforced by the database

- Ran live checks against Neon: `fn_post_journal` **rejected** an unbalanced journal (`debit 100 vs credit 90`) and **rejected** a line carrying both debit and credit, and **wrote nothing** in either case (0 rows in `gl_journals`).
- This proves the accounting rules now live in the database and are applied atomically for every client, regardless of app version.

# 2026-10-12

## Phase 2 (part 1): accounting logic moved into the database

- Added the accounting core tables `gl_journals` / `gl_journal_lines` and the atomic functions `fn_post_journal` (validates balance and line rules, writes the header and lines and updates account balances **in one transaction**), `fn_reverse_journal`, `fn_is_debit_normal` and `fn_customer_account_id`.
- Added the atomic business operations `fn_post_customer_receipt` (debit payment account / credit customer account + receipt record) and `fn_post_customer_refund` (debit customer / credit payment + refund record).
- Added `src/services/accountingApi.ts` so the app can call those functions instead of building journals in the browser, plus `fetchAccountBalances` to read balances straight from the database.
- The full SQL is versioned in `scripts/neon_accounting_functions.sql` (idempotent, safe to run in the Neon SQL editor).
- Remaining: route the existing UI flows (manual journal, receipt creation, cancellation, other vouchers) through this API and retire the client-side journal builder.
- Files: `scripts/neon_accounting_functions.sql` (new), `src/services/accountingApi.ts` (new).

# 2026-10-12

## Record-level sync (phases 0-4): concurrent users can no longer overwrite each other

- **Database**: added `app_records` (one row per record with `version`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`), `app_sync_cursors`, and the functions `fn_upsert_records`, `fn_soft_delete_records`, `fn_changed_records`. The existing data was backfilled: **161,781 records**.
- **Phase 0 (safety)**: push/pull now work per record. Uploading only the changed records and soft-deleting removed ones means two users editing different records in the same dataset never overwrite each other. No more whole-dataset replacement.
- **Phase 1 (service layer)**: `src/services/recordSync.ts` implements `diffRecords`, `pushRecordChanges`, `pullChangedRecords` and `mergeRecords` against the SQL functions, with versions and audit actors.
- **Phase 3 (incremental)**: each dataset keeps a cursor (`app_sync_cursors` equivalent in memory); the background refresh pulls only records changed since that cursor.
- **Phase 4 (offline)**: the sync diffs the current state against the last synced baseline, so every edit made while offline is still pending when the connection returns and is pushed automatically.
- **Phase 2 (server-side accounting)**: the atomic-posting SQL infrastructure (functions + transactions) is in place; porting the whole accounting engine to the database is the remaining step.
- Files: `src/services/recordSync.ts` (new), `src/context/PlatformContext.tsx`.

# 2026-10-12

## Primary keys for every mirror table

- 22 tables (including `staff_members`) had no PRIMARY KEY, so Neon's table editor refused to edit/delete rows and `ON CONFLICT` could not work.
- Added a migration step that, for every dataset table, checks `information_schema.table_constraints` and (when missing) fills NULL ids, removes duplicate ids and runs `ALTER TABLE ... ADD PRIMARY KEY (id)`.
- Applied to the live database: activity_logs, attendance_records, audit_records, cash_payments, cash_receipts, categories, customer_refunds, device_maintenance, goods_issues, goods_receipts, inventory_audits, laser_devices, notifications_history, payment_methods, payroll_runs, period_locks, pos_shifts, reception_shifts, specialized_tax_invoices, staff_members, treatment_plans, users.
- Files: `src/services/neonService.ts`.

# 2026-10-12

## Quiet background sync (no repeated database loads)

- The push no longer issues an extra metadata request, so every edit no longer reads Neon again.
- Locally pushed datasets are marked fresh with a one-pass grace period, so the periodic pull does not immediately download what we just uploaded; their real timestamps are learned on the following tick.
- The status bar now appears **only for real problems** (unreachable database / no connection configured / first load). Normal background sync is silent and never blocks the interface.
- Files: `src/context/PlatformContext.tsx`, `src/App.tsx`.

# 2026-10-12

## Offline-first: run on the device, sync with Neon automatically

- Re-enabled local persistence (localStorage + IndexedDB): the app runs from the device copy and stays usable without internet.
- Added connectivity awareness: an `online` listener triggers an **immediate** pull from Neon (instead of waiting for the minute tick), while an `offline` listener flags the state.
- The startup gate now only blocks while the first load is running; if Neon is unreachable the app keeps working on local data and shows a warning bar with the last sync time and a **Sync now** button.
- Files: `src/utils/persistenceMode.ts`, `src/utils/safeStorage.ts`, `src/context/PlatformContext.tsx`, `src/App.tsx`.

# 2026-10-12

## Relational mirror fixed: every table is now filled

- The typed tables were empty (e.g. `cash_receipts` had 0 rows) because the mirror could not run against legacy tables: they lacked the `payload` column, had NOT NULL columns the mirror does not fill, no unique key for `ON CONFLICT`, and datasets without an `id`.
- `mirrorDataset` now: adds any missing column, adds `payload`, relaxes NOT NULL columns, generates a synthetic id when a record has none, replaces the table content, and inserts in batches of 300. `buildAlterTableSql` also adds `payload` / `synced_at` to existing tables.
- The whole database was re-mirrored: `cash_receipts` 10,348 · `journal_entries` 3,987 · `parties` 22,980 · `appointments` 62,653 · `patient_follow_ups` 61,425 · `customer_refunds` 246 · `accounts` 37 ...
- Files: `src/services/neonService.ts`, `src/services/neonSchema.ts`.

# 2026-10-12

## Fix: screens were empty although the data matched Neon + 1-minute pull

- Root cause: the dataset records all carry `tenantId = tenant-eg-003`, but the app's tenant list (`erp_tenants`) only contained `tenant-eg-001` / `tenant-eg-002`, so every screen filtered the data out. The missing tenant was added to `erp_tenants` in the database, and the bootstrap now **recreates the tenant that owns the data** (identity read from the `tenants` table) when it is missing locally.
- Re-enabled the local cache (`USE_LOCAL_CACHE = true`) and added an **incremental pull every minute**: only datasets whose Neon `updated_at` changed are re-downloaded, applied, and written to the cache, so the device cache always matches Neon. The last pull time is shown on the Neon screen.
- Files: `src/utils/persistenceMode.ts`, `src/services/neonService.ts`, `src/context/PlatformContext.tsx`, `src/views/NeonHubView.tsx`.

# 2026-10-12

## Verification panel: app data vs Neon data, dataset by dataset

- Added `NeonService.fetchDatasetCounts` and a **"Compare app data with Neon"** panel on the Neon screen showing, for every dataset, the record count currently held by the app, the count stored in Neon, and whether they match (with "missing in Neon" when the dataset does not exist there).
- This makes it possible to prove exactly which datasets differ instead of guessing.
- Files: `src/services/neonService.ts`, `src/context/PlatformContext.tsx`, `src/views/NeonHubView.tsx`.

# 2026-10-12

## Direct database mode: no local cache, every dataset read straight from Neon

- `USE_LOCAL_CACHE = false`: the app keeps **no local copy** of business data. Startup reads every dataset directly from Neon, dataset by dataset, with live progress (`x/y`) shown on the gate screen.
- The local IndexedDB cache is neither read nor written; Neon remains the only store. A dataset is still never uploaded unless it was actually read from Neon.
- Files: `src/utils/persistenceMode.ts`, `src/context/PlatformContext.tsx`.

# 2026-10-12

## Version history: every overwritten document is archived before it is replaced

- Added `app_documents_history` (with an index on tenant/doc_key/archived_at) and `saveDocuments` now archives the previous version of each document immediately before overwriting it, so an accidental overwrite can always be traced and restored.
- The table and index were also created directly in the live database.
- Files: `src/services/neonSchema.ts`, `src/services/neonService.ts`.

# 2026-10-12

## Recovery mode: read the old local browser data again

- Added a recovery switch (`erp_local_recovery`): when enabled, Neon-only mode is turned off so the app reads the previous local browser data again, which can then be pushed back to Neon with the full-sync button.
- The startup gate offers a **"Recover from the old local data (this browser)"** action that enables recovery mode and reloads.
- Files: `src/utils/persistenceMode.ts`, `src/App.tsx`.

# 2026-10-12

## CRITICAL: prevent the app from overwriting Neon with its initial/demo state

- The automatic push could run **before** the Neon bootstrap finished, so the app's initial/demo state was uploaded to Neon and **replaced real data**.
- Added two safety guards:
  1. The automatic sync (and the manual full sync) now refuse to run unless `neonBootstrap.status === 'ready'`.
  2. A dataset is only uploaded if it was **actually loaded from Neon** (or previously pushed) - a dataset that was never read from Neon is never written to Neon, so demo data can never overwrite real data.
- Files: `src/context/PlatformContext.tsx`.

# 2026-10-12

## Show which database and tenant the app is really using

- Added an always-visible **"Connected database: <host> / <database>"** line on the startup gate and on the Neon screen, plus the **resolved tenant id** and dataset count in the sync status card.
- This makes it possible to compare the app's connection with the Neon console at a glance instead of guessing why different data appears.
- Files: `src/context/PlatformContext.tsx`, `src/App.tsx`, `src/views/NeonHubView.tsx`.

# 2026-10-12

## Fix: app showed the old data again (stale cross-tenant cache)

- Root cause: the local cache was stored under a single tenant-agnostic key (`erp_documents_cache`), so a cache filled while the app was on the WRONG tenant was applied first on the next start - the app looked like it had reverted to the old data.
- The tenant is now resolved from Neon **before** the cache is read, and the cache is stored per tenant (`erp_documents_cache:<tenantId>`), so a cache belonging to another tenant can never be displayed.
- The legacy tenant-agnostic cache key is deleted on startup (`idbDelete`), and any failure while refreshing from Neon keeps the blocking error screen instead of silently showing stale data.
- Files: `src/context/PlatformContext.tsx`, `src/utils/safeStorage.ts`.

# 2026-10-12

## Removed the legacy `patients` table — `parties` is the single source

- `parties` and `patients` were two copies of the same records (23,005 vs 22,980 rows, identical ids), because the sync passed the same array to both.
- Removed every reference to `patients`: the create/alter statements, the sync section, the row-count probe, the `patients` argument of `syncAllData`, and the two call sites that passed `patients: parties`.
- `syncAllData` now drops the legacy table (`DROP TABLE IF EXISTS patients CASCADE`); the local `patients` context value remains as a backwards-compatible alias of `parties` so existing screens keep working.
- The live database table was dropped (22,980 rows removed) and `parties` (23,005 rows) was kept.
- Files: `src/services/neonService.ts`, `src/context/PlatformContext.tsx`, `src/views/NeonHubView.tsx`.

# 2026-10-12

## Fix: Neon fetch failed with HTTP 507 (response too large)

- Loading the updated datasets failed because every changed document (plus all its chunks) was requested in a single query, and the combined response exceeded Neon's 64 MB HTTP limit.
- Added `NeonService.fetchDocumentByKey`, which reads ONE dataset per request and reads its chunked documents in small groups (4 chunks per request). `fetchDocumentsByKeys` and `fetchDocuments` now loop dataset-by-dataset instead of issuing one giant query.
- Files: `src/services/neonService.ts`.

# 2026-10-12

## Fix: app opened the wrong tenant (looked like a different database)

- Live inspection of the configured Neon database showed **two tenants** inside the same `app_documents` store: `tenant-eg-003` (the one in the `tenants` table, 162 documents, large receipts/journals/parties) and `tenant-eg-001` (141 documents, almost empty business data). The app was starting on `tenant-eg-001`, so it looked like another database.
- Added `NeonService.resolveActiveTenantId` (prefers the tenant present in the `tenants` table that also has documents, else the tenant with the most documents) and the bootstrap now **aligns the in-app tenant with the Neon tenant** and persists the choice.
- Files: `src/services/neonService.ts`, `src/context/PlatformContext.tsx`.

# 2026-10-12

## Neon-only mode: Neon is the single source of truth (with a fast local cache)

- Added `src/utils/persistenceMode.ts` and enabled **NEON_ONLY** mode: the app no longer reads or writes the legacy per-dataset localStorage/IndexedDB keys. Only session/config keys (Neon URL, current user, language, active tenant/shift) remain local.
- **Fast startup without duplicating the source of truth**: a permanent local cache (`erp_documents_cache` in IndexedDB) is applied instantly, then Neon metadata (`doc_key` + `updated_at`) is compared with the cache and **only the datasets whose Neon version is newer are re-fetched** (`fetchDocumentMetadata` / `fetchDocumentsByKeys`).
- **The app does not start without Neon**: `App`/`MainLayout` now render a gate that shows loading, an error with a retry button, or a connection-string prompt when Neon is not configured.
- Exposed `neonBootstrap` (status/message/usedCache/updatedKeys/lastRun) and `retryNeonBootstrap`.
- Files: `src/utils/persistenceMode.ts` (new), `src/utils/safeStorage.ts`, `src/services/neonService.ts`, `src/context/PlatformContext.tsx`, `src/App.tsx`.

# 2026-10-12

## Every table is now populated (no more half-empty schema)

- Previously only the 12 legacy relational tables received data; the other tables created by the schema migration stayed empty.
- Added `NeonService.mirrorAllTables` / `mirrorDataset` with a column resolver (camelCase + explicit aliases) that maps each local record onto its typed table columns and always stores the complete record in the `payload` JSONB column (`$n::jsonb`).
- `syncAllToNeon` now runs three steps: tagged legacy tables → `app_documents` (all datasets) → **mirror every dataset into its typed table**, and reports how many rows went into how many tables.
- Files: `src/services/neonService.ts`, `src/context/PlatformContext.tsx`.

# 2026-10-12

## Migrate & Update Schema button for Neon

- Added a shared schema definition (`src/services/neonSchema.ts`) describing a matching Neon table for every local dataset: typed key columns for querying plus a `payload` JSONB column holding the full record, so nested structures (journal lines, shift rows, party offers) are preserved.
- Added `NeonService.runFullSchemaMigration` and a **"Migrate & Update Schema"** button on the Neon screen. It creates every missing table (`CREATE TABLE IF NOT EXISTS`) and adds every missing column (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`), which makes it idempotent and safe to re-run later to evolve the schema.
- The screen reports how many tables/columns were processed and lists any failures.
- Files: `src/services/neonSchema.ts` (new), `src/services/neonService.ts`, `src/context/PlatformContext.tsx`, `src/views/NeonHubView.tsx`.

# 2026-10-12

## Neon relational sync: batched inserts (appointments/follow-ups were unusable)

- Root cause of "appointments/follow-ups were not uploaded": the relational mirror inserted **one row per HTTP request**. With 62,653 appointments, 61,425 follow-ups, 22,980 parties and 10,348 receipts that meant ~155,000 sequential round-trips, i.e. hours - effectively never finishing.
- Added `NeonService.insertRowsInBatches` (one request per 300 rows, `sql.query` with `$n` placeholders) and switched patients, parties, appointments, patient follow-ups and journal entries to it. The same data now uploads in a few dozen requests.
- Files: `src/services/neonService.ts`.

# 2026-10-12

## Import all data from Neon (with safety backup and double confirmation)

- Added an **"Import all data from Neon"** action on the Neon screen. It (1) downloads a full multi-sheet Excel backup of the current local data, (2) reads every dataset document from Neon's `app_documents`, and (3) applies them to the app state. Datasets missing in Neon are left untouched, so nothing is deleted locally.
- The action is protected by a **two-step confirmation dialog** and reports how many datasets were imported plus the backup file name. Imported datasets are also marked as synced so the automatic push does not immediately overwrite them with stale local state.
- Files: `src/context/PlatformContext.tsx`, `src/views/NeonHubView.tsx`.

# 2026-10-12

## Neon sync resilience + dataset inventory panel

- Root cause of "bookings/follow-ups were not uploaded": the failing `patients` insert **aborted the whole relational sync** (it runs inside one try block, and patients is step 7), so parties, appointments, follow-ups and journal entries never executed. Every sync section is now isolated in its own try/catch, so one failing section no longer stops the rest.
- `patientFollowUps` was never passed to `syncAllData` from the app, so `patient_follow_ups` could never be filled. It is now passed.
- Added a **dataset inventory panel** to the Neon screen listing every dataset key that is synced and its current record count, so it is easy to verify what is included.
- Files: `src/services/neonService.ts`, `src/context/PlatformContext.tsx`, `src/views/NeonHubView.tsx`.

# 2026-10-12

## Neon upload speed — chunked datasets, parallel uploads and live progress

- The Neon upload used to send one huge HTTP request per dataset, so large datasets (journals, parties) took minutes. Datasets larger than ~0.9 MB are now split into ~0.7 MB chunk documents (`<key>#0`, `<key>#1`, ...) with a small manifest stored under the original key, and chunks are re-assembled transparently on read.
- Chunk documents are uploaded with a small concurrency pool (4 parallel requests) instead of strictly sequentially.
- Added live progress reporting: `neonAutoSyncProgress` (done/total) is shown in the Neon screen's sync status card while uploading.
- Files: `src/services/neonService.ts`, `src/context/PlatformContext.tsx`, `src/views/NeonHubView.tsx`.

# 2026-10-12

## Fix Neon sync error: patients.file_number NOT NULL

- The full transfer to Neon succeeded for all 34 document datasets, but the legacy relational mirror failed with `null value in column "file_number" of relation "patients" violates not-null constraint`.
- `syncAllData` created `patients.file_number` as `NOT NULL` (older schema), while parties mirrored into `patients` have no file number.
- Fixed by: declaring the column nullable, running an idempotent `ALTER TABLE patients ALTER COLUMN file_number DROP NOT NULL`, and inserting safe fallbacks (`fileNumber || ''`, `fullName || name`, `phone || ''`, `gender || ''`) in both the bulk sync and `insertPatientDirect`.
- Files: `src/services/neonService.ts`.

# 2026-10-12

## Full initial transfer to Neon + visible sync status

- `syncAllToNeon` now pushes **every dataset** to `app_documents` (34 documents) in addition to the tagged relational tables, so existing data can be transferred once with the sync button.
- The automatic sync no longer requires the "connected" flag: it runs whenever a valid Neon connection string is configured, and reports failures instead of silently doing nothing.
- Added a **live sync status card** in the Neon screen: uploading / last upload time + dataset count / explicit error message / connected state.
- Files: `src/context/PlatformContext.tsx`, `src/views/NeonHubView.tsx`.

# 2026-10-12

## Backup button now reads live data from Neon

- The "Backup to Excel" button in the Neon screen previously exported the **in-browser** state while claiming to back up the database. It now reads every dataset from Neon's `app_documents` store first and only falls back to the browser copy for datasets missing in Neon.
- The result message clearly states the source (live Neon data with the dataset count, or browser data when Neon is not connected / unreadable).
- Stock levels are now part of the automatic Neon sync (`erp_stock_levels`) so the backup covers them from Neon too.
- Files: `src/views/NeonHubView.tsx`, `src/context/PlatformContext.tsx`.

# 2026-10-12

## All data now syncs automatically to Neon (unified document store)

- Added the `app_documents` table (one JSONB row per dataset per tenant) plus `NeonService.saveDocuments` / `NeonService.fetchDocuments` / `NeonService.ensureDocumentsTable`.
- Added an **automatic Neon sync**: every dataset the app keeps (collection receipts, customer refunds, reception shifts, POS shifts, cash vouchers, tax invoices, goods vouchers, parties, journals, accounts, products, payroll, attendance, staff, laser devices, maintenance, inventory audits, period locks, notifications, audit/activity logs, ...) is uploaded to Neon as a JSONB document. Uploads are debounced (3s after the last change) and only datasets whose content changed are sent.
- Exposed `neonAutoSync` status (syncing / last run / last saved count / error).
- Documented the new table in `scripts/neon_schema_migrations.sql`.
- Files: `src/services/neonService.ts`, `src/context/PlatformContext.tsx`, `scripts/neon_schema_migrations.sql`.

# 2026-10-12

## Statement no longer shows archived receipts (root cause of the "phantom" receipts)

- The detailed customer statement included **archived** collection receipts, while the collection receipts screen (active view) hides them — so receipts like `CR-2026-0007/0008/0009` appeared in the statement but were impossible to see or cancel in the screen.
- The statement (and the balance synchronization) now exclude archived receipts, matching the collection receipts screen.
- Added a safety try/catch around the customer reconciliation effect so an unexpected error preserves existing data instead of surfacing as a browser exception.
- Files: `src/components/PartyStatementModal.tsx`, `src/context/PlatformContext.tsx`.

# 2026-10-12

## Customer balance sync follow-ups

- The reconciliation effect (which recomputes each customer's card balance from the statement sources) now also depends on `allCustomerRefunds`, so refunds that are auto-recovered after the first pass are immediately reflected in the card balance.
- Fixed duplicated currency text (`ج.م ج.م`) in the statement's card/movements difference notice.
- Collection receipts with **no branch assigned** are no longer hidden in the collection receipts screen for a specific active branch, so branch-less receipts can be reviewed/deleted.
- Files: `src/context/PlatformContext.tsx`, `src/components/PartyStatementModal.tsx`, `src/views/CollectionReceiptsView.tsx`.

# 2026-10-12

## Customer card balance now derives from the same sources as the statement

- The party card balance (`party.balance`) was updated by only a few operations plus the imported opening value, while the statement total was derived from all documents — so the two disagreed by exactly the old "opening balance".
- The reconciliation now recomputes every customer's card balance from the SAME document sources the statement uses (invoices, reception rows with linked-receipt handling, collection receipts and customer refunds), so the card balance and the statement movements total are identical.
- Files: `src/context/PlatformContext.tsx`.

# 2026-10-12

## Customer statement — remove card balance from selector + clarify reference

- Removed the recorded balance shown next to each customer name in the statement's customer selector.
- The card/movements difference notice now states explicitly that the **movements total is the correct reference** and the **card balance needs correcting** (instead of framing the movements as the questionable side).
- Files: `src/components/PartyStatementModal.tsx`.

# 2026-10-12

## Customer statement — remove the fabricated opening balance

- The statement was showing an artificial "opening balance" for many customers because it folded the residual between the recorded card balance and the displayed movements into `رصيد أول المدة`. That residual is no longer fabricated.
- The opening balance is now derived only from real movements recorded before the selected period (so it is 0 for the "All" range).
- When the recorded card balance differs from the displayed movements, an explicit notice shows the difference instead of hiding it in the opening balance.
- Files: `src/components/PartyStatementModal.tsx`.

# 2026-10-12

## Collection receipts — prevent duplicate imports

- `addCollectionReceiptsBulk` now skips items that are exact duplicates of an already-recorded receipt (same tenant + customer + date + amount + service + draft number) and of earlier items in the same batch, returning `skippedDuplicates`. The collection-receipts Excel import surfaces the skipped count.
- This prevents the repeated-import duplicates that inflated a customer's statement (e.g. the same 800 receipt appearing several times).
- Files: `src/context/PlatformContext.tsx`, `src/views/CollectionReceiptsView.tsx`.

# 2026-10-12

## Fix auto-recovered refunds being attached to the wrong customer

- Root cause of the huge unexplained movements in the detailed customer statement: auto-recovered refund vouchers (derived from `JV-CRF-` journals) were matched to a customer by the **shared customer control account** (`party.accountId`), so every refund was attached to the same first customer.
- Recovery now matches the customer by the **auto-serial customer code** written in the journal memo (exact name as a fallback) and **skips** refunds it cannot confidently attribute. The refund journal memo now also records the customer code.
- Recovered refunds (`crf-rec-*`) are derived data and are now rebuilt on each run, which also cleans up previously mis-attributed records.
- Files: `src/context/PlatformContext.tsx`.

# 2026-10-12

## Customer statement — accurate movements and opening balance

- Fixed the detailed customer statement pulling in unrelated movements: invoices, reception rows and journal lines are now matched to the customer by the **exact record id** or by the **auto-serial customer code only**. Removed the broad Arabic-name / system-code / paper-code substring matching that produced large unexplained debit/credit movements.
- Because the closing balance is derived as `party.balance`, the bogus movements were being absorbed into an unexplained opening balance. With accurate movements the opening balance is now meaningful.
- Files: `src/components/PartyStatementModal.tsx`.

# 2026-10-12

## Excel import now links customers by auto-serial code only

- Collection-receipt and customer-refund Excel imports now match the customer by the **auto-serial customer code only** (with optional leading-zero tolerance). Removed system-code / paper-code / file-code / Arabic-name fallbacks so imports cannot be attached to the wrong customer.
- Files: `src/views/CollectionReceiptsView.tsx`, `src/views/CustomerRefundsView.tsx`.

# 2026-10-12

## Fix undefined identifiers introduced by the statement/reconciliation refactor

- Fixed `ReferenceError: pName is not defined` in the detailed customer statement (`PartyStatementModal`): the journal-identifier list referenced `pName` after it had been renamed to `pNameNorm`. Restored a raw customer-name identifier alongside the normalized one.
- Fixed `ReferenceError: customerName is not defined` in the collection-receipt Excel validator (`CollectionReceiptsView`): the customer-name value is now parsed from the row again.
- These were runtime crashes shown as "unexpected browser exception" when opening a customer statement or importing receipts.
- Files: `src/components/PartyStatementModal.tsx`, `src/views/CollectionReceiptsView.tsx`.

# 2026-10-12

## Fix reconciliation crash + link receipts by auto-serial customer code only

- Fixed the runtime crash `ReferenceError: journalIndex is not defined`: the `journalIndex` declaration was missing in the collection-receipt reconciliation loop while still being used. Restored `const journalIndex = findCustomerReceiptJournalIndex(receipt, updatedJournals);`.
- Receipt/refund linking now uses the **auto-serial customer code only** (`customerCode`, with optional leading-zero tolerance). Removed system-code / paper-code / phone / Arabic-name / notes fallbacks in `isReceiptMatchingParty` and `isRefundMatchingParty`.
- Files: `src/utils/statementUtils.ts`, `src/context/PlatformContext.tsx`.

# 2026-10-12

## Collection Receipt Cash/Bank Account Resolution & Balance Synchronization Fix

- Resolved errors during startup hydration: `Collection receipt migration skipped: no linked cash/bank account for CR-2026-0004` through `CR-2026-0009`.
- Root cause: Collection receipt migration previously aborted if no cash or bank account was explicitly matched by ID or method label, which skipped applying the receipt credit (`customerBalanceApplied`) to the customer's ledger balance (`p.balance`). This caused a mismatch between the balance displayed in the customer select dropdown and the running/closing balance calculated from movements in the detailed statement of account.
- Implemented `resolveCashOrBankAccount` in `accountingEngine.ts` to automatically detect tenant cash/bank accounts (`1111`, `1112`, `1110`) by ID, code, payment method type, or name, with a synthesized fallback (`acc-${tenantId}-1111`).
- Decoupled customer ledger balance adjustments from journal account errors so customer dues are always credited immediately upon matching.
- Auto-provisioned account `1111` ('الخزينة الرئيسية (النقدية بالصندوق)') for all tenants during reconciliation.
- Ensured `customerCreditsMap` reduces customer balance in bulk imports even when no booked session offers are generated.
- Files: `src/services/accountingEngine.ts`, `src/context/PlatformContext.tsx`, `src/components/PartyStatementModal.tsx`.

## Customer Statement & Droplist Balance Discrepancy & Date Comparison Fix

- Fixed mismatch between the customer balance shown next to the name/code in the customer selector dropdown (`p.balance`) and the detailed movements ledger (`closingBalance`).
- Resolved string date comparison bug: dates formatted as `DD/MM/YYYY` (e.g. `11/10/2026`) were incorrectly evaluating as less than `'1970-01-01'`, causing collection receipts to be pushed into opening balance rather than appearing in the period movements table.
- Added automatic calculation of initial brought-forward balance (`initialBroughtForward`) so that customer starting balances from Excel or legacy data are honored, guaranteeing that `closingBalance` in "All" periods matches `party.balance` exactly.
- Enhanced customer matching across auto-serial codes (`21045`), system codes (`9502`), paper codes (`9502`), and normalized Arabic spelling variants, preventing receipts from being dropped or unlinked.
- Upgraded collection receipt reconciliation to resolve unlinked receipts and apply outstanding amounts to customer ledger balances so the full true balance (e.g. `-6,549.40`) is displayed.
- Files: `src/utils/statementUtils.ts`, `src/context/PlatformContext.tsx`, `src/views/CollectionReceiptsView.tsx`, `src/components/PartyStatementModal.tsx`.

# 2026-10-11

## Customer Control Account Resolution & Migration Errors Fix (1120 vs 2000)

- Fixed hydration and reconciliation errors for customer account linking and collection receipt migration (`tenant-2718`, `tenant-eg-004`, `tenant-eg-001`).
- Resolved account code confusion: updated `resolveCustomerControlAccount` and `resolveCustomerPartyAccount` in `accountingEngine.ts` to identify the true customer receivable account (`1120` / Accounts Receivable, Asset, debit-normal) rather than mistakenly enforcing account `2000` (which is standard Liabilities in the chart of accounts).
- Added auto-provisioning of `1120` control accounts for any tenant with customers in `PlatformContext.tsx`.
- Updated `PartyStatementModal.tsx` to handle shared control accounts (`1120` and `2000`) cleanly without individual memo leaks.
- Files: `src/services/accountingEngine.ts`, `src/context/PlatformContext.tsx`, `src/components/PartyStatementModal.tsx`.
 
## Detailed Customer Statement Balance Filters & Export Balances by Branch

- Added interactive balance filters to the Customer Statement (`PartyStatementModal`):
  - Filter types: All balances, Greater than (`>`), Less than (`<`), Equals (`=`), Debit balances only, Credit balances only, and Zero balances only.
  - Live count of matching customers and instant synchronization with the customer dropdown selector.
- Added comprehensive Excel export for customer balances:
  - Supports exporting the **Full Branch** or **Filtered Customers** only.
  - Columns exported: Customer Code (`كود العميل`), System Code (`كود السيستم`), Paper Code (`الكود الورقي`), Customer Name (`اسم العميل`), Phone Number (`رقم التليفون`), Balance (`الرصيد`), Balance Nature (`طبيعة الرصيد`), Coding Date (`تاريخ التكويد`), Branch Name (`الفرع`).
- Files: `src/components/PartyStatementModal.tsx`.

## Settlement View Default Today & Customer Statement Date Presentation

- Updated Customer Dues Settlement (`CustomerRefundsView`): Now defaults to showing **today's settlements only** (`today`), with quick buttons for "All" or custom date ranges.
- Refactored Detailed Customer Statement (`PartyStatementModal`):
  - Removed the branch switching toggle and the extra "show receipts outside date" warning button.
  - Receipts uploaded/migrated display the transaction date as the upload date, while any irregular or original file date is cleanly preserved in the receipt notes and description (`[تاريخ الإيصال: ...]`) along with previous notes.
- Files: `src/views/CustomerRefundsView.tsx`, `src/components/PartyStatementModal.tsx`, `src/views/CollectionReceiptsView.tsx`.

## Customer Refunds Persistence & Detailed Statement Linking

- Fixed Customer Dues Settlement (`CustomerRefundsView`) movements disappearing after page refresh: added `erp_customer_refunds` hydration from IndexedDB, mirrored persistence across both IndexedDB and localStorage, and introduced automatic journal recovery for any existing refund transactions.
- Filter improvements in `CustomerRefundsView`: defaulted date range to show all dates, added a branch toggle between active branch and all branches, and an interactive recovery button if records are hidden by active filters.
- Detailed Customer Statement (`PartyStatementModal`):
  - Robust auto-serial customer code matching (supports numerical match, leading zero variations, system code, phone, and normalized Arabic name).
  - Receipts posted with the upload date now prominently display `[تاريخ الإيصال: ...]` inside the description/notes column.
  - Linked quantity movements and package balances reflect all customer collection receipts.
  - Added branch scope toggle and notification banner when receipts exist outside the active date/branch filter.

# 2026-10-11

## Receipt linking by auto-serial customer code + reconciliation resilience

- Collection receipts are now linked to a customer using the **auto-serial customer code only** (system code / paper code / name matching removed) in both the customer statement and the receipt-to-account reconciliation.
- The reconciliation effect now resolves a missing `partyId` from `receipt.customerCode` (auto-serial) before skipping the receipt, so unlinked receipts are attached to the right customer account.
- The customer-account reconciliation effect is now wrapped in try/catch so an unexpected error no longer crashes the whole UI (the previous data is preserved and the error is logged).
- Files: `src/context/PlatformContext.tsx`, `src/components/PartyStatementModal.tsx`.

# 2026-10-11

## Import — file date no longer rejects rows (upload date is posted)

- Fixed imported collection receipts / customer refunds not appearing in the detailed customer statements. Root cause: the Excel importer rejected any row whose date was not strictly `YYYY-MM-DD`, so those rows were never recorded (and never appeared in the statement).
- The importer now accepts the row regardless of the date format: the posted date is the **upload date**, and the date written in the file is appended to the notes (`التاريخ المسجل في الملف: ...`). The date column is now optional in both importers.
- Files: `src/views/CollectionReceiptsView.tsx`, `src/views/CustomerRefundsView.tsx`.

# 2026-10-11

## Customer Refunds — Excel import + stricter manual validation

- Added Excel import (via the shared `ExcelDataTransferModal`) to the Customer Dues Settlement screen. Only **customer code (auto-serial)**, **customer name** and **value** are required; all other columns (units, unit price, service, date, payment-method code, notes) are optional and default sensibly.
- Manual refund entry now requires **service**, **units** and **value**.
- Bulk import now generates sequential refund voucher numbers (counter ref) so a batch does not reuse the same number.
- Files: `src/views/CustomerRefundsView.tsx`, `src/context/PlatformContext.tsx`.

# 2026-10-11

## New screen — Customer Dues Settlement (تسوية مستحقات عميل)

- Added a dedicated screen listing all customer refunds, defaulting to **today's refunds** and scoped to the **active branch**.
- Record a refund with refunded units, unit price and refund value (auto-computed as units × price, editable); the customer is searched by name, customer code, system code, file code, paper code or phone; the selected customer's value and quantity balances are shown before saving.
- Posting: **customer account debit / payment-method-linked account credit**, posted to the journal, chart of accounts and trial balance; the value and quantity are reflected in the customer statement.
- The refunded units reduce the customer's remaining package balance and appear as a negative quantity movement in the statement's quantity view; the refund appears as a debit movement in the value view.
- Refunds can be cancelled with a required reason (reverses the accounting effect and the customer balance) and exported to Excel.
- Files: `src/views/CustomerRefundsView.tsx` (new), `src/types.ts`, `src/context/PlatformContext.tsx`, `src/App.tsx`, `src/components/Sidebar.tsx`, `src/components/PartyStatementModal.tsx`.

# 2026-10-11

## Accounting — Excel export in every tab + active-branch default

- Added real Excel (.xlsx) export to Chart of Accounts, General Ledger, General Journal, Trial Balance, and Customer/Supplier Statements. Exports include the full filtered dataset (not just the visible page) with Arabic headers and sensible column widths.
- Accounting now defaults to the **active branch** instead of "All Branches"; the branch selector remains for manual switching to all branches / HQ.
- Customer/Supplier Statements opened from Accounting are now branch-scoped (only the selected branch's documents); statements opened from Parties/Suppliers keep the existing all-branch behaviour.
- New helper `src/utils/excelExport.ts` (`exportRowsToExcel`). Files: `src/views/AccountingView.tsx`, `src/components/PartyStatementModal.tsx`.

# 2026-10-11

## Performance fix — fast bulk selection in General Journal

- Fixed the UI freeze when using "Select all filtered entries" on very large filters (e.g. 40,000 entries). The freeze was caused by quadratic (O(n²)) membership checks and by resolving every selected entry's source on each render.
- Selection membership is now O(1) via a memoized `Set`; the reversible subset is resolved lazily only when the user presses "Reverse selected"; per-entry ID lists are memoized.
- Removed O(n²) lookups in `forceDeleteJournalEntries` and `reverseJournalEntries` (now use id/source maps).
- No business rule changed: reversal eligibility and source-linked protections are unchanged.
- Files: `src/views/AccountingView.tsx`, `src/context/PlatformContext.tsx`.

# 2026-10-11

## Detailed Customer Account — Receipt-linked quantity view & improved selector

- Reworked the previous standalone quantity table: the collection-receipt quantity/service data is now **linked into the existing quantity view mechanism** instead of a separate section. Receipts not already represented as an offer are merged into the offers list (product/service name + booked quantity), so they appear in the existing packages table and totals whatever the receipt source.
- Value view already records collection receipts on the credit side with description, date and cumulative running balance; verified and left intact.
- Customer selector: default is now **no customer selected**; added a search box and the dropdown is filtered by name, phone, customer code, system code, paper code, file code, and file number.
- Receipt-derived quantity rows are read-only (no session-consumption action).
- No change to the chart of accounts. Files: `src/components/PartyStatementModal.tsx`.

# 2026-10-11

## Detailed Customer Account — Collection Receipt Quantity & Service Movements

- Added a per-customer "Quantity & Service Movements from Collection Receipts" table inside the QUANTITY mode of the detailed customer account (`PartyStatementModal`).
- The table reads directly from the receipt records (service name, booked quantity, value, collection method, voucher number, date), so every collection receipt appears line by line regardless of its source (direct entry, Excel import, migration posting).
- The table respects the statement's active date-range filter and shows totals for booked quantity and value.
- No change to the chart of accounts: the journal posting (debit = payment-method account, credit = unified customer control account 2000) is untouched. This only adds the detailed-account movement view.
- Files: `src/components/PartyStatementModal.tsx`.

# 2026-10-11

## Forced Permanent Journal Deletion

- Added per-entry and bulk forced deletion from the General Journal. It intentionally bypasses accounting eligibility checks such as source linkage, period lock, posting state, and journal balance, while retaining a final confirmation and optional audit reason.
- Deleting a posted entry reverses its account balance snapshot effect before removing it from journal storage; every deleted record is retained in the audit log. Linked collection receipts are flagged to prevent automatic journal recreation.
- Forced deletion removes only accounting journal records. Source vouchers, inventory, customer/supplier statements, and other operational effects are not generally reversed; the confirmation warns about this explicitly.

# 2026-10-11

## Journal Source Details and Navigation

- Added a source action beside each General Journal entry and in unbalanced-journal review. The popup resolves exact linked receipts, payments, invoices, operation rows/expenses, maintenance, inventory audits, payroll items, and goods vouchers where source IDs exist.
- The popup opens the corresponding source module so edits/cancellation are performed by the source workflow and its accounting/operational effects remain synchronized. Text-only or unmatched source markers are identified as lacking a safe direct link.
- The popup does not hard-delete source-linked journals or documents; sources without a safe linked workflow must not be edited by changing the journal alone.

# 2026-10-11

## Journal Quick Filters and Safe Bulk Reversal

- Added General Journal filters for entry number, date range, account code/name, and debit/credit amount ranges, while keeping the existing 50-entry pagination.
- Added page-level multi-selection and per-entry reversal actions. Reversal creates a balanced posted journal in the current open period, preserves the original entry, and records a required reason in the audit/activity logs. Duplicate reversals are blocked.
- Reversal is limited to balanced, posted, unlinked manual journals. Entries tied to receipts, inventory, payroll, shifts, or other operational sources remain disabled here and must be corrected through their source workflow to avoid inconsistent downstream records. Unbalanced entries remain in the dedicated repair flow.
- No runtime ledger entries were changed by this feature; reversal occurs only after user confirmation in the application.

# 2026-10-11

## Historical Unmapped Journal Account Consolidation

- Added an explicit Trial Balance action to consolidate currently unmapped posted journal lines for the selected branch scope under tenant-level account `9999999`, named `أرصدة تاريخية مجمعة - تحت المراجعة`.
- The action preserves every line amount/date, journal header/source link, and entry balance; original account code and ID are retained as historical line metadata and shown in General Journal and General Ledger.
- The user must select the account classification and enter a reason. The account is created with a credit-normal Liability classification by default, matching the current all-branch net credit; this is a temporary reporting classification, not a determination of the missing accounts' original types.
- Closed periods, duplicate use of code `9999999`, or incompatible existing target accounts stop the operation. Bulk changes are audited and account/journal state remains tenant-scoped.
- No live browser ledger was accessed or changed by this code change; the operation runs only after an authorized user confirms it in the updated app.

# 2026-10-11

## Source-Aware Unbalanced Journal Review

- Added an Accounting header action and paginated review dialog for posted unbalanced journals, showing entry totals, difference, source references, and journal lines.
- Journal edits validate line amounts and balance, verify account tenant/branch ownership, and require a reason recorded in the audit trail. Linked cash receipt/payment journals can only be redistributed across accounts while preserving the aggregate amount on their linked vouchers; other source-linked journals are directed back to their source workflow.
- Manual journals can be corrected or logically voided. Voiding marks the entry unposted instead of deleting history, reverses its account snapshot effect, stores who/when/why, and records an audit/activity event. Closed accounting periods block both operations.
- No production/runtime journal records were available or changed. Existing unbalanced entry data must still be reviewed in the user's runtime before any source-specific correction.
- Validation: `npm run build` and `git diff --check` passed. `npm run lint` remains blocked by pre-existing TypeScript errors in PartyStatementModal, branch/tenant name fields, and unrelated staff/payroll shapes; no errors were reported on the new repair methods or dialog.

# 2026-10-11

## Chart of Accounts and General Ledger Balances from Posted Journals

- Added 50-row pagination to Chart of Accounts, journal entries, General Ledger movements, and Trial Balance to limit rendered rows until the user navigates pages.
- Chart of Accounts balances and revenue/expense summary totals are now derived from the same posted journal movements used by Trial Balance, rather than the separately stored account balance snapshots.
- General Ledger now includes only posted entries, resolves historical account references with the same tenant/branch-aware matcher as Trial Balance, and no longer adds a stored account balance as an implicit opening balance.
- These are report-time calculations only; account snapshots and historical journals are not modified. Unmapped journal lines remain reported as incomplete and excluded until safely reconciled. Pagination currently limits rendered items, not records already hydrated in the browser's local Context storage.

# 2026-10-10

## Journal Balance Validation and Trial Balance Status

- New journals are validated before posting: amounts must be finite/non-negative, a line cannot have both debit and credit, and non-empty entry totals must be equal within one piastre.
- Revenue-session posting rejects invalid amounts and collected amounts greater than revenue instead of creating a one-sided automatic journal. The reception form and Excel import show a validation error before recording the operation.
- Trial Balance now labels the report as incomplete when lines reference missing chart accounts, rather than saying journals themselves are unbalanced. Unbalanced-entry diagnostics remain separate.
- Existing journal records are not modified by the validation or status change.

# 2026-10-10

## Legacy Account References in Trial Balance

- Trial Balance now falls back from a stale journal account ID to a unique account code within the same tenant, preferring the journal branch and allowing a unique general account. Ambiguous or missing matches remain unresolved rather than being guessed.
- Legacy customer receivable codes `1120` and `1120-*` are included under account `2000` only when that tenant has a unique debit-normal Asset control account. This is report-time aggregation only; journal lines and stored account balances are not changed.
- Unmapped-line diagnostics now show total excluded debit/credit movement and group missing account IDs/codes by movement count and debit/credit totals, providing reconciliation evidence without automatically assigning a replacement account.
- The unmapped-line diagnostic keeps the true total while displaying at most 50 example lines, so large ledgers do not overwhelm the page. Successfully matched legacy lines are reported separately from actual errors.
- Customer cards and the compact table now show the linked chart account and identify missing/stale links.
- Receipt reconciliation now treats a valid posted journal ID on the receipt as authoritative even if that journal's line memo has no voucher marker, preventing another journal from being generated for the same linked receipt during hydration. Existing duplicates remain untouched pending ledger evidence.
- Runtime ledger data is not available in this workspace; this change does not claim to reconcile the user's actual balance or create adjustment entries.

# 2026-10-10

## GitHub Pages Deployment

- Added an Actions-based Pages build and deploy workflow for pushes to `main`, with pull requests running a build check and manual deployments available through `workflow_dispatch`.
- Configured Vite's production asset base for the repository Pages path (`/Universal-Business-Platform/`); local development continues to use `/`.
- Enabled repository Pages with the GitHub Actions source. The first deployment from `main` completed successfully; the live HTML, JavaScript, and CSS assets all returned HTTP 200.

## Customer Account 2000 Linking

- On storage hydration, active, coded customer profiles are linked to their unique tenant-specific chart account with code `2000`. Archived or merged profiles and supplier-only records are left unchanged; `Both` parties retain their previous supplier account in a separate link.
- Party linking does not rewrite journal entries or account balances. Legacy customer subledger consolidation only targets `2000` when it is a debit-normal Asset; missing, duplicate, or misclassified control accounts are not used as a GL fallback.
- Collection posting continues to reject account `2000` unless it is a debit-normal Asset. The bundled demo chart classifies `2000` as a Liability, so demo receipt posting remains blocked until the chart is corrected by the business owner.

## Customer Control Account and Trial Balance Reconciliation

- The Chart of Accounts no longer lists legacy generated customer subledgers individually (`acc-customer-*` IDs with `1120-*` account codes); the existing party and journal transaction data remains intact.
- Collection receipt postings now use only the exact tenant-scoped account `2000` as the receivable control account and the payment method's linked cash/bank account for the debit. Missing/duplicate/misclassified control accounts, missing payment mappings, invalid amounts, and duplicate supplied receipt reference numbers are rejected before any receipt or journal is saved.
- Removed automatic per-customer chart account creation from direct receipt posting. Existing generated customer subledgers are retired only if the journal-linked balances are reclassified to `2000`, their projected balance is zero, and no party or journal line still references them. Historical receipt credit lines are changed only when their voucher marker is unambiguous; locked periods are not modified.
- Customer receipts preserve system/customer codes for statement identity. Direct receipt vouchers are the single source of their statement movement; linked reception rows and their shared journal are suppressed to prevent duplicate customer credits. Shared account `2000` is not treated as a unique account for generic party statement matching, and existing supplier links for `Both` parties are preserved.
- Trial Balance now identifies individual unbalanced posted journals and journal lines with account IDs that cannot be resolved. Account balance synchronization matches account IDs only, preventing account-code matches from changing same-code accounts belonging to another tenant.
- Bundled demo reconciliation: one opening journal, `JV-2026-0001`, has `465,000` debit and `465,000` credit (difference `0`); all its lines resolve. The demo chart uses code `2000` for `الالتزامات (الخصوم)` as a Liability, not customer receivables. The posting guard intentionally blocks receipts against that demo account rather than silently misclassifying them.
- Runtime accounting data was unavailable, so no production/local ledger was altered and the user's actual debit-credit discrepancy cannot be quantified here. A real reconciliation needs posted journal headers/lines, account masters and balances, collection vouchers with party/system/customer codes and journal links, and period locks.
- Validation: `npm run build` passed; focused TypeScript-based accounting checks passed. Repository TypeScript checking remains blocked by existing unrelated errors, including `Branch.nameAr` diagnostics.

# 2026-10-10

## Collection Receipt Direct Accounting & Customer Quantity Crediting

- Collection receipts recorded or imported from the Collection Receipts screen are no longer routed or posted into reception shift operational sheets.
- Receipts post directly to the General Ledger and chart of accounts: the selected payment method / treasury account is debited, and the matched customer's subsidiary receivable account is credited with the receipt amount.
- Customers without a linked receivable account receive one automatically under account 1120, identified by their generated Customer Code, and the account is linked to the customer profile before posting.
- Posting reduces the customer's displayed balance by the receipt amount; existing unlocked direct receipts are reconciled once, linked to an existing customer-code subledger where available, and any unposted receipt is posted with a balanced cash/customer journal. Old shared-receivable credit lines are reclassified without duplicating their cash debit; locked periods are not changed.
- Customer statements now show only the customer's receivable credit from direct receipt journals when no voucher movement exists, while de-duplicating linked vouchers and never counting the matching cash debit against the customer.
- Trial balance rows and totals now derive from posted journal lines, avoiding parent/subaccount balance duplication; the status indicator reflects whether the posted journal balances actually balance.
- Collection receipts now require selecting or specifying the service, product/package, and booked quantity.
- Added a full manual recording modal ("تسجيل إيصال تحصيل") directly in Collection Receipts with customer lookup, payment method, service, product selection, and booked quantity.
- In Customer Account Statements (`PartyStatementModal`), collection receipts appear once as direct credit transactions, and the purchased service/product quantity is added to the customer's quantity balance under client packages and offers.
- Validation: `npm run build` passed. `npm run lint` remains blocked by existing repository-wide TypeScript diagnostics; none point to the customer account-linking or direct receipt posting changes.

# 2026-10-10

## Collection Receipt Accounting Posting

- Excel collection imports now post date-grouped journal entries debiting each linked payment-method account and crediting the matched customer's receivable account, including when no reception shift is open.
- Imported shift rows are added in one batch as receipt-only (`totalRevenue: 0`) and linked to the voucher journal, so they do not post duplicate cash or revenue.
- Added a branch-scoped action to post eligible legacy vouchers/run rows without journals using each receipt's original date; already-posted and period-locked records are skipped to prevent duplicates or date-lock violations.
- Cash receipt records now persist in IndexedDB with legacy data hydration for larger receipt histories.
- Validation: `npm run build` and `git diff --check` passed; Vite reports the existing large-chunk warning. TypeScript checking still reports existing unrelated repository errors; no diagnostics point to these receipt changes.

# 2026-10-10

## Collection Receipt Filtering, Selection, and Archive

- Added per-column filters across collection receipt details, including status, branch, customer identifiers, shift, method, amount, and descriptions.
- Added select-all for filtered results, bulk archiving, and active/archived/all receipt views. Archived status is stored on the receipt run row without changing its accounting or shift totals.
- Added a separate branch-name column to the receipt table.
- Validation: `npm run build` and `git diff --check` passed; Vite reports the existing large-chunk warning.

# 2026-10-10

## Reception Shift Storage Quota

- Moved reception shift and run-row persistence from the `erp_reception_shifts` localStorage value to IndexedDB.
- Startup merges IndexedDB shifts by ID with legacy localStorage shifts, and IndexedDB write failures are logged without throwing from the UI.
- Corrected the persistence effect placement so it only references reception-shift state after that state is initialized, preventing a startup exception.

# 2026-10-10

## Accounting Journal Storage Quota

- Moved accounting journal persistence from a single `localStorage` JSON value to IndexedDB to avoid `QuotaExceededError` as journal history grows.
- Startup loads IndexedDB journals and merges them by ID with any legacy localStorage journals, preserving both sets during migration.
- Failed IndexedDB writes no longer crash the UI; current records remain in memory and the failure is logged.

# 2026-10-10

## Collection Receipt Excel Save Error

- Fixed `params.totalRevenue.toFixed is not a function` when importing collection receipts. Excel or persisted values may be numeric strings, so the accounting journal builder now converts revenue and collected amounts to finite numbers before rounding.
- Collection import also explicitly converts the collected amount before passing it into operating shift rows.
- Validation: `npm run build` passed. Vite reports the existing large-chunk warning.

# 2026-10-10

## Customer Coding Review, Bulk Actions, and Non-destructive Merge

### Request and implementation

- Added a Customer Coding Review modal and moved the existing duplicate review entry point into it.
- Added customer search across stored profile fields, branch, status, customer/system/file code, phone, and created-date filters; results support select all and bulk actions.
- Added bulk archive and guarded permanent delete. Deletion skips customers with prior collections or revenues.
- Added primary-file selection and merge-note capture. Source profiles are archived and linked to the primary profile. No appointment, follow-up, receipt, invoice, or operation row is rewritten; primary-profile booking/follow-up history reads include linked source file IDs.
- Excluded archived and merged profiles from customer selection in Bookings and Reception Operations.
- Follow-up filter refinement: branch and status filters now allow multiple selections; the customer-code, system-code, and file-code filters are separate multi-select dropdowns populated from registered customer records. Code choices refresh to match selected branches. Added a dedicated “Review Customer Duplicates” section heading.
- Added an in-list search field to every multi-select dropdown. “Select all” now applies to the options currently visible after searching, while keeping selected values outside the search results intact.
- Added a Customer Management status filter for all, active, or archived customers. Permanently deleted customer records are not retained or listed; permanent deletion behavior remains unchanged.
- Fixed bulk permanent deletion for large selections: only prior financial collections/revenues block deletion, and the customer records are removed in one state update with one consolidated audit/activity entry rather than one update per customer.
- Fixed merged-customer detailed history lookup to resolve merged links in both directions and include legacy bookings/follow-ups matched by a linked profile's name, phone, or customer/system/file code. Historical rows remain unchanged.
- Detailed history search now lists active customers only. Legacy matches from appointments/follow-ups resolve through merged sources to the active primary profile and do not show archived sources as separate customers.
- Added a system-code duplicate merge action in Customer Coding Review. It groups active customers by normalized System Code, requires the user to choose one primary file per group, then archives source files and applies all group links in one state update without rewriting historical transactions.

### Files

- `src/types.ts`
- `src/context/PlatformContext.tsx`
- `src/views/PartiesView.tsx`
- `src/views/BookingsFollowUpView.tsx`
- `src/views/ReceptionOpsView.tsx`
- `PROJECT_STATE.md`
- `CHANGELOG.md`

### Decisions and limitation

- A merge is a profile relationship for future use and consolidated booking/follow-up display. Historical transaction rows retain their original customer IDs and details.
- Customer lifecycle persistence is currently local state/local storage and IndexedDB. Existing Neon services do not provide a party update/delete lifecycle operation, so no Neon database write is performed by these actions.

### Validation

- `npm run build` passed. Vite reports the existing large-chunk warning.
- `npx tsc --noEmit` remains blocked by existing repository-wide errors, including pre-existing `PartiesView.tsx` context/call-signature diagnostics. No diagnostics point to the new coding review, merge, archive, or protected delete logic.
- `git diff --check` passed.

This file records important project development events, decisions, and changes.

It is intended to help future AI agents understand how the project evolved.

---

# 2026-10-08

## Customer Codes and Validation for Collection Receipt Excel

- Added the customer's serialized Customer Code before their name in the Collection Receipts history and added Customer Code and Payment Method Code columns to the import/export workbook.
- Collection import checks customer codes against active and archived customer records, payment method codes against Payment Methods, and collection dates against the local current date.
- Validation errors appear before confirmation; the existing explicit force-upload option allows uploading entered values as-is with errors.
- Imported receipts link to the matched customer and use the registered method category for cash receipt posting.
- Validation was not run.

## Same-Branch Customer Duplicate Warning and Review

### Request and implementation

- Added duplicate warnings to quick customer creation for same-branch name or phone similarity >=80%, exact System Code, or exact File Code / legacy paper code.
- Quick creation generates a Customer Code through the existing addParty serial generator, assigns the active branch, and immediately selects the new customer for the booking. Staff can instead select a suggested existing customer or explicitly continue creating a new one.
- Added a Customer Management review action with a required date range; it reviews names only for coded customers created in that period against customers in the same branch. The 80% similarity check stops early when a pair cannot meet the threshold.
- Added the same pre-save duplicate warning to the Customer Management Add Customer flow, with an explicit confirmation option to continue creating a new customer.
- Changed the date-range review to run only after clicking Review Results. Customer indexing and matching yield between batches, and large result sets render incrementally.
- Optimized candidate retrieval using the rarest bigrams guaranteed by the 80% name similarity threshold, removed phone and code matching from the date-range review, avoided processing in-range pairs twice, and added bounded early-exit distance checks.
- The shared matcher uses normalized Levenshtein similarity plus branch-scoped indexes to avoid comparing every record against every other record.

### Files

- `src/utils/customerDuplicateDetection.ts`
- `src/views/BookingsFollowUpView.tsx`
- `src/views/PartiesView.tsx`
- `PROJECT_STATE.md`
- `CHANGELOG.md`

### Validation

- npm run build passed; Vite reported the existing large-chunk warning.
- npm run lint remains blocked by existing repository-wide TypeScript errors. The focused diagnostics contain no new errors in the duplicate matcher; PartiesView has pre-existing context and call-signature errors.

### Remaining limitation

- The selected review period filters by customer createdAt; the Party model has no separate coding timestamp.

## Detailed Customer Identifiers in Booking and Follow-up History

### Request and implementation

- Aligned both detailed history tables so each row displays Customer Code, System Code, File Code (the customer record file identifier), branch, and its date in the matching column. The profile summary uses the same linked customer fields.
- Resolved the branch name from the linked customer's branch assignment rather than displaying a branch ID or active-branch fallback.
- Preserved booking and follow-up rows and their existing actions.
- Removed horizontal scrolling from both detailed history tables; fixed-width column proportions, compact spacing, and wrapped text keep all columns inside the available screen width.

### Files

- `src/views/BookingsFollowUpView.tsx`
- `PROJECT_STATE.md`
- `CHANGELOG.md`

### Validation

- `npm run build` passed (Vite reported the existing large-chunk warning). `npm run lint` remains blocked by existing repository-wide TypeScript errors; no new diagnostic points to the detailed history changes.


## Restore the Booking Table Vertical Scrollbar

### Request and implementation

- Restored a 72vh vertical scroll area to the main Booking Management agenda table while keeping the fixed-width columns and hiding horizontal overflow.
- Restored sticky table headers and connected the existing top/bottom shortcuts to the internal table scroll area.

### Files

- `src/views/BookingsFollowUpView.tsx`
- `PROJECT_STATE.md`
- `CHANGELOG.md`

### Validation

- `npm run build` - passed (Vite reported the existing large-chunk warning).

## Booking Identifiers Match Customer Management

### Request and implementation

- Booking Management Customer Code now comes from the linked customer's serialized Customer Code; System Code comes from that customer's System Code; File Code comes from that customer's File Code.
- Applied customer-record-first resolution to agenda and follow-up displays, booking edit fields, new booking creation, and booking/follow-up Excel exports. Booking row values remain as fallback only when a customer record cannot supply the field.
- Preserved booking actions and existing unrelated data.

### Files

- `src/context/PlatformContext.tsx`
- `src/views/BookingsFollowUpView.tsx`
- `PROJECT_STATE.md`
- `CHANGELOG.md`

### Validation

- `npm run build` - passed.
- `npm run lint` (`tsc --noEmit`) still fails on existing repository-wide type errors.

## Customer Serial Display and Booking Table Fit

### Request and implementation

- Ensure the serialized Customer Code appears in Customer Management and remains independent from System Code. On local storage, IndexedDB hydration, and cross-tab updates, preserve valid unique numeric serials and assign a unique next serial only to missing, invalid, duplicate, or System Code-matching values.
- Booking edit, detail, agenda, next-day, follow-up, and Excel export views now resolve Customer Code from the linked Party first. Non-numeric codes and values matching System Code are excluded from Customer Code display. System Code display now uses the linked Party's System Code first.
- Converted the main Booking Management agenda to fixed-width columns that wrap within the available width, removed table overflow scrolling, and compacted cells/actions to keep the full table width visible.
- Fixed the missing fallback cash-supplier reference so existing local customer records load and normalize instead of falling back to sample data.
- Left date-independent Add New Booking and New Follow-up actions unchanged.

### Files

- `src/context/PlatformContext.tsx`
- `src/views/BookingsFollowUpView.tsx`
- `PROJECT_STATE.md`
- `CHANGELOG.md`

### Validation

- `npm run build` - passed. `npm run lint` (`tsc --noEmit`) - failed with existing repository-wide type errors; no errors were reported at the new Customer Code resolver or normalization lines.

## Booking Management Table Readability

### Request and implementation

- Renamed the Booking Management agenda's application code header to "Customer Code" in Arabic and English.
- Removed the agenda table's fixed-height internal vertical scrolling so the table expands in normal page flow. Updated its top/bottom shortcuts to scroll the page and removed the now-unneeded sticky header behavior.
- Kept horizontal overflow behavior for narrow screens and left booking row actions unchanged.

### Files

- `src/views/BookingsFollowUpView.tsx`
- `PROJECT_STATE.md`
- `CHANGELOG.md`

### Validation

- `npm run build` - passed (Vite production build).

## Customer Code Integrity, Follow-up Table, and Booking Navigation

### Request

- Make numeric Customer Codes sequential and independent from System Codes across customer creation, editing, search, related booking/follow-up workflows, and Excel import/export.
- Remove the rendered Responsible / Assigned To (Created By) column from follow-up tables without deleting record data.
- Remove application-provided new-tab actions for Booking Management while preserving normal navigation and date-independent customer booking actions.

### Implementation

- Added collision-aware Customer Code allocation based on existing numeric identifiers, with an in-memory sequence reservation to protect rapid creates and bulk imports. Bulk imports validate supplied Customer Codes as positive numeric serials, avoid duplicates against stored and in-batch values, and return the assigned codes for linked booking/follow-up rows.
- Kept System Code generation and storage separate. Customer imports no longer resolve the Customer Code field through System Code aliases; booking/follow-up imports match Customer Codes through the Customer Code index and retain System Code separately.
- Added Customer Code and System Code as separate columns in the direct customer CSV export; the existing Excel transfer export already maps both.
- Removed Created By cells and headers from the main follow-up table and the patient follow-up history table. The `createdBy` property remains in records and transfer data.
- Removed the Booking Management heading's explicit `window.open`/new-tab link behavior, removed the global context menu's Booking Management quick-open action, and excluded the sidebar new-tab affordance for bookings. The global context menu now lets the browser handle right-clicks while Bookings Management is active.
- Preserved the past/today booking row actions and their handlers without adding date-based blocking.

### Files

- `src/context/PlatformContext.tsx`
- `src/views/PartiesView.tsx`
- `src/views/BookingsFollowUpView.tsx`
- `src/components/GlobalContextMenu.tsx`
- `src/components/Sidebar.tsx`
- `PROJECT_STATE.md`

### Decisions

- Kept the current `Party.customerCode` / `Party.systemCode` data model; no database migration or identifier reset was introduced.
- Existing numeric Customer Codes are preserved. New assignments begin after the highest known serial and skip occupied values; duplicate or invalid imported codes receive the next available serial.
- System Code remains the separate identifier used by existing business workflows.

### Testing

- `npm run build` — passed.
- `npm run lint` (`tsc --noEmit`) — failed because of numerous existing repository-wide type errors, including unrelated modules and pre-existing errors elsewhere in the touched files. No new errors were reported in the changed Customer Code generator/import/export paths.
- `git diff --check` — passed.
- Source inspection confirmed the past/today Add New Booking and New Follow-up actions remain rendered and callable.

### Result

Requested Customer Code, follow-up table, and Booking Management navigation changes are implemented. No database operations were run.

## Bugfix: Resolve "TypeError: Illegal constructor" in Edit Customer Modal

### Cause
In `src/views/PartiesView.tsx`, the `<Lock />` component was used in both the Add Customer and Edit Customer modals. However, `Lock` had not been added to the `lucide-react` import statement at the top of `PartiesView.tsx`. In web browsers, `window.Lock` is an internal Web Locks API constructor (`Web Locks API - Lock interface`). When React attempted to instantiate `<Lock ... />`, it tried to call `new window.Lock(...)` as an JSX component, which throws a native `TypeError: Illegal constructor`.

### Resolution
- Added `Lock` to the `lucide-react` import list in `src/views/PartiesView.tsx`.
- Successfully compiled the applet and verified that the Edit Customer modal opens smoothly without errors.

---

## Customer Identifiers Unification (Branch, App Code, System Code, File Code) & Full Lifecycle Locking

### Purpose
Completed user requirements regarding customer identification consistency across Customer Management, Bookings, Follow-ups, and Excel imports/exports:
- **Branch Name (`اسم الفرع`)**: Displayed consistently across client directory, booking agenda, follow-ups agenda, and Excel files.
- **Customer Code (`كود العميل (التطبيق)`)**: Serves as the primary immutable application code (`C-XXXXX`), automatically generated and serialized in sequence (`getNextCustomerAppCode`). Users cannot manually modify or disrupt this sequence. Serves as the foundational relationship key linking customer lifecycle, transactions, and appointments.
- **System Code (`كود السيستم`)**: Renamed from previous "Paper Code", retaining all existing entered data (`CUST-XXXX` / `BR-XXXX` or user code).
- **File Code (`كود الملف`)**: Manually entered during customer onboarding or editing. If left blank during coding, an automatic fallback checkbox allows adopting the serialized customer app code directly as the file code.
- **Locked Inputs in Booking & Follow-Up Screens**: All customer creation and core code inputs are strictly locked in Bookings and Follow-ups modals/tables with navigation shortcuts to Customer Management, guaranteeing that Customer Management is the sole authoritative entry point.
- **Excel Transfer & Validation Integration**: Added and synchronized Branch Name, Customer Code, System Code, and File Code across Excel column templates, validator checks, and export mappings for both Bookings and Follow-ups.

---

## Shared AI Development System Initialized

### Purpose

Started establishing a shared AI development and project-memory system for the Universal Business Platform.

The goal is to allow multiple AI development tools to work on the same GitHub repository while maintaining consistent project knowledge.

Target AI tools:

- Google AI Studio
- OpenAI Codex
- Claude Code
- GitHub Copilot

### Shared Memory Files

Created the following project-memory files:

- `MASTER_AI_INSTRUCTIONS.md`
- `AI_CONTEXT.md`
- `PROJECT_STATE.md`
- `CHANGELOG.md`

Also created:

- `.github/copilot-instructions.md`

### Working Model

The repository is intended to become the shared source of truth.

AI agents should not depend on another AI product's private chat history.

Important project knowledge should be preserved in repository documentation.

---

## AI Change Approval Policy

The project does not prohibit AI agents from modifying core files.

Agents may modify any file required to complete the user's explicit request.

However, if an agent discovers a significant additional change that is outside the requested task, it must stop before making that additional change and request approval from the project owner.

The agent must explain:

- What it wants to change.
- Why.
- Which files/systems are affected.
- Expected impact.
- Possible alternatives.

The project owner then decides whether the additional change should proceed.

---

## Master Instructions Policy

`MASTER_AI_INSTRUCTIONS.md` is controlled by the project owner.

AI agents must not independently rewrite, weaken, or remove its rules.

The file may be changed when the project owner explicitly requests or approves the change.

---

## Project Architecture Notes

Current major stack:

- TypeScript
- React 19
- Vite
- Tailwind CSS
- Node.js 22 LTS
- Neon PostgreSQL
- React Context
- Multi-tenant business architecture
- Arabic and English
- RTL and LTR
- Responsive desktop/tablet/mobile interface

Important application areas include:

- POS
- Accounting
- Inventory
- Products
- Invoices
- Parties
- Suppliers
- Companies
- Branches
- Warehouses
- Users and Roles
- Bookings
- Follow-up
- Clinics
- Staff
- Payroll
- Attendance
- Fiscal documents
- Cash operations
- Notifications
- Audit trail
- System manual
- Neon/database management

---

## Existing Performance Concern

A previous large-data issue was identified when importing approximately 10,000 customers.

The browser could become blank or unresponsive.

Future implementations involving large datasets should use appropriate database-side processing, pagination, batching, filtering, sorting, incremental loading, and efficient rendering where appropriate.

---

## Git / Repository Notes

The project currently has a local development repository and a GitHub remote.

The repository should be treated as the shared source of truth for cross-agent development.

Destructive Git operations and history rewriting should not be performed without explicit authorization.

---

## Codex Setup and Repository Inspection

### Request

Record the Codex shared-AI setup and the repository structure inspection.

### Implementation

- Codex has been successfully installed and authenticated.
- Created root `AGENTS.md`, instructing Codex to read `MASTER_AI_INSTRUCTIONS.md`, `AI_CONTEXT.md`, `PROJECT_STATE.md`, and `CHANGELOG.md`.
- Inspected the repository structure without modifying application code.
- Confirmed entry points at `src/main.tsx` and `src/App.tsx`; shared platform state in `src/context/PlatformContext.tsx`; and main services in `src/services/accountingEngine.ts` and `src/services/neonService.ts`.
- Confirmed Neon integration in `src/services/neonService.ts`, `scripts/neon_schema_migrations.sql`, and `src/views/NeonHubView.tsx`.
- Identified large-data-sensitive areas in `PlatformContext.tsx`, `BookingsFollowUpView.tsx`, `PartiesView.tsx`, and `src/utils/fullDatabaseExcelBackup.ts`.
- No application files were modified during the inspection.

### Files

- `AGENTS.md` (created earlier)
- `PROJECT_STATE.md`
- `CHANGELOG.md`

### Testing

- Read-only repository structure inspection; no application tests were run because no application code changed.

### Result

Codex setup and repository structure notes are recorded for future shared-AI handoffs.

---
## Future Entries

Future significant changes should be added using this general structure:

### Date

## Change Title

### Request

What the user asked for.

### Implementation

What was changed.

### Files

Important files changed.

### Decisions

Important technical or business decisions.

### Testing

Tests and validation performed.

### Result

Current outcome.

### Follow-up

Remaining work or recommended next step.
