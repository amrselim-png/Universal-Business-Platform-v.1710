# تثبيت خط CI (خطوة يدوية واحدة)

> **سبب وجود هذا الملف:** تطبيق GitHub المربوط بالمستودع لا يملك صلاحية `workflows`،
> لذلك لا يمكنه إنشاء ملفات داخل `.github/workflows/` مباشرة.
> الحل: الملف موجود هنا كقالب جاهز — انسخه يدوياً مرة واحدة.

---

## الخطوة الوحيدة

من جذر المشروع:

```bash
mkdir -p .github/workflows
cp docs/ci/ci.yml .github/workflows/ci.yml
git add .github/workflows/ci.yml
git commit -m "ci: add CI pipeline"
git push
```

بعد كده الـ CI هيعمل تلقائياً على كل Push و Pull Request.

---

## اللي بيعمله الـ CI

### المهمة 1 — `verify`

| الخطوة | الأمر | إيه اللي بيمنعه |
|---|---|---|
| فحص الأنواع | `npm run lint` | رجوع أخطاء TypeScript تاني |
| الاختبارات | `npm run test` | كسر منطق موجود |
| البناء | `npm run build` | كود مش بيتبني |
| ميزانية حجم الحزمة | `node scripts/check-bundle-budget.mjs` | تضخّم الحزمة الابتدائية (أول ما يشعر به المستخدم) |

### المهمة 2 — `guardrails`

| الخطوة | الأمر | إيه اللي بيمنعه |
|---|---|---|
| حد حجم الملفات (التطبيق الحالي) | `node scripts/check-file-size.mjs` | تكرار ملف بحجم `PlatformContext.tsx` (12,000+ سطر) |
| بوابات المعمارية الجديدة | `node scripts/architecture-guardrails.mjs --check` | تجاوز 300 سطر في نطاق المحرك، زر بلا فعل مسجّل، غياب ثابت معماري (RLS/version/NOTIFY/SignalR/YARP)، أو لقطة قياس قديمة |

#### إيه اللي بيفحصه `architecture-guardrails`؟

1. **حد 300 سطر** على نطاق المعمارية الجديدة: `erp-nextgen-local/**` (التطبيق
   المرجعي .NET/SQL) + ملفات المحرك الجديد (`src/services/architectureGuardrails.ts`،
   `src/components/architecture/**`، `src/data/architecture/**`، الشاشة، السكربتات).
2. **سجل الأفعال (Action Registry)**: كل موضع فحص صلاحية في الشاشات
   (`canPerformAction('...')`) يجب أن يكون مسجّلاً في `src/data/actionsData.ts`،
   وأن يشير لشاشة موجودة — وإلا فشل الـ CI (Default-Deny).
3. **الثوابت المعمارية**: سياسات RLS، أعمدة `version`، `pg_notify`، جسر
   `LISTEN`/SignalR، مسارات YARP، فلتر 403، HttpOnly، Keyset Pagination، Outbox،
   وألا يستورد كود العميل أي عميل قاعدة بيانات. التوصيات غير المُلزِمة (مثل
   PgBouncer) تُعرض منفصلة ولا تُفشل الـ CI.

القياس يُحفظ في لقطة مولَّدة: `src/data/architecture/guardrailsSnapshot.ts`
ويُقرأ منه في شاشة «معمارية المنظومة الجديدة» داخل التطبيق. أي تغيير في ملفات
النطاق يوجب تحديث اللقطة:

```bash
npm run guardrails:update   # يحدّث اللقطة (وبعده commit)
npm run guardrails:check    # التحقق نفسه الذي يعمل في الـ CI
npm run guardrails          # تقرير فقط على الشاشة دون كتابة
```

---

## إزاي تشغّل نفس الفحوصات محلياً؟

```bash
npm run verify
```

ده بيشغّل: فحص الأنواع + الاختبارات + بوابة الحجم + بوابات المعمارية + البناء — بنفس ترتيب الـ CI.

---

## ميزانية السرعة (Speed Budget — k6 والحزمة)

الهدف المعتمد: **p95 < 200ms** لكل نقطة نهاية. قياس زمن الـ API يحتاج خدمة حقيقية
تعمل، لذلك **لا يُشغَّل في الـ CI** بل قبل أي إصدار على بيئة staging:

```bash
# مرة واحدة: ثبّت k6 من https://grafana.com/docs/k6/latest/set-up/install-k6/
npm run perf:api -- -e BASE_URL=http://localhost:5080 -e TOKEN=<access_token>
```

الملف: `perf/api-budget.js` — يفحص `GET /api/v1/generic/{module}.{entity}` بحدود
`http_req_duration p(95)<200` و`p(99)<400` و`http_req_failed rate<0.01`.

**ميزانية الحزمة (تعمل في الـ CI بعد البناء):**

```bash
npm run build && npm run budget:bundle
```

الحدود: حزمة الإقلاع `index-*.js` ≤ 160KB · CSS ≤ 30KB · أكبر حزمة مؤجّلة ≤ 160KB ·
إجمالي كل الحزم ≤ 1200KB (كلها gzip). تفصيل الأسباب: `scripts/check-bundle-budget.mjs`.

اختبار المتصفح لشاشة المعمارية: `e2e/architecture.spec.ts` (يحتاج
`npx playwright install chromium` ثم `npm run e2e`).

---

## بوابة حجم الملفات (Ratchet Guardrail)

المشروع فيه حالياً **58 ملفاً** يتجاوز 300 سطر. إصلاحها كلها مرة واحدة مستحيل،
لكن البوابة **تمنع تفاقم الوضع**:

1. أي ملف **جديد** يتجاوز 300 سطر ⇒ فشل فوري.
2. أي ملف في القائمة الأساسية **يكبر** أكثر ⇒ فشل.
3. أي ملف **يصغُر** تحت الحد ⇒ تنبيه (تقدر تحذفه من القائمة).

القائمة الأساسية في: `.github/file-size-baseline.json`

### إزاي أحدّث القائمة؟

```bash
# لو أضفت ملفاً مشروعاً يتجاوز الحد (نادراً ما يحصل)
node scripts/check-file-size.mjs --update
```

> ⚠️ **لا تستخدم `--update` لتجاوز فشل حقيقي.** البوابة موجودة لمنع ملفات 12 ألف سطر،
> وليس لتسجيلها بشكل رسمي.

---

## الملفات المرتبطة

| الملف | إيه فيه |
|---|---|
| `docs/ci/ci.yml` | قالب الـ CI (انسخه إلى `.github/workflows/`) |
| `.github/file-size-baseline.json` | القائمة الأساسية لحجم الملفات |
| `scripts/check-file-size.mjs` | سكربت بوابة الحجم (التطبيق الحالي) |
| `scripts/check-bundle-budget.mjs` | ميزانية حجم الحزمة (gzip) — بعد البناء |
| `scripts/architecture-guardrails.mjs` | سكربت بوابات المعمارية الجديدة |
| `scripts/guardrail-invariants.mjs` | جدول الثوابت المعمارية المقيسة |
| `src/services/architectureGuardrails.ts` | منطق تقييم البوابات (يُستخدم في الشاشة أيضاً) |
| `src/data/architecture/guardrailsSnapshot.ts` | لقطة القياس المولَّدة من المستودع |
| `perf/api-budget.js` | ميزانية السرعة (k6) — p95 < 200ms |
| `e2e/architecture.spec.ts` | اختبار متصفح لشاشة معمارية المنظومة الجديدة |
| `vitest.config.ts` | إعداد الاختبارات |
| `src/utils/__tests__/` | الاختبارات الحالية |
