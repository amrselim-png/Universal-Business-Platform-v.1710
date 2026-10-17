# تشغيل ERP NextGen محلياً على جهازك — دليل خطوة بخطوة

> **الهدف:** إنشاء قاعدة البيانات، مشاهدة الجداول، وتشغيل كود الـ Backend من داخل Visual Studio 2026.

---

## أولاً: مهم جداً — افهم الوضع الحالي

المستودع `amrselim-png/erp-nextgen` **لا يحتوي على كود .NET حقيقي**.
كل كود الـ C# الموجود فيه هو **نصوص معروضة على الشاشة** داخل ملفات TypeScript
(`src/data/backendCodebase.ts`)، ولا يمكن فتحه في Visual Studio ولا تشغيله.

وكذلك ملفات الـ SQL موجودة كنصوص داخل `src/data/databaseMigrations.ts`.

**لذلك قمت بأمرين:**

1. **استخراج** ملفات الـ SQL الحقيقية من الـ Workbench إلى ملفات `.sql` قابلة للتشغيل.
2. **بناء** مشروع .NET 10 كامل وقابل للتشغيل والبناء، يعتمد على نفس المعمارية
   (Generic Data API + RLS + Action Registry + Optimistic Concurrency + YARP).

النتيجة في هذا المجلد `erp-nextgen-local/`:

```
erp-nextgen-local/
├── README-SETUP-AR.md          ← هذا الدليل
├── docker-compose.yml          ← PostgreSQL + pgAdmin جاهزين بأمر واحد
├── db/
│   ├── migrations/             ← 10 ملفات SQL جاهزة للتشغيل (مصحّحة)
│   ├── migrations-original/    ← الـ 7 ملفات الأصلية كما وردت في الـ Workbench
│   ├── apply-migrations.ps1    ← سكربت تطبيق تلقائي (Windows)
│   ├── apply-migrations.sh     ← سكربت تطبيق تلقائي (Linux/macOS)
│   └── verify.sql              ← استعلامات لعرض الجداول والتحقق
├── dotnet/
│   ├── Erp.sln                 ← افتح هذا الملف في Visual Studio 2026
│   └── src/
│       ├── Erp.Common/         ← الـ Metadata Registry + فلتر الصلاحيات
│       ├── Erp.Api/            ← الـ API الأساسي (Auth + Generic Data + System)
│       └── Erp.Gateway/        ← YARP Reverse Proxy
└── reference-csharp/           ← ملفات الـ C# الأصلية من الـ Workbench (للمقارنة)
```

---

## ثانياً: المتطلبات

| المتطلب | الإصدار | رابط التحميل |
|---|---|---|
| **.NET SDK** | **10.0** أو أحدث | https://dotnet.microsoft.com/download |
| **PostgreSQL** | 15 أو أحدث (يفضّل 17) | https://www.postgresql.org/download/windows/ |
| **Visual Studio** | 2026 (أو 2022 17.12+) | https://visualstudio.microsoft.com/ |

**بديل عن تثبيت PostgreSQL يدوياً:** Docker Desktop + `docker-compose.yml` الموجود هنا.

### تأكد من التثبيت

افتح **PowerShell** واكتب:

```powershell
dotnet --version
# يجب أن يظهر: 10.0.x
```

```powershell
psql --version
# يجب أن يظهر: psql (PostgreSQL) 17.x
# لو ظهر "not recognized" أضف المسار يدوياً:
$env:Path += ";C:\Program Files\PostgreSQL\17\bin"
```

> **في Visual Studio 2026:** تأكد أثناء التثبيت من تحديد
> **"ASP.NET and web development"** ضمن الـ Workloads.

---

## ثالثاً: الخطوة 1 — تحضير قاعدة البيانات

### الخيار (أ) — Docker (الأسهل، موصى به)

من داخل مجلد `erp-nextgen-local`:

```powershell
docker compose up -d
docker compose ps
```

سيكون لديك:
- **PostgreSQL** على `localhost:5432` — المستخدم `postgres` / كلمة المرور `postgres` / قاعدة `erp`
- **pgAdmin** على http://localhost:8080 — البريد `admin@demo.local` / كلمة المرور `admin`

### الخيار (ب) — PostgreSQL مثبّت على Windows

1. شغّل مثبّت PostgreSQL واختر كلمة مرور لمستخدم `postgres` (سنستخدم `postgres` في الأمثلة).
2. افتح **SQL Shell (psql)** أو **pgAdmin** وأنشئ قاعدة البيانات:

```sql
CREATE DATABASE erp;
```

---

## رابعاً: الخطوة 2 — تطبيق الـ Migrations

من داخل مجلد `erp-nextgen-local`:

```powershell
powershell -ExecutionPolicy Bypass -File db\apply-migrations.ps1
```

الناتج المتوقع:

```
=== ERP NextGen — تطبيق الـ Migrations ===
  0001_extensions_and_roles.sql                       OK
  0002_core_functions_and_triggers.sql                OK
  0003_core_tenants_and_identity.sql                  OK
  0004_core_metadata_and_actions.sql                  OK
  0005_core_audit_outbox_infrastructure.sql           OK
  0006_core_rls_policies.sql                          OK
  0007_seed_initial_actions_and_roles.sql             OK
  0008_performance_indexes.sql                        OK
  0009_audit_log_partition_safety.sql                 OK
  0010_demo_seed.sql                                  OK

النتيجة: 10 ناجح / 0 فاشل
```

**لو كلمة مرور `postgres` مختلفة عندك:**

```powershell
.\db\apply-migrations.ps1 -DbPassword "كلمة_المرور_بتاعتك"
```

---

## خامساً: الخطوة 3 — إزاي تشوف الجداول

### الطريقة 1 — pgAdmin (الأوضح بصرياً)

1. افتح http://localhost:8080 (لو استخدمت Docker) أو pgAdmin من قائمة ابدأ.
2. أضف Server جديد:
   - **Host:** `localhost`  **Port:** `5432`
   - **Username:** `postgres`  **Password:** `postgres`
3. من الشجرة: `Databases → erp → Schemas → core → Tables`

هتلاقي **25 جدول**، منها:

| الجدول | الوصف |
|---|---|
| `core.tenants` | المنشآت (المستأجرون) |
| `core.branches` | الفروع |
| `core.users` | المستخدمون |
| `core.roles` / `core.user_roles` | الأدوار وربطها بالمستخدمين |
| `core.permissions` | مصفوفة الصلاحيات |
| `core.actions` | سجل الأفعال (كل زر في النظام) |
| `core.entities` / `core.entity_fields` | محرك الـ Metadata |
| `core.screens` | تعريف الشاشات |
| `core.audit_log` | سجل التدقيق (مقسّم شهرياً) |
| `core.outbox_events` | أحداث الـ Outbox |
| `core.audit_log_2026_10` … | بارتشنات سجل التدقيق |

### الطريقة 2 — من سطر الأوامر (كل الجداول بضغطة واحدة)

```powershell
psql -h localhost -U postgres -d erp -f db\verify.sql
```

السكربت ده بيطبع 10 تقارير: كل الجداول، عدد الصفوف، حالة الـ RLS،
سياسات العزل، أدوار قاعدة البيانات، الموديولات، عدد الأفعال،
بيانات المستخدم التجريبي، وآخر 10 حركات في سجل التدقيق.

### الطريقة 3 — استعلامات سريعة

```sql
-- كل الجداول
SELECT table_schema, table_name FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1,2;

-- كل الأعمدة في جدول معيّن
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_schema = 'core' AND table_name = 'branches' ORDER BY ordinal_position;

-- هل الـ RLS مفعّل فعلاً؟
SELECT tablename, rowsecurity, forcerowsecurity FROM pg_tables WHERE schemaname = 'core';
```

---

## سادساً: الخطوة 4 — تشغيل الكود في Visual Studio 2026

### 1. افتح المشروع

- افتح Visual Studio 2026
- **File → Open → Project/Solution**
- اختر: `erp-nextgen-local\dotnet\Erp.sln`

### 2. اختر مشروع التشغيل

في **Solution Explorer**، اضغط كليك يمين على مشروع **`Erp.Api`**
ثم **Set as Startup Project**.

### 3. شغّل

اضغط **F5** (أو زر التشغيل الأخضر ▶).

هيفتح المتصفح تلقائياً على: **http://localhost:5080**

هتشوف صفحة فيها كل نقاط النهاية المتاحة.

### 4. تأكد إن الـ API متصل بقاعدة البيانات

في المتصفح افتح: **http://localhost:5080/api/v1/system/health**

```json
{
  "status": "healthy",
  "database": "connected",
  "postgresVersion": "PostgreSQL",
  "coreTables": 25
}
```

لو ظهر `"status": "unhealthy"` → راجع قسم حل المشاكل تحت.

### 5. اختبار نقاط النهاية من داخل Visual Studio

افتح الملف: `dotnet\src\Erp.Api\Erp.Api.http`

فيه 10 طلبات جاهزة. اضغط **Send Request** فوق أي طلب:

1. فحص الاتصال
2. عرض كل الجداول
3. تسجيل الدخول (بيحفظ التوكن تلقائياً)
4. قراءة الفروع / المستخدمين
5. تحديث سجل (Optimistic Concurrency)
6. اختبار رفض الصلاحيات

> **ملاحظة:** مشروع `Erp.Gateway` (YARP) بيشتغل على `http://localhost:5090`
> ويوجّه الطلبات تلقائياً للـ API على `5080`. شغّل الـ API أولاً.

### 6. تشغيل الـ Gateway (اختياري)

- كليك يمين على Solution → **Configure Startup Projects**
- اختر **Multiple startup projects**
- حدّد `Erp.Api` و `Erp.Gateway` بـ **Start**
- اضغط F5

---

## سابعاً: الخطوة 5 — تجربة كل شيء (بيانات الدخول التجريبية)

| البند | القيمة |
|---|---|
| كود المنشأة | `DEMO` |
| البريد | `admin@demo.local` |
| كلمة المرور | `Admin@123` |

### 1. تسجيل الدخول

```powershell
curl -X POST http://localhost:5080/api/v1/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"tenantCode\":\"DEMO\",\"email\":\"admin@demo.local\",\"password\":\"Admin@123\"}'
```

الرد: `token` (صالح 15 دقيقة) + عدد الصلاحيات (62).

### 2. قراءة الفروع (يحتاج التوكن)

```powershell
$token = (Invoke-RestMethod -Uri http://localhost:5080/api/v1/auth/login `
  -Method Post -ContentType 'application/json' `
  -Body '{"tenantCode":"DEMO","email":"admin@demo.local","password":"Admin@123"}').token

Invoke-RestMethod -Uri "http://localhost:5080/api/v1/generic/core.branch" `
  -Headers @{ Authorization = "Bearer $token" }
```

### 3. تحديث سجل (Optimistic Concurrency)

```powershell
Invoke-RestMethod -Uri "http://localhost:5080/api/v1/generic/core.branch" `
  -Method Put -ContentType 'application/json' `
  -Headers @{ Authorization = "Bearer $token" } `
  -Body '{"id":"44444444-4444-4444-4444-444444444444","version":1,"name":"فرع جديد"}'
```

**لو أعدت نفس الطلب بنفس `version` مرة ثانية → سيرجع `409 Conflict`.**
ده بالضبط السلوك الصحيح: حد تاني عدّل السجل قبلك.

### النتائج التي تحققت منها فعلياً

| الاختبار | النتيجة |
|---|---|
| تطبيق 10 migrations | ✅ 10/10 |
| عدد الجداول | ✅ 25 |
| الأفعال المسجّلة | ✅ 62 |
| عزل المستأجرين (RLS) | ✅ بمعرّف صحيح = صف، بمعرّف غلط = صفر صفوف |
| تسجيل الدخول | ✅ 200 + 62 صلاحية |
| قراءة Generic API | ✅ 200 |
| تحديث + زيادة الإصدار | ✅ version 2 → 3 |
| رفض الإصدار القديم | ✅ 409 Conflict |
| سجل التدقيق (Triggers) | ✅ يُسجّل INSERT/UPDATE تلقائياً |
| بدون توكن | ✅ 401 |

---

## ثامناً: حل المشاكل الشائعة

### «لم يتم العثور على psql.exe»
```powershell
$env:Path += ";C:\Program Files\PostgreSQL\17\bin"
```

### `status: unhealthy` في `/system/health`
1. تأكد إن PostgreSQL شغال:
   ```powershell
   Get-Service postgresql*
   # أو
   docker compose ps
   ```
2. تأكد إن الـ migrations اتطبقت: `psql -U postgres -d erp -c "\dt core.*"`
3. راجع `ConnectionStrings:Postgres` في
   `dotnet\src\Erp.Api\appsettings.json`

### `password authentication failed for user "erp_app"`
الـ migration بينشئ `erp_app` بكلمة مرور `APP_SECURE_PASSWORD`.
لو غيّرتها في `0001_extensions_and_roles.sql` لازم تحدّث `appsettings.json` كذلك.

### `permission denied for table ...`
شغّل `0001_extensions_and_roles.sql` مرة أخرى — فيه إصلاح الصلاحيات الافتراضية.

### `too many clients already` / استهلاك الاتصالات
`ConnectionStrings:Postgres` في `appsettings.json` مضبوط بحد اتصالات صريح:
`Pooling=true;Minimum Pool Size=2;Maximum Pool Size=25;Timeout=5`.
هذا كافٍ لأقل من 100 مستخدم متزامن؛ لو زاد العدد أو صار عندك أكثر من نسخة من
الـ API، ضع **PgBouncer** أمام PostgreSQL (وضع `transaction`) ووجّه الاتصال إليه
بدل المنفذ `5432` مباشرة.

### `The type or namespace name 'X' could not be found` عند البناء
```powershell
dotnet restore Erp.sln
dotnet build Erp.sln
```

### الـ API بيشتغل بس كل الطلبات بترجع 403
تأكد إنك طبقت `0010_demo_seed.sql` — هو اللي بيمنح دور `admin` كل الصلاحيات.
النظام بيشتغل بقاعدة **Default-Deny**: مفيش صف صلاحية = مفيش وصول.

---

## تاسعاً: 4 مشاكل حقيقية كانت في البلوبرنت وتم إصلاحها

اكتشفتها **بتشغيل الـ SQL فعلياً على PostgreSQL حقيقي**، مش بقراءة الكود:

| # | المشكلة | الأثر | الإصلاح |
|---|---|---|---|
| 1 | `GRANT ... ON ALL TABLES` في `0001` يُنفَّذ **قبل** إنشاء الجداول | دور `erp_app` كان **بدون أي صلاحية** (0 جدول) — التطبيق كله مش هيقرأ حاجة | إضافة `ALTER DEFAULT PRIVILEGES` |
| 2 | `PRIMARY KEY (..., branch_id)` على عمود `NULLable` | PostgreSQL بيجعل أعمدة الـ PK إجبارية → **مستحيل** منح مستخدم دوراً على مستوى المنشأة كلها | PK بديل + فهرس فريد مع `COALESCE(branch_id, ...)` |
| 3 | `0007` فيه `('report.run','reporting',...)` والموديول `reporting` **غير موجود** في الـ Seed | فشل الـ FK → **صفر أفعال** اتحفظت (فشل الـ INSERT كله) | إضافة موديول `reporting` |
| 4 | `'generic.record.read'` غير مسجّل في الـ Action Registry | مع قاعدة Default-Deny → **كل طلب GET** كان هيرجع 403 حتى للمدير | تسجيل الفعل |

**كذلك أضفت:**
- `0008_performance_indexes.sql` — فهارس Keyset Pagination (`tenant_id, created_at DESC, id DESC`). المخطط الأصلي كان فيه **4 فهارس فقط لـ 23 جدول**.
- `0009_audit_log_partition_safety.sql` — بارتشن `DEFAULT` + دالة توليد بارتشنات شهرية. المخطط الأصلي كان فيه بارتشنين فقط لشهرين، و**أي عملية بعد 2026-12-01 كانت هتفشل تماماً**.
- `0010_demo_seed.sql` — منشأة وفروع ومستخدم ودور وصلاحيات للتجربة.

**ملفات الـ Workbench الأصلية محفوظة كما هي في `db/migrations-original/`** للمقارنة.

---

## عاشراً: الخطوات التالية المقترحة

1. **فعّل CI** — بوابات الجودة المقترحة في الـ Workbench (لاحظ إن حد الـ 300 سطر
   بيفشل على المستودع نفسه: 18 ملف مخالف).
2. **أضف اختبارات** — أهم اختبار مطلوب: **اختبار عزل المستأجرين** (Tenant A ميشوفش بيانات Tenant B).
3. **أكمل الـ Vertical Slices** — خد شاشة واحدة (المخازن مثلاً) من الـ DB للـ UI بالكامل.
4. **SignalR** — الكود موجود في `reference-csharp/Services/Realtime/PostgresRealtimeBridge.cs`
   ويحتاج `ErpNotificationHub` + مرجع من `core.realtime_notify_func()`.
5. **راجع قرار الاتساق المحاسبي** — راجع قسم 5.1 في `ERP_NEXTGEN_REVIEW.md`:
   البيع والمخزون والقيود في **نفس قاعدة البيانات**، فلا مبرر لتأجيل القيد المحاسبي.


