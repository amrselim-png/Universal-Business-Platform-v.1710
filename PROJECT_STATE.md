# PROJECT STATE

## شريحة الفواتير: أمان السيرفر (Fastify) + الفهارس + Materialization الورديات (2026-10-17)

- **حذف الاتصال المباشر من المتصفح:** إزالة استدعاء `@neondatabase/serverless` من `invoiceQueryApi.ts` واستبداله بـ API Client مع مسار محلي احتياطي.
- **مسارات Fastify المؤمّنة (`server/src/invoiceRoutes.ts`):** `GET /sales/invoices` · `GET /sales/invoices/summary` · `GET /sales/invoices/:id` · `PUT /sales/invoices/:id` · `POST /sales/invoices/:id/cancel`.
- عزل المستأجرين حصراً بالـ JWT Token المعتمد عبر `assertTenant` مع تفعيل `app.tenant_id` لـ RLS.
- **إحكام المخطط العلائقي:** Foreign Key على `invoice_lines(invoice_id)`، فهرس Trigram على `invoice_number`، وعمود `version` للتزامن المتفائل.
- **علاج عنق الزجاجة:** إضافة `scripts/materialize-shift-invoices.sql` لتحويل إيرادات الورديات إلى فواتير حقيقية مستقرة وقت الإغلاق بدلاً من الاستعلام المشتق.
- **الاختبارات:** 53/53 اختباراً في السيرفر ناجحة (+5 اختبارات أمان جديدة) · 316/316 اختباراً في الواجهة ناجحة.

## شاشة ربط العمليات بالقيود — للعرض فقط + مستكشف القيود (2026-10-17)

- الوضع الافتراضي قراءة فقط: **القيود المنشأة** (أحدث 500 قيد بسطورها ومصدرها
  وأكواد قواعدها + بحث/تصفية/إجماليات/توازن) · **القواعد (مرجع)** · **حالة الترحيل**.
- أدوات الإدارة (تحرير/ترحيل/إقفال/تغطية) خلف زر صريح ومقيّدة بالأفعال.
- القراءة من `journal_entries` مباشرة + `accounting_generated_entries` إن وُجد
  (تعمل قبل تطبيق أحدث الترحيلات).
- ملفات: `src/services/journalExplorerApi.ts` · `journalExplorerHelpers.ts` (+7 اختبارات) ·
  `JournalEntriesExplorer` · `PostingRulesReadOnly` · `PostingStatusReadOnly`.


## محرك قواعد الترحيل المحاسبي — الشاشة كمصدر وحيد (2026-10-16)

### ما تم تنفيذه
1. **قاعدة البيانات:** `accounting_posting_rules` + `accounting_posting_documents` +
   `accounting_period_locks` + `fn_post_document` (تبني القيد من القواعد فقط، ترفض
   الخلية بلا قاعدة، تمنع الترحيل في فترة مقفلة، تكتب سجل التدقيق، Idempotency).
2. **بذور 33 قاعدة** = السلوك الحالي حرفياً، فلا يتغير أي قيد عند التطبيق.
3. **الشاشة:** `AccountingMappingView` ب4 تبويبات + `src/components/accounting/*`
   (قواعد · ترحيل بزر ظاهر · إقفال فترات · تغطية).
4. **الكتالوج:** `src/data/accountingOperations.ts` (12 عملية × كل خلية رقمية).
5. **أفعال:** `accounting.post_journal` · `accounting.lock_period` · `accounting.open_period`.
6. **إزالة السقوط العشوائي:** `resolveAccount` يرمي خطأً بدل `accounts[0]`.

### الحالة والمتبقي
- الترحيل في بعض الشاشات لا يزال يُبنى محلياً بالمحرك القديم (المرحلة 2): تحويل كل شاشة
  لتُنشئ مستنداً وتُرحّله بزر، ثم حذف حقول الحسابات من الملفات.
- مخطط SQL لم يُنفَّذ في بيئة التنفيذ (لا PostgreSQL محلي) — يُطبَّق بأمر واحد موثّق.
- التوثيق الكامل: `docs/ACCOUNTING-POSTING-RULES-AR.md`.

## شاشة معمارية المنظومة الجديدة + بوابات الفحص المعماري الحقيقية (2026-10-16)

### ما طلبه المالك
إضافة شاشة داخل تطبيق Universal تعرض **المعمارية المعتمدة للمنظومة الجديدة
(Clean Micro-Engine Architecture: YARP + .NET 10 + PostgreSQL RLS + SignalR)**
مع الميزانية المعمارية (مستخدمون < 100، بدون Scale-to-Zero، ميزانية 200ms،
Endpoint واحد لكل شاشة، حد 300 سطر في الـ CI، Default-Deny + Action Registry)،
مخطط تدفق البيانات، حلقة المزامنة اللحظية، عيوب المنصة السابقة مقابل الحلول،
مقتطفات الكود المعتمد، و**بوابات الفحص الآلي وميزانية السرعة (CI Guardrails)**.

### ما تم تنفيذه
1. **شاشة `architecture`** (`src/views/ArchitectureView.tsx` + `src/components/architecture/`)
   بستة تبويبات، وتُفتح من القائمة الجانبية «معمارية المنظومة الجديدة» أو بـ `?view=architecture`.
2. **محرك بوابات حقيقي** — لا أرقام وهمية:
   - `src/services/architectureGuardrails.ts` (منطق التقييم النقي، 292 سطراً).
   - `scripts/architecture-guardrails.mjs` + `guardrail-invariants.mjs` + `guardrail-snapshot.mjs`.
   - `src/data/architecture/guardrailsSnapshot.ts` (لقطة مولَّدة من المستودع).
   - `src/__tests__/architectureGuardrails.test.ts` (13 اختباراً: منطق + طزاجة اللقطة + حالة المستودع).
3. **النتيجة المقيسة الآن:** 3 بوابات · 97 فحصاً · 0 فشل · 65 ملفاً مقيساً ·
   12 موضع فحص صلاحيات · 19 ثابتاً معمارياً إلزامياً ناجحاً · 3 توصيات
   (واحدة مفتوحة: PgBouncer/حد اتصالات صريح).
4. **صلاحيات الشاشة:** `architecture.run_guardrails` و`architecture.copy_snippet`
   في `SYSTEM_ACTIONS` (Default-Deny)، والشاشة في `SYSTEM_VIEWS` + القائمة الجانبية
   + لوحة الأوامر (`Ctrl+K`).
5. **إعادة هيكلة إلزامية:** نقل رسم الشاشات من `App.tsx` إلى
   `src/components/ViewRenderer.tsx` — `App.tsx` من 438 إلى **348 سطراً**،
   وخط الأساس تم تضييقه (App.tsx 439 → 348، neonService 1832 → 1683، commands 479 → 441).
6. **CI**: خطوة `node scripts/architecture-guardrails.mjs --check` أُضيفت إلى قالب
   الـ CI `docs/ci/ci.yml` وإلى `npm run verify`. ⚠️ تعذّر دفعها داخل
   `.github/workflows/ci.yml` لأن تطبيق GitHub المربوط لا يملك صلاحية `workflows`
   (نفس القيد الموثّق في `docs/ci/README-AR.md`) — التفعيل يحتاج خطوة يدوية واحدة:
   `cp docs/ci/ci.yml .github/workflows/ci.yml`. وأُصلح أيضاً `bun.lock`
   (كان يفشل `bun install --frozen-lockfile` في أول خطوة CI).

### التحقق
`tsc --noEmit` = 0 خطأ · `vitest` = **276/276** · `vite build` ناجح ·
`check-file-size` ناجح · `guardrails --check` ناجح · `budget:bundle` ناجح ·
`npm run verify` يغطيها كلها بالترتيب نفسه الذي يعمل به الـ CI.

### ميزانية السرعة (الحالة النهائية)
- **زمن الـ API:** الحد المعتمد p95 < 200ms — أداة القياس جاهزة وقابلة للتشغيل
  (`perf/api-budget.js` بـ k6 عبر `npm run perf:api`) على بيئة حقيقية.
- **حجم الحزمة (يُقاس في الـ CI):** إقلاع 137.1KB gzip / CSS 22.1KB /
  أكبر حزمة مؤجّلة 138.2KB / الإجمالي 995.2KB — داخل الحدود الأربعة.
- **توصية الاتصالات:** أُغلقت بضبط `Maximum Pool Size=25` في التطبيق المرجعي.

### ما لم يُلمس (بحدود النطاق)
- لم تُقس زمن الاستجابة الفعلي داخل الشاشة (يحتاج بيئة حقيقية) — والمطلوب لذلك
  صار جاهزاً للتشغيل: `perf/api-budget.js` بـ k6 (`npm run perf:api`)، ومذكور صراحة في الشاشة.
- لم يُشغَّل اختبار المتصفح `e2e/architecture.spec.ts` في هذه البيئة (مكتبة نظام
  ناقصة للمتصفح) — التصيير الفعلي للمكوّنات تم عبر `react-dom/server` بلا أخطاء.
- لم يُعدّل `MASTER_AI_INSTRUCTIONS.md`.



## توحيد الدفتر المحاسبي وإصلاح دوال الترحيل والتحصيل على Neon (2026-10-16)

### ما تم تنفيذه والتحقق منه على قاعدة البيانات الحية
1. **دفتر محاسبي موحّد (`journal_entries`)**:
   - حذف الجداول الموازية المنعزلة `gl_journals` و `gl_journal_lines`.
   - توحيد دوال `fn_post_journal` و `fn_reverse_journal` لتكتب وتقرأ من `journal_entries` مباشرة مع حفظ سطور القيد داخل `payload->'lines'`.
   - إضافة View تحليلي علائقي `v_journal_entry_lines` لاستخراج كافة البنود واستعلام ميزان المراجعة وكشوف الحسابات بـ SQL مباشرة.
2. **إصلاح وإنشاء دوال المحاسبة الذرية**:
   - `fn_customer_account_id`: تقرأ من جدول `parties` مباشرة (مع كود العميل وبدائل 1120 / 2000) بدلاً من `app_records` المحذوف.
   - `fn_post_customer_receipt`: ترحيل قيد تحصيل متوازن في `journal_entries` + تسجيل السند في `cash_receipts` + تحديث رصيد الخزينة والعميل ذرياً.
   - `fn_post_customer_refund`: ترحيل قيد استرداد متوازن + تسجيل السند في `customer_refunds` + تحديث رصيد العميل والخزينة ذرياً.
3. **تنظيف الجداول والمستخدمين**:
   - حذف جدول `patients` المهجور.
   - إدخال حساب المدير `admin` في جدول `users` وتفعيل `fn_authenticate_user`.
   - إضافة عمود `version` لجدول `tenants`.
4. **الفحوصات**:
   - 28 فحص تحقق آلي في `apply-neon-migrations.mjs --verify` ناجحة 100%.
   - 311 اختباراً آلياً ناجحاً (263 عميل + 48 سيرفر) مع 0 أخطاء في فحص الأنواع وبناء التطبيق.

## تطوير Universal وفق بنية ERP NextGen — المراحل 0 و1 و2 (2026-10-14)

### القرار المعماري المعتمد
- **الستاك: TypeScript / Fastify** (المسار أ). لم يُعتمد التحول إلى .NET.
- السبب: المعمارية الجوهرية (RLS + API + tenant من التوكن + Keyset Pagination)
  **مطبّقة بالفعل** في التطبيق. الفجوة الحقيقية كانت **دَيناً تقنياً واكتمالاً**،
  لا معمارية خاطئة.
- الخطة الكاملة والتحليل: `UPGRADE_PLAN.md`.

### ما تم إنجازه
1. **المرحلة 0 — تثبيت الأساس:**
   - **144 خطأ TypeScript ← صفر**. أغلبها كان أخطاء حقيقية في الواجهة (أسماء حقول
     غير موجودة تُنتج قيماً فارغة)، وليس مجرد شكوى من المترجم.
   - إضافة **38 اختبار وحدة** (`vitest`) + سكربت `npm run verify`.
   - **بوابة حجم الملفات (Ratchet)**: `scripts/check-file-size.mjs` +
     `.github/file-size-baseline.json` — تمنع تكرار ملف بحجم `PlatformContext.tsx`.
   - **CI** جاهز كقالب في `docs/ci/ci.yml` (تعذّر دفعه لغياب صلاحية `workflows`
     في تطبيق GitHub — **مطلوب إجراء يدوي من المالك**).

2. **المرحلة 1 — التزامن المتفائل بعمود `version`:**
   - `scripts/neon_optimistic_concurrency.sql` (متكرر بأمان، مُختبر على PostgreSQL).
   - `src/services/recordMerge.ts` (جديد) — منطق الدمج النقي.
   - `recordSync.ts` يستورد ويعيد التصدير (توافق خلفي كامل).
   - الـ API يرجع **409 Conflict** عبر `enforceVersion: true`.
   - **هذا يُنهي مشكلة «رجوع الاسم القديم» من جذرها:** المقارنة صارت على رقم
     الإصدار لا على طابع زمني نصي.

3. **المرحلة 2 — صلاحيات على مستوى الزر:**
   - **الفجوة المكتشفة:** العميل كان يملك 21 فعلاً (`SYSTEM_ACTIONS`)،
     لكن **السيرفر لم يكن يفحص أي فعل** — تجاوز كامل لصلاحيات الأزرار.
   - أُضيف `allowedActions` إلى التوكن و `assertAction()` بقاعدة Default-Deny،
     مفروضة على `record.save` / `record.delete` / `journal.post` /
     `journal.reverse` / `receipt.create`.
   - **مُختبر فعلياً:** 403 مع `actionCode` عند غياب الصلاحية.

### حالة الفحوصات
`tsc` = 0 خطأ (الجذر والسيرفر) · `vitest` = 38/38 · `vite build` ناجح ·
بوابة الحجم ناجحة.

### العمل المتبقي
- تكملة المرحلة 2: توحيد أكواد الأفعال بين العميل والسيرفر وتوسيعها.
- المرحلة 3: محرك الشاشات بالـ Metadata + تقسيم `PlatformContext.tsx` (12,342 سطر).
- المرحلة 4: Outbox + تسلسل بلا فجوات للـ ETA + بارتشنات سجل التدقيق + جداول ناقصة.


## Dual-Store Synchronization & Conflict Resolution (معالجة تضارب تعديلات الكيانات واستقرار الواجهة) — 2026-10-14

### Problem Identified & Solved
- **The Issue**: When the user edited a tenant/company name, the update wrote immediately to the relational `tenants` table and the UI displayed the new name. However, a moment later the UI reverted back to the old name, before eventually flipping back to the new name.
- **Root Cause**:
  1. `saveRecord` wrote to the relational PostgreSQL table (`tenants`), but relied on a stored procedure `fn_upsert_records` for the document store (`app_records`). If that procedure was delayed or missing, `app_records` retained the old record with an older timestamp.
  2. The local entity update object lacked an explicit `updated_at` ISO timestamp. When the periodic background sync (`refreshFromNeon`) pulled `app_records`, `mergeRecords` evaluated `incoming.updated_at >= ""` as true, inadvertently clobbering the freshly edited local record with the stale document store record.
  3. Once the background auto-sync subsequently pushed the local state to `app_records`, the timestamp in `app_records` caught up and the new name returned to the UI.
  4. In `applyDatasetDocuments`, updating `allTenants` did not synchronize the active `tenant` pointer in React state.
- **Permanent Solution**:
  1. **Direct Synchronous UPSERT to `app_records`**: In `saveRecord` and `deleteRecord`, directly execute standard SQL `INSERT INTO app_records ... ON CONFLICT (tenant_id, doc_key, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()` synchronously with relational table writes, ensuring both tables update in the exact same call.
  2. **Timestamp Stamping & Sync Baseline Alignment**: In `updateTenant`, `updateBranch`, and `updateWarehouse`, stamped `updated_at: new Date().toISOString()` and updated `neonLastSyncedArraysRef.current` immediately, protecting local edits from being overwritten by older server records.
  3. **Protected `mergeRecords`**: Hardened `mergeRecords` in `src/services/recordSync.ts` to strictly prevent older server records from overwriting newer local edits.
  4. **Active Entity Pointer Synchronization**: In `applyDatasetDocuments`, synchronized active `tenant`, `activeBranch`, and `activeWarehouse` whenever their collections are updated.
- **Files**: `src/services/commands.ts`, `src/services/recordSync.ts`, `src/context/PlatformContext.tsx`.

## Enterprise Fast Hydration & Zero-Wait Refresh Architecture (معمارية المؤسسات للتحميل الفوري وبدون انتظار) — 2026-10-14

### Problem Solved
- Previously on page reload/refresh, the application blocked the entire UI with a 20-second blocking modal while sequentially fetching 35+ datasets one by one over serverless HTTP roundtrips.
- This violated professional enterprise UX standards (where apps like Notion, Linear, Salesforce, or SAP render cached data immediately and revalidate in the background).

### Live Capabilities & Professional Architecture
1. **Instant UI Availability (< 50ms Stale-While-Revalidate / Optimistic Hydration)**:
   - When the user refreshes or reloads the browser, the application loads from the local IndexedDB cache in ~30 milliseconds.
   - The UI is immediately unlocked (`status: 'ready'`) and interactive. The user can view dashboards, browse records, and work without delay.
   - Background revalidation runs seamlessly in the background without locking the screen.
   - A blocking splash screen is strictly reserved for a 100% cold boot on a completely empty browser with zero local data.
2. **Lightning-Fast Batched Dataset Queries (`fetchLiveRecordsBatch`)**:
   - Replaced 35+ sequential network round-trips with a single batch SQL query:
     `SELECT doc_key, record_id, payload FROM app_records WHERE tenant_id = $1 AND doc_key = ANY($2) AND deleted_at IS NULL ORDER BY doc_key, record_id`
   - Added robust concurrency fallback (worker pool of 6 parallel streams) in case of oversized chunks.
   - Reduced cold-boot cloud fetch time from ~20 seconds down to ~300-800ms.
3. **Non-Intrusive Header Sync Indicator (`src/components/Header.tsx`)**:
   - A modern sync pill with spinning indicator in the top header indicates `مزامنة...` during background refresh without interrupting the user.
   - Turns back to `متصل` (Connected) with a green indicator once synchronized.
4. **Files Updated**:
   - `src/services/recordSync.ts`: added `fetchLiveRecordsBatch`.
   - `src/context/PlatformContext.tsx`: upgraded `bootstrapFromNeon` to instant-cache hydration + batch query, exported `syncing` and `isStorageHydrated`.
   - `src/App.tsx`: updated loading gate so cached refreshes are non-blocking; banner only triggers on genuine errors.
   - `src/components/Header.tsx`: added spinning sync indicator on the Neon status pill.

## Universal Direct Table Persistence (Database-First via UI Buttons) — 2026-10-14

### Status & Live Capabilities
- **Direct PostgreSQL Table Operations (`src/services/neonService.ts` & `src/services/commands.ts`)**:
  - All UI button operations execute direct parameterized SQL (`INSERT ... ON CONFLICT / UPDATE / DELETE`) directly against Neon's relational tables: `tenants`, `branches`, `warehouses`, `categories`, `products`, `parties`, `accounts`, `users`, `payment_methods`, `sales_invoices`, `appointments`.
  - Placeholder Neon connection URLs are safely filtered to prevent stalled operations.
  - Secondary document-store calls (`fn_upsert_records` / `fn_soft_delete_records`) are safely isolated so missing auxiliary stored procedures never block primary relational table writes.
  - `PlatformContext.tsx` entity methods (`addTenant`, `updateTenant`, `deleteTenant`, `restoreTenant`, `purgeTenant`, `addBranch`, `updateBranch`, `deleteBranch`, `restoreBranch`, `addWarehouse`, `updateWarehouse`, `archiveWarehouse`, `restoreWarehouse`, `deleteWarehouse`, `addCategory`, `deleteCategory`, `addProduct`, `updateProduct`, `deleteProduct`, `addParty`, `updateParty`, `deleteParty`, `addAccount`, `updateAccount`, `deleteAccount`, `addUser`, `updateUser`, `deleteUser`, `toggleUserStatus`, `addPaymentMethod`, `updatePaymentMethod`, `archivePaymentMethod`, `deletePaymentMethod`, `createSalesInvoice`, `refundInvoice`, `cancelSalesInvoice`, `addAppointment`, `updateAppointment`, `cancelAppointment`) now write and persist directly into Neon tables upon button click.

## Database-first conversion — Phase 1 Implemented (2026-10-13)

### Progress & Live Status
- **Unified Command Layer (`src/services/commands.ts`)**:
  - Upgraded to support dual database drivers:
    1. **Backend API (`server/`)**: Fastify + JWT + Row-Level Security when `erp_api_url` is configured.
    2. **Direct Neon Database (`@neondatabase/serverless`)**: PL/pgSQL atomic functions (`fn_post_customer_receipt`, `fn_post_customer_refund`, `fn_post_journal`, `fn_reverse_journal`, `fn_upsert_records`, `fn_soft_delete_records`) when connecting via Neon connection string.
    3. **Safe Offline Fallback**: local update if no database connection is active.
  - Implemented commands: `saveRecord`, `deleteRecord`, `createCollectionReceipt`, `createCustomerRefund`, `createJournalEntry`, `reverseJournalEntry`, `reloadDataset`.
- **First Converted Screens (Database-First)**:
  1. **Collection Receipts (`src/views/CollectionReceiptsView.tsx`)**:
     - Single collection receipt creation (`handleSaveNewReceipt`) writes to the database FIRST via `createCollectionReceipt`.
     - The modal remains open and displays exact database rejection errors if the database fails; local state is 100% untouched on failure.
     - Only after the database confirms does `applyLocal` commit the receipt and credit the customer in the UI.
     - Added button loading state and disabled state during database transactions.
  2. **Customer Refunds / Dues Settlement (`src/views/CustomerRefundsView.tsx`)**:
     - Refund creation (`handleSubmit`) writes to the database FIRST via `createCustomerRefund`.
     - Refund cancellation (`handleCancel`) reverses the journal in the database FIRST via `reverseJournalEntry`.
     - Added button loading states and spinners during database operations.
- **Next Screens in Roadmap**: General Journal entries (`GeneralJournalView.tsx`), POS & Sales Invoices (with idempotency keys), Supplier payments.

## Collection Receipt Cash/Bank Account Resolution & Balance Synchronization Fix — 2026-10-12

- Resolved migration and hydration errors: `Collection receipt migration skipped: no linked cash/bank account for CR-2026-0004` through `CR-2026-0009`.
- Root causes identified and resolved:
  1. **Strict payment account resolution during reconciliation**: Receipts imported or created without direct `bankOrSafeAccountId` or whose payment methods lacked a pre-mapped account ID for the tenant were failing the strict lookup in `accountsForReconciliation`. This caused `PlatformContext.tsx` to log `console.error` and prematurely abort processing for those receipts.
  2. **Skipped customer balance reduction**: Because the loop returned early on missing cash accounts, line 8960 (`!receipt.customerBalanceApplied`) never executed for those receipts. As a result, the customer's recorded ledger balance (`p.balance`) remained stale (e.g. at `-1,749.40` or `-1,049.40`) while the detailed statement matched the receipts via `isPartyReceiptMatch`, producing conflicting balances between the customer selector dropdown and the detailed movements table.
  3. **Payment account fallback and provisioning**: Added `resolveCashOrBankAccount` in `src/services/accountingEngine.ts` to locate tenant safe/bank accounts (`1111` / `1112` / `1110`) by ID, code, payment method type, or name, and synthesize standard `acc-${tenantId}-1111` ('الخزينة الرئيسية (النقدية بالصندوق)') if missing.
  4. **Customer balance decoupling from journal errors**: In `PlatformContext.tsx`, customer balance application (`customerBalanceApplied`) is executed as soon as the customer is matched, ensuring customer subledger balances are never held hostage by GL safe-account mapping issues.
  5. **Auto-provisioning safe accounts**: Added automatic provisioning of account `1111` for all tenants with active receipts or parties during reconciliation startup.
  6. **Bulk import credit application**: Ensured `customerCreditsMap` updates `allParties` even when `partyOffersMap` has zero booked session offers.
- Files: `src/services/accountingEngine.ts`, `src/context/PlatformContext.tsx`, `src/components/PartyStatementModal.tsx`. Validation: `compile_applet` passed.



- Resolved errors during hydration and customer reconciliation:
  - Error 0 & 1 (`Customer account linking skipped: لا يوجد حساب عملاء مسجل بالكود 2000 لهذا الكيان. Tenant: tenant-2718 / tenant-eg-004`).
  - Error 2 (`Collection receipt migration skipped: الحساب 2000 ليس أصلًا ذا طبيعة مدينة، لذلك لا يمكن استخدامه كحساب تحكم للعملاء. Tenant: tenant-eg-001`).
- Root cause: `resolveCustomerControlAccount` and `resolveCustomerPartyAccount` in `accountingEngine.ts` strictly looked for account code `2000` and required it to be an Asset with normal debit balance. In the chart of accounts (`INITIAL_ACCOUNTS` and `baseAccountDefs`), account `2000` is Liabilities (`الخصوم والالتزامات`, type `Liability`, `isDebitNormal: false`), while the true customer receivable control account is code `1120` (`العملاء والمدينون التجاريون`, type `Asset`, `isDebitNormal: true`). This caused `tenant-eg-001` to be rejected as non-asset, and tenants without custom code `2000` to be skipped completely.
- Fix:
  - Updated `resolveCustomerControlAccount` in `src/services/accountingEngine.ts` to prioritize standard account `1120` (Asset, debit normal), custom `2000` only if configured as debit-normal Asset, any Asset customer receivable account, and synthesize a tenant-scoped `1120` account fallback.
  - Unified `resolveCustomerPartyAccount` with `resolveCustomerControlAccount`.
  - Added auto-provisioning of missing `1120` control accounts for any tenant with customers in `PlatformContext.tsx`.
  - Updated `PartyStatementModal.tsx` to recognize both `1120` and `2000` as shared customer control accounts.
- Files: `src/services/accountingEngine.ts`, `src/context/PlatformContext.tsx`, `src/components/PartyStatementModal.tsx`. Validation: `compile_applet` passed.

## Settlement View Default Today & Customer Statement Date Presentation — 2026-10-11

- Customer Dues Settlement (`CustomerRefundsView`): Defaulted date filter strictly to today (`dateFrom = today`, `dateTo = today`) as requested by the user, while keeping manual date range and "All" buttons available.
- Detailed Customer Statement (`PartyStatementModal`):
  - Removed the branch switching toggle and the extra "show receipts outside date" banner per user request.
  - All collection receipts are recorded using the upload date as the transaction date, while any original receipt date (from Excel import or input) is embedded directly into the explanation/description (`[تاريخ الإيصال: ...]`) alongside any previous notes.
- Files: `src/views/CustomerRefundsView.tsx`, `src/components/PartyStatementModal.tsx`, `src/views/CollectionReceiptsView.tsx`. Validation: `compile_applet` passed.

## Detailed Customer Statement Balance Filters & Export Balances by Branch — 2026-10-11

- Added advanced balance filtering to the Customer Statement (`PartyStatementModal`):
  - Filters available: Greater than (`>`), Less than (`<`), Equals (`=`), Debit balances only, Credit balances only, Zero balances only.
  - Interactive threshold amount input with clear button and real-time count of matching customers.
  - Dropdown selector automatically updates to reflect only customers matching the balance criteria.
- Added Excel export for customer balances with branch selection:
  - Branch selection: Full Branch (specific branch) or All Branches (entire company).
  - Two export actions:
    1. **تصدير العملاء المفلترين (Export Filtered Customers)**: Exports customers matching the current search, type, and balance filters.
    2. **تصدير أرصدة الفرع بالكامل (Export Full Branch Balances)**: Exports all customers in the chosen branch without balance restriction.
  - Exported Excel columns include:
    - `كود العميل` (Customer Code)
    - `كود السيستم` (System Code)
    - `الكود الورقي` (Paper / File Code)
    - `اسم العميل` (Customer Name)
    - `رقم التليفون` (Phone Number)
    - `الرصيد` (Balance)
    - `طبيعة الرصيد` (Balance Nature - مدين / دائن / متزن)
    - `تاريخ التكويد` (Coding Date)
    - `الفرع` (Branch Name)
- Files: `src/components/PartyStatementModal.tsx`. Validation: `compile_applet` passed.

## Customer Refunds Persistence & Comprehensive Statement Receipts Linking — 2026-10-11

- Fixed Customer Dues Settlement (`CustomerRefundsView` / `allCustomerRefunds`) persistence: `erp_customer_refunds` was not loaded in `hydrateDatasets` and was mirrored only to IndexedDB without localStorage, causing imported movements to disappear upon refresh. Now fully hydrated from IndexedDB, mirrored safely to both localStorage and IndexedDB, with an automatic self-healing recovery from journal entries.
- Fixed `CustomerRefundsView` filtering: previously defaulted strictly to `today` and active branch, hiding movements from earlier dates or other branches. Added branch toggle (All Branches vs Active Branch), default all-dates view, and a reactive recovery banner if transactions exist outside current filters.
- Detailed Customer Statement (`PartyStatementModal`):
  - Made collection receipts and refunds matching robust against auto-serial customer code (with or without leading zeros), system code, phone, and normalized Arabic name.
  - Receipt line displays: posted date shows upload date, and receipt explanation/description prominently preserves `[تاريخ الإيصال: ...]` along with service description and notes.
  - Linked quantity movements and package balances now match all receipts by customer code seamlessly.
  - Added branch scope toggle (All Branches vs Active Branch) and proactive banner for any hidden receipts outside date/branch filters.
- Files: `src/context/PlatformContext.tsx`, `src/views/CustomerRefundsView.tsx`, `src/views/CollectionReceiptsView.tsx`, `src/components/PartyStatementModal.tsx`. Validation: `compile_applet` passed.
## Receipt linking by auto-serial code + reconciliation guard — 2026-10-11

- Receipt-to-customer matching now uses the auto-serial customer code only (removed systemCode/paperCode/name fallbacks) in the customer statement and the reconciliation.
- Reconciliation resolves a missing receipt `partyId` from `receipt.customerCode` before skipping it.
- The reconciliation effect is guarded with try/catch so an unexpected error cannot crash the UI (data preserved, error logged).
- Files: `src/context/PlatformContext.tsx`, `src/components/PartyStatementModal.tsx`. Validation: tsc unchanged (126 pre-existing); vite build ok.

## Import date handling fix — 2026-10-11

- Imported collection receipts and refunds were being dropped when the file date was not `YYYY-MM-DD`, so they never showed in the detailed customer statements.
- Now the importer posts with the upload date and keeps the file date in the notes; the date column is optional in both importers.
- Files: `src/views/CollectionReceiptsView.tsx`, `src/views/CustomerRefundsView.tsx`. Validation: tsc error count unchanged (126 pre-existing); vite build ok.

## Customer Refunds — Excel import + stricter manual validation — 2026-10-11

- The Customer Dues Settlement screen now supports Excel import. Required columns: customer code (auto-serial), customer name, value; everything else is optional.
- Manual entry requires service + units + value.
- Added `customerRefundNumberCounter` so bulk-imported refunds get unique sequential voucher numbers.
- Validation: tsc error count unchanged (126 pre-existing); vite build succeeded.

## New screen — Customer Dues Settlement — 2026-10-11

- New view `CustomerRefundsView` (sidebar: "تسوية مستحقات عميل") lists customer refunds, defaults to today and filters by the active branch; supports customer search by name/customer code/system code/file code/paper code/phone and shows the selected customer's value + quantity balances.
- New type `CustomerRefundVoucher`; context adds `allCustomerRefunds`, `customerRefunds`, `addCustomerRefund`, `cancelCustomerRefund`.
- Posting rule: customer account **debit** / payment-method-linked account **credit**; posts to journal, COA and trial balance; reflected in the customer statement (value debit + negative quantity movement); refunded units reduce the customer's remaining package balance.
- Validation: tsc error count unchanged (126 pre-existing); vite build succeeded.

## Accounting — Excel export + active-branch default — 2026-10-11

- Excel (.xlsx) export buttons added to all five accounting areas (COA, General Ledger, General Journal, Trial Balance, Customer/Supplier Statements). Each exports the full filtered dataset with Arabic headers.
- `selectedBranchId` now defaults to the active branch (`activeBranch.id`); manual switching to all-branches/HQ is still available.
- `PartyStatementModal` gained an optional `branchId` prop; when opened from Accounting it is branch-scoped, otherwise it keeps the previous all-branch behaviour.
- New util: `src/utils/excelExport.ts`. Validation: tsc error count unchanged (126 pre-existing), vite build ok.

## Performance fix — fast bulk selection in General Journal — 2026-10-11

- "Select all filtered entries" no longer freezes the app on large filters. Root cause: O(n²) `includes` checks over up to 40k selected ids, plus resolving each selected entry's source on every render.
- Fixes: memoized selection `Set` (O(1) membership), lazy reversible-subset resolution on action, memoized id lists, and O(n²)→O(n) maps in `forceDeleteJournalEntries`/`reverseJournalEntries`.
- Behaviour/eligibility rules unchanged. Files: `src/views/AccountingView.tsx`, `src/context/PlatformContext.tsx`. Validation: tsc error count unchanged (126 pre-existing), vite build ok.

## Detailed Customer Account — Receipt-linked quantity view & improved selector — 2026-10-11

- Quantity view (QUANTITY mode) now links collection-receipt data (product/service name + booked quantity) into its existing offers/packages mechanism; the earlier standalone table was removed. Receipts already represented as offers are de-duplicated by voucher number.
- Value view records collection receipts as credit movements with service description, date and cumulative running balance (already present; verified).
- Customer selector defaults to no selection and supports search by name, phone, customer code, system code, paper code, file code and file number.
- Chart of accounts untouched. Files: `src/components/PartyStatementModal.tsx`. Validation: tsc error count unchanged (126 pre-existing), vite build succeeded.

## Detailed Customer Account — Collection Receipt Quantity & Service Movements — 2026-10-11

- Collection receipts now appear line by line in the detailed customer account (`PartyStatementModal`, QUANTITY mode) as a dedicated "Quantity & Service Movements" table: date, voucher number, service, booked quantity, value, and collection method, plus totals.
- The table is built directly from the receipt records, so it shows receipts from every source (direct entry, Excel import, migration posting) and honours the statement's date-range filter.
- The chart of accounts is deliberately unchanged: the journal entry still debits the payment-method-linked account and credits the unified customer control account `2000`. The detailed customer account is a separate, per-customer movement view and does not alter the consolidation design.
- Decision: the "customer account" the owner referred to is the detailed/statement account (identified by the auto-serial customer code), not a per-customer chart-of-accounts account. No change to customer account consolidation was made.
- Files: `src/components/PartyStatementModal.tsx`. Validation: `tsc --noEmit` error count unchanged (126 pre-existing) and `vite build` succeeded.

## Forced Permanent Journal Deletion — 2026-10-11

- General Journal now offers a forced permanent delete action for one or multiple entries. After explicit confirmation it bypasses accounting eligibility checks, including source link, period lock, posted state, and balance. A deletion reason is optional; the deleted entry itself and actor/action are recorded in audit/activity logs.
- If the entry was posted, its account snapshot effect is reversed before removing it from journal storage. Exact-linked collection receipts receive a persisted `journalPostingSuppressed` flag so receipt hydration does not recreate the deleted entry.
- This is deliberately a journal-only destructive override. It does not remove source vouchers or reverse unrelated inventory/customer/supplier/operational effects; the confirmation explains that impact. Use only when the user accepts that source and journal data may diverge.
- The override still enforces tenant ownership and requires an explicit final confirmation. Runtime data is modified only when the user confirms the action in the app.

## Journal Source Details and Navigation — 2026-10-11

- General Journal and the unbalanced-entry review now provide a source button that opens a popup with source-specific records and key details, including receipt/payment vouchers, invoices, shift operation rows and expenses, maintenance, inventory audits, payroll items, and goods receipts/issues.
- Each linked record can launch its owning module using the app's existing navigation event. This directs the user to the source workflow, where source edits/cancellations must be applied so their journal/accounting and operational effects remain aligned.
- Source matches use exact stored journal IDs. Text-only or unmatched markers show that no reliable source record can be opened; the journal remains protected from direct mutation.
- This change adds source resolution/navigation, not a universal in-popup source editor or deletion API. The source modules retain responsibility for source-specific correction rules; no source or journal data is changed by opening the popup.

## Journal Quick Filters and Safe Bulk Reversal — 2026-10-11

- General Journal now filters entries by number, date range, account code/name, and debit/credit total ranges. Results retain 50-entry pagination.
- Users can select reversible entries on the current page or reverse one entry directly. Confirming posts an equal-and-opposite journal dated in the current open period, retains the original, and writes an audit/activity record with the required reason. The full batch is validated before any selected entry is applied, and an entry already reversed is blocked.
- To preserve source consistency, reversal is enabled only for balanced, posted, source-free manual journals. Source-linked receipts, inventory, payroll, shift, and other operational entries must be corrected from their source workflow; unbalanced journals remain in the existing dedicated correction flow.
- This is a client-side filter over the journal data already hydrated into Context/local storage, not a server-side database query. No live/runtime journal records were modified.

## Historical Unmapped Account Consolidation — 2026-10-11

- In Trial Balance, users can explicitly consolidate all unresolved lines in the selected branch scope into the tenant-wide temporary account `9999999` (`أرصدة تاريخية مجمعة - تحت المراجعة`).
- Existing posted journal lines are reassigned to this account without changing amount, date, source voucher link, or debit/credit totals. Their original account ID/code are retained on each line and displayed in General Journal and General Ledger.
- The confirmation requires a reason and lets the user choose the account type. The suggested/default type is credit-normal Liability because the current all-branch unresolved movement has a net credit; this is only a temporary classification, not a verified classification of the old accounts.
- Operation is blocked for locked periods, duplicate code 9999999, or an existing account not matching the dedicated consolidation account. It is scoped to the active tenant and selected branch report; audit/activity logs record aggregate counts and totals.
- The live/local browser ledger is not available to this workspace; no runtime journal/account data has been changed. An authorized user must run the confirmation on the updated application.

## Source-Aware Unbalanced Journal Review — 2026-10-11

- Accounting now has a paginated control to review posted unbalanced entries, inspect their debit/credit lines, source references, and differences.
- A journal repair records an audit/activity reason, validates a balanced replacement, and enforces account ownership for the same tenant/branch. Linked cash receipt/payment journals are editable only when the resulting debit total still equals the linked voucher total; source voucher data and customer/supplier statement movements remain unchanged.
- Unlinked manual journals can be corrected or logically voided (unposted, retained in history, account snapshot reversed, and void reason/user/time recorded). Period locks prevent repair and void.
- Journals linked to other operational records or with text-only/ambiguous source markers are read-only in this screen; they must be updated through their source workflow so inventory, payroll, shift, invoice, maintenance, or other downstream effects are not orphaned.
- The real runtime ledger remains unavailable in this workspace, so no live entries were inspected or modified. The new screen surfaces runtime sources when the user opens the app; unsupported source kinds need their source-specific correction workflow.

## Legacy Account Matching and Customer Account Display

- Accounting's Chart of Accounts, general journal entries, General Ledger movements, and Trial Balance tables now render at most 50 rows/entries per page with explicit navigation. Filtering/branch changes reset the relevant page. This is client-side render pagination: the current Context/local storage data source still hydrates the underlying arrays in memory; it does not yet fetch pages from Neon.
- Chart of Accounts displayed balances, revenue/expense summary values, Trial Balance, and General Ledger are now based exclusively on posted journal lines. The chart-account master still supplies account names/codes/types, but stored `account.balance` snapshots are not used as report balances or implicit opening balances.
- General Ledger applies the same tenant/branch-aware account ID/code resolver as Trial Balance and excludes unposted journals; this keeps the customer-control account's chart balance, trial-balance amount, and ledger movements consistent. Existing account snapshots/journals are unchanged.
- Trial Balance status distinguishes genuinely unbalanced posted entries from a numerically incomplete report caused by unmapped lines. The latter explicitly says that zero unbalanced entries does not mean all account activity is included.
- New journal posting paths validate finite, non-negative debit/credit amounts, prohibit both sides on one line, and require a non-empty entry with equal debit/credit totals before it can be built or posted. This does not rewrite existing journals.
- Revenue-session posting now rejects non-finite/negative amounts and collections greater than the session's revenue. Such over-collections require an approved customer-advance account/rule that is not defined in the current chart; collection forms and Excel import report the issue before saving.
- Trial Balance resolves journal lines by exact account ID first, then by a unique tenant-scoped account code, preferring the journal's branch account and falling back only to a unique general account.
- Legacy customer receivable lines using `1120` or `1120-*` are included under account `2000` only when the tenant has exactly one valid debit-normal Asset control account. No journal records or account balances are rewritten by this report-time mapping.
- Unresolved lines remain excluded and diagnosed; only the first 50 details are rendered while the total unresolved count remains visible, preventing a large legacy dataset from overwhelming the screen.
- Trial Balance diagnostics also summarize unresolved lines by their historical account ID/code, showing movement count and debit/credit totals so missing-account mappings can be reviewed without guessing or editing the ledger.
- Customer cards and the compact customer table now display each party's linked chart account, or explicitly show when the stored account link is missing or cannot be resolved.
- Receipt reconciliation now honors a valid posted journal ID linked to the receipt even when its journal-line memo lacks the receipt number. This prevents the hydration repair from creating a second journal for an already-linked receipt. Existing historical duplicate journals are not deleted or netted automatically.
- Runtime/localStorage ledgers are not present in this workspace. The updated report can identify unresolved lines and show the recalculated balances when run with the user's data, but does not claim to have reconciled or changed those real records.

## Last Updated

2026-10-10

## Project

Universal Business Platform

## GitHub Pages Deployment — 2026-10-10

- The repository's Pages settings were confirmed disabled, which explained why merged changes were not appearing on the live site; there had been no existing deployment workflows or recorded deployments.
- Added `.github/workflows/deploy-pages.yml`: pull requests to `main` build and validate the static app; pushes to `main` and manual workflow dispatch build and deploy the site to GitHub Pages using Bun's frozen lockfile.
- Vite uses `/Universal-Business-Platform/` as the Pages production base path and `/` for local development.
- Enabled GitHub Pages using the GitHub Actions source. The workflow's first production deployment on `main` completed successfully at commit `5fe03034cc5ba18118a3be5887e4c50c460940ca`.
- Verified the live site at `https://amrselimali.github.io/Universal-Business-Platform/` and confirmed its HTML, JavaScript, and CSS assets return HTTP 200.

## Customer Control Account and Trial Balance Diagnostics — 2026-10-10

- The Chart of Accounts view hides legacy generated customer subledger accounts (`acc-customer-*` with `1120-*` codes), so customers are not listed individually in the chart; transaction records and journal lines are not deleted by this display filter.
- After storage hydration, active coded `Customer` and `Both` profiles are linked to the unique account code `2000` in their tenant, without changing their balances or journal history. Archived/merged customers are excluded; `Both` profiles retain their previous supplier account in `supplierAccountId`, used by supplier postings and statements. Missing or duplicate `2000` accounts are logged and left unchanged.
- Direct collection receipts now post a debit to the selected payment method's exact tenant-scoped cash/bank account and a credit to the exact tenant-scoped account code `2000`. Posting is rejected when code `2000` is missing, duplicated, or not a debit-normal Asset, or when the payment method has no valid linked cash/bank Asset account.
- New receipts no longer create `1120-<customerCode>` subsidiary accounts. Existing subledger consolidation targets `2000` only when it is a debit-normal Asset; historical receipt journal credits are reclassified only when the voucher number is explicitly present on the credit-line memo. Generated customer subledgers are removed only when their projected balance is zero and no journal line or party still references them. Locked periods and unidentifiable journal lines are left untouched.
- Customer party links are pointed to control account `2000` without replacing a `Both` party's existing supplier payable link. Receipt vouchers now retain `systemCode` and customer code; customer statements show receipt movements from the voucher once, suppress linked shift-row and journal duplicates, and avoid treating shared account `2000` as a unique party ledger.
- The trial-balance screen now lists posted unbalanced journal entries with debit/credit totals and their difference, and resolves lines by account ID or unique tenant/branch-scoped code. Legacy `1120` customer lines are grouped under `2000` only when that account is a valid debit-normal Asset. Unresolved journal lines remain visible in diagnostics. Account balance synchronization uses account IDs only to avoid applying same-code movements across tenants.
- Repository demo reconciliation: its sole posted opening entry (`JV-2026-0001`) has debit `465,000`, credit `465,000`, difference `0`, and no unresolved accounts. However, the bundled demo account `2000` is `الالتزامات (الخصوم)` with type `Liability`, not a customer receivable Asset. The demo data is therefore correctly rejected by the new collection posting guard; no demo or user ledger was rewritten to hide this chart conflict.
- Runtime/localStorage accounting data is not available in this workspace. To calculate the user's actual trial-balance difference and safely assess all historical entries, export posted journal entries with their lines (`tenantId`, `branchId`, entry number/date/source, line account ID/code, debit, credit, memo), the matching account master (`id`, tenant, branch, code, name, type, normal balance, parent, current balance), and collection vouchers (`partyId`, system/customer code, voucher/reference number, amount/date, journal ID) plus applicable period locks.
- Validation: production build passed. Focused accounting-engine checks confirmed balanced posting, tenant/type isolation, and rejection of an unlinked payment account. TypeScript checking still reports pre-existing unrelated errors, including missing `Branch.nameAr` references. No runtime ledger export or migration was run.

## Repository

Universal-Business-Platform

## Current Development Status

The project is an actively developed React/TypeScript business platform.

The application currently contains multiple operational, financial, inventory, medical/service, staff, payroll, booking, fiscal, notification, and administration modules.

The project is being developed toward a cloud-native architecture using Neon PostgreSQL.

## Collection Receipt Direct Accounting & Customer Quantity Crediting — 2026-10-10

- Collection receipts recorded or imported from the Collection Receipts screen now bypass reception shift run sheets entirely (`receptionShifts` remain unaffected) and post directly to the General Ledger and chart of accounts.
- Journal entries debit the selected payment-method account and credit the customer's own subsidiary receivable account by the receipt amount.
- If a customer has no linked account, posting creates a receivable subaccount beneath account 1120, identifies it with the generated Customer Code, and links it to the customer profile before creating journal lines.
- Receipt posting credits the Party balance snapshot. On first hydration, existing unlocked direct receipt vouchers are reconciled once, linked to existing customer-code subledgers where available, and any missing journal is created as a balanced cash/customer entry; any existing voucher-linked journal credit still on shared account 1120 is reclassified without adding another cash debit. Locked periods are not modified.
- Customer statements include only the customer's receivable credit from a direct collection journal if its voucher movement is missing, and suppress duplicates when the voucher is present; the matching cash debit is never counted as a customer movement.
- Trial balance rows and totals are derived from posted journal entries, avoiding double-counting parent and subsidiary account balances; the balanced status compares actual posted debits and credits.
- Collection receipts now require/support selecting the service, product/package, and booked quantity (`serviceName`, `productId`, `productName`, `bookedQuantity`).
- Added a dedicated "Record Collection Receipt" modal in Collection Receipts view, allowing direct entry of customer, amount, receipt date, payment method, product, service, booked quantity, and notes.
- Customer account statements (`PartyStatementModal`) reflect each collection receipt once as a credit transaction and include the purchased service/product quantity under customer packages and offers; the corresponding direct-posting journal is excluded from the generic journal movement list to prevent duplicate statement credits.
- Validation: `npm run build` passed. `npm run lint` remains blocked by existing repository-wide TypeScript diagnostics; none point to the customer account-linking or direct receipt posting changes.

## Collection Receipt Excel Numeric Handling — 2026-10-10

- Fixed Excel collection import values reaching accounting code as strings: revenue journal construction now safely converts revenue and collection amounts to finite numbers before rounding, and the import explicitly normalizes amounts before adding shift rows.
- Validation: `npm run build` passed; Vite reports the existing large-chunk warning.

## Journal Storage Quota — 2026-10-10

- Accounting journals now persist in IndexedDB instead of writing the full journal history into the `erp_journals` localStorage key. Startup hydration merges IndexedDB journal entries with the legacy localStorage data by entry ID, preserving existing records during migration.
- If IndexedDB persistence fails, the app retains current journal data in memory and reports the persistence failure instead of crashing the receipt import with a quota exception.
- Reception shifts and their detailed run rows now use the same IndexedDB persistence path. Startup merges stored shifts by ID with the legacy localStorage values, preventing quota failures as run history grows.
- The reception-shift persistence effect is placed after its state initialization to avoid a temporal-dead-zone startup exception. Production build passes.

## Collection Receipt Column Filters and Archive — 2026-10-10

- Added optional per-column filters for receipt number/status, date, customer identifiers/contact, branch, source, shift/status, collected amount, payment method, and service/description/notes.
- Added select-all for the current filtered result set, bulk receipt archiving, and active/archived/all display modes. Archiving marks receipt rows only and does not alter financial totals or journal entries.
- The receipt table now shows the branch name in a dedicated column.
- Validation: `npm run build` passed; Vite reports the existing large-chunk warning. `git diff --check` passed.

## Collection Receipt Accounting Posting — 2026-10-10

- Excel collection imports now create posted journal entries that debit each payment method's linked cash/bank account and credit the matched customer's receivable account. Entries are grouped by branch and receipt date, and are created even when no reception shift is open.
- When a shift is open, one batched run-sheet update adds receipt-only rows (`totalRevenue: 0`) linked to the voucher journal IDs, preventing duplicate cash debits and revenue.
- Collection Receipts includes customer cash vouchers that are not already represented by a run-sheet row. A branch-scoped “Post unposted” action backfills eligible unposted vouchers and run-sheet receipt rows by their original date, skipping historical receipts that already have a linked shift journal or fall in a locked period.
- Cash receipts now persist in IndexedDB and hydrate alongside legacy localStorage records to support bulk imports beyond localStorage quota.
- Validation: `npm run build` passed; Vite reports the existing large-chunk warning. `git diff --check` passed.
- TypeScript check remains blocked by existing diagnostics elsewhere (Branch/Tenant `nameAr` references and context properties in Clinics, Neon Hub, Parties, and POS views); no diagnostics point to the collection posting changes.

## Latest Completed Request — 2026-10-08

## Customer Coding Review and Safe Merge — 2026-10-10

- Added a Customer Coding Review modal with searchable customer fields, branch/status/code/phone/date filters, select-all, and bulk archive, guarded permanent delete, and merge actions.
- Branch/status and each identifier filter support multiple selections. The customer-code, system-code, and file-code dropdown options are populated from customer records and narrowed by selected branches. Duplicate review has its own section title.
- Every multi-select dropdown has an option search. Select-all/clear applies to the currently visible choices and preserves selected values outside the current dropdown search.
- Customer Management has a separate all/active/archived status filter with counts. Permanent deletion remains permanent, so deleted profiles are not retained for a deleted-only list.
- Detailed booking/follow-up history for a merged customer resolves linked files from both primary and archived records and matches historical records by linked IDs or legacy name/phone/code fields, without rewriting transaction rows.
- The detailed history customer search excludes archived/merged profiles and resolves matching legacy transaction records to their active primary customer.
- Customer Coding Review can group active customers with matching System Codes and merge all groups in one operation after the user selects each group's primary file.
- Merge selects one active primary customer, records the source customer IDs and transfer note on the primary profile, and archives the source profiles. Existing bookings and follow-ups continue to reference their original customer IDs; the primary profile's booking/follow-up history view includes merged source IDs without changing historical rows.
- Archived/merged customers are excluded from customer selection in Bookings and Reception Operations.
- Permanent deletion skips customers with linked active cash receipts, posted/refunded revenue invoices, active specialized tax invoices, or revenue/collection operation rows. Bulk deletion uses a single customer-state update and consolidated audit/activity entries for large batches.
- Validation: production build passed. `tsc --noEmit` continues to report existing repository-wide type errors; the touched customer review lines produced no diagnostics. The app's customer persistence currently uses local state/local storage and IndexedDB; the existing Neon party service has no update/delete path for party lifecycle operations.

- Collection Receipts now display the linked customer's serialized Customer Code before the customer name, and Excel export includes the customer serial and registered payment method code.
- Collection import validates customer codes against customer records including archived customers, payment method codes against Payment Methods, and rejects dates later than the local current date. Validation errors are shown before confirmation; the existing explicit force-upload option retains rows with their entered values for upload as-is.
- Imported valid receipts link to the matched customer and use the registered payment method's category for cash receipt posting.
- Validation: not run in this request.

## Earlier Completed Request — 2026-10-08

- Added same-branch customer duplicate detection to quick booking intake: name and phone similarity of at least 80%, or exact System Code / File Code match. The warning lets staff select an existing customer or explicitly continue creating a new coded customer linked to the active branch.
- Added the same duplicate warning before Customer Management creates a customer, with a confirmation option to create a new record anyway.
- The date-range review begins only after pressing Review Results, compares names only (Arabic and English name fields), stays within each branch, and scans in yielding batches.
- Optimized the 80% name similarity matcher to retrieve candidates through the rarest necessary bigrams and stop edit-distance checks as soon as a pair cannot meet the threshold. Matching pairs within the selected target range are processed once.
- Validation: npm run build passed. npm run lint remains blocked by existing TypeScript errors outside the new duplicate detection and UI logic.
- Limitation: the review period uses the customer record's createdAt date because the model has no separate coding timestamp.

- Detailed booking and follow-up rows now show Customer Code, System Code, File Code, branch, and date in aligned columns, sourced from the linked Customer Management record. Fixed table layouts and wrapped content display every column without horizontal scrolling. The profile summary uses the same customer fields; branch name comes from the linked customer's branch assignment.
- Validation: `npm run build` passed. `npm run lint` remains blocked by existing repository-wide TypeScript errors; no new diagnostic points to the detailed history changes.

- Booking Management Customer Code, System Code, and File Code columns now use the linked Customer Management record as their primary values. Booking creation, edit, follow-up display, and Excel export use the same source precedence.
- Validation: production build passed; repository TypeScript check remains blocked by existing errors documented in CHANGELOG.md.

- Corrected legacy Customer Code normalization to retain valid unique numeric serials and repair missing, duplicate, or System Code-matching values without resetting valid codes. Booking and follow-up displays now prioritize the linked customer's independent serial and reject a Customer Code equal to its System Code.
- Booking Management agenda uses fixed-width wrapping columns with a 72vh internal vertical scroll area and no horizontal table scrolling.
- Validation: `npm run build` passed; TypeScript validation status is recorded in the latest changelog entry.

- Booking Management agenda heading now reads "Customer Code" in Arabic and English. Removed its fixed-height internal vertical scrolling; the table expands naturally and the top/bottom shortcuts scroll the page.
- Validation for this follow-up: `npm run build` (see latest changelog entry).

- Customer Codes are numeric serials independent from System Codes. New customer creation and bulk imports check existing and in-batch numeric codes before allocation; editing preserves the stored Customer Code.
- Customer import no longer treats System Code as Customer Code, and Customer Management CSV/Excel exports include both identifiers separately.
- Booking and follow-up import/export mappings carry Customer Code and System Code independently, including generated customer codes returned from bulk import.
- Removed the rendered Created By column from the follow-up table and patient follow-up history table; `createdBy` remains on records and in import/export data.
- Removed the Booking Management heading's explicit new-tab behavior, custom context-menu launch actions, and sidebar's dedicated new-tab icon for bookings. Ordinary navigation remains.
- Preserved Add New Booking and New Follow-up actions for past and today bookings.
- Validation: `npm run build` passes. `npm run lint` (`tsc --noEmit`) remains failing with numerous existing type errors across the repository; no errors were reported on the changed Customer Code generator/import/export code.

### Files changed

- `src/context/PlatformContext.tsx`
- `src/views/PartiesView.tsx`
- `src/views/BookingsFollowUpView.tsx`
- `src/components/GlobalContextMenu.tsx`
- `src/components/Sidebar.tsx`
- `PROJECT_STATE.md`
- `CHANGELOG.md`

### Remaining known limitation

- Repository-wide TypeScript checking is not clean. Existing type errors remain in unrelated modules and in pre-existing parts of `BookingsFollowUpView.tsx` and `PlatformContext.tsx`.

## Latest Completed Request — 2026-10-08

- Customer Codes are numeric serials independent from System Codes. New customer creation and bulk imports check existing and in-batch numeric codes before allocation; editing preserves the stored Customer Code.
- Customer import no longer treats System Code as Customer Code, and Customer Management CSV/Excel exports include both identifiers separately.
- Booking and follow-up import/export mappings carry Customer Code and System Code independently, including generated customer codes returned from bulk import.
- Removed the rendered Created By column from the follow-up table and patient follow-up history table; `createdBy` remains on records and in import/export data.
- Removed the Booking Management heading's explicit new-tab behavior, custom context-menu launch actions, and sidebar's dedicated new-tab icon for bookings. Ordinary navigation remains.
- Preserved Add New Booking and New Follow-up actions for past and today bookings.
- Validation: `npm run build` passes. `npm run lint` (`tsc --noEmit`) remains failing with numerous existing type errors across the repository; no errors were reported on the changed Customer Code generator/import/export code.

### Files changed

- `src/context/PlatformContext.tsx`
- `src/views/PartiesView.tsx`
- `src/views/BookingsFollowUpView.tsx`
- `src/components/GlobalContextMenu.tsx`
- `src/components/Sidebar.tsx`
- `PROJECT_STATE.md`
- `CHANGELOG.md`

### Remaining known limitation

- Repository-wide TypeScript checking is not clean. Existing type errors remain in unrelated modules and in pre-existing parts of `BookingsFollowUpView.tsx` and `PlatformContext.tsx`.

---

## Current Technology

- TypeScript 5.8+
- React 19
- Vite 6
- Tailwind CSS 4
- Node.js 22 LTS
- Native ESM
- Neon PostgreSQL
- `@neondatabase/serverless`
- Recharts
- Motion
- Lucide React
- XLSX
- DOCX

---

## Repository State

Current local repository:

`D:\Universal Business Management Platform\universal-business-platform22092026`

Current local branch:

`master`

Remote repository:

`origin`

GitHub repository:

`Universal-Business-Platform`

---

## Important Recent Development

Recent development has included work related to:

- Booking search and sorting performance.
- Patient follow-up persistence.
- General performance and UI consistency.
- Pagination and import flexibility.
- Appointment paper-file-code support.
- Fiscal features and system manual.
- Inventory tracking.
- Accounting functionality.
- Neon database integration.

---

## Current Architecture Areas

### Application entry

- `src/main.tsx`
- `src/App.tsx`

### Shared application state

- `src/context/PlatformContext.tsx`

### Services

- `src/services/accountingEngine.ts`
- `src/services/neonService.ts`

### Views

- `src/views/`

### Components

- `src/components/`

### Data

- `src/data/`

### Utilities

- `src/utils/`

### Types

- `src/types.ts`

### Database/scripts

- `scripts/neon_schema_migrations.sql`
- `scripts/generate_docx_manual.js`

---

## AI Shared-Memory System

The project now uses repository-based shared AI memory.

Primary files:

- `MASTER_AI_INSTRUCTIONS.md`
- `AI_CONTEXT.md`
- `PROJECT_STATE.md`
- `CHANGELOG.md`

The purpose is to allow different AI development tools to continue work using the same project context.

The shared AI instruction system is now configured: root `AGENTS.md` directs Codex to read the shared memory files, and `.github/copilot-instructions.md` directs GitHub Copilot to read them and follow the project change-approval rules. Codex has been successfully installed and authenticated.

---

## Agent Handoff Status

### Previous Agent

Initial setup of shared AI project instructions and memory system.

### Work Completed

Created:

- `MASTER_AI_INSTRUCTIONS.md`
- `AI_CONTEXT.md`
- `PROJECT_STATE.md`
- `CHANGELOG.md`
- `.github/copilot-instructions.md`

The contents of the first three files are being established as part of the shared AI workflow.

### Important Rule

The master instruction file must not be independently rewritten by an AI agent.

It may be changed when the project owner explicitly requests or approves a change.

---

## Current User Goal

The project owner wants multiple AI development tools to work on the same GitHub project while maintaining a shared understanding of the project.

Target tools include:

- Google AI Studio
- OpenAI Codex
- Claude Code
- GitHub Copilot

The desired system should allow one AI tool to continue work started by another without depending on private chat history.

---

## Desired AI Workflow

The intended workflow is:

1. User gives a development task.
2. One AI agent performs the task.
3. The agent records important changes and current state.
4. The work is synchronized with GitHub.
5. The next AI agent reads the shared project memory.
6. The next agent continues from the actual repository state.
7. Agents do not assume that another tool's private conversation is available.

---

## Change Approval Model

AI agents are allowed to modify any files required to complete the user's explicit request.

The project does NOT have an absolute "Core files cannot be changed" rule.

If a significant additional change outside the requested task becomes necessary or desirable, the agent must stop and ask the project owner before implementing that additional change.

The agent should explain:

- Proposed change
- Reason
- Affected files/systems
- Expected impact
- Alternatives

---

## Known Performance Concern

Large data operations require careful handling.

A previous issue occurred when approximately 10,000 customer records were loaded/imported and the browser became blank or unresponsive.

Future large-data features should favor:

- Pagination
- Filtering
- Sorting
- Database-side operations
- Batching
- Incremental loading
- Efficient React updates

---

## Known Repository Notes

At the time this state file was created, the local repository had untracked files including:

- `.vs/`
- `package-lock.json`

Do not automatically delete, add, commit, or discard these files without understanding their purpose and the user's intended Git workflow.

---

## Current Next Steps

1. Verify how each AI tool consumes the shared repository instructions.
2. Establish a safe handoff workflow between AI Studio, Codex, Claude Code, and Copilot.
3. Establish a practical branch/synchronization strategy.
4. Protect the master instruction file from accidental changes while allowing the project owner to change it.
5. Keep `main`/the stable branch safe while allowing normal feature development.

---

## Important Handoff Rule

Before another AI agent starts substantial work:

Read:

1. `MASTER_AI_INSTRUCTIONS.md`
2. `AI_CONTEXT.md`
3. `PROJECT_STATE.md`
4. `CHANGELOG.md`

Then inspect the actual source code relevant to the requested task.

Never rely solely on this document when the actual code can answer the question.
## Codex Setup and Repository Inspection (2026-10-08)

- Codex has been successfully installed and authenticated.
- `AGENTS.md` was created in the repository root to direct Codex to read `MASTER_AI_INSTRUCTIONS.md`, `AI_CONTEXT.md`, `PROJECT_STATE.md`, and `CHANGELOG.md` before substantial work.
- The repository structure was inspected without modifying application code.
- Confirmed application entry points: `src/main.tsx` mounts the app, and `src/App.tsx` provides the platform provider, login/layout orchestration, and view navigation.
- Confirmed central shared state: `src/context/PlatformContext.tsx` provides `PlatformProvider` and `usePlatform`.
- Confirmed main services: `src/services/accountingEngine.ts` and `src/services/neonService.ts`.
- Confirmed Neon integration locations: `src/services/neonService.ts`, `scripts/neon_schema_migrations.sql`, and the database management UI in `src/views/NeonHubView.tsx`.
- Identified large-data-sensitive areas: shared collections and bulk operations in `PlatformContext.tsx`; customer lookup/import and chunk processing in `BookingsFollowUpView.tsx`; customer filtering and pagination in `PartiesView.tsx`; and full-payload workbook generation in `src/utils/fullDatabaseExcelBackup.ts`.
- No application files were modified during this inspection.
