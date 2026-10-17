# ابدأ من هنا — تشغيل التطبيق محلياً خطوة خطوة

> دليل عملي بالضبط: **تفتح برنامج إيه → تكتب إيه → المفروض تشوف إيه**.
> الوقت المتوقع: 20–30 دقيقة (أول مرة).

---

## 🔧 الخطوة 0 — نزّل الملفات على جهازك

**افتح:** `Command Prompt` أو `PowerShell` (اكتب في قائمة ابدأ: `powershell`)

**اكتب:**

```powershell
cd $HOME\Desktop
git clone -b cline/81q8nafr https://github.com/amrselimali/Universal-Business-Platform.git
cd Universal-Business-Platform\erp-nextgen-local
```

**المفروض تشوف:** مجلد جديد على سطح المكتب اسمه `Universal-Business-Platform`
وجواه مجلد اسمه `erp-nextgen-local`.

> **ملحوظة:** لو ظهرلك خطأ `git is not recognized` → نزّل Git من https://git-scm.com/download/win
> أو حمّل المشروع كـ ZIP من GitHub وفك الضغط واحتفظ بمجلد `erp-nextgen-local`.

**من هنا ورايح، كل الأوامر بتتكتب وأنت جوه مجلد `erp-nextgen-local`.**

---

## 🔧 الخطوة 1 — ثبّت برنامجين

### برنامج 1: .NET 10 SDK (لتشغيل الكود)

1. افتح المتصفح → https://dotnet.microsoft.com/download/dotnet/10.0
2. نزّل **SDK x64** وثبّته (Next → Next → Finish)

**اتأكد إنه اتثبت:** افتح PowerShell جديد واكتب:

```powershell
dotnet --version
```

**المفروض تشوف:** رقم زي `10.0.402`

---

### برنامج 2: Visual Studio 2026 (لكتابة وتشغيل الكود)

1. افتح المتصفح → https://visualstudio.microsoft.com/
2. نزّل **Visual Studio 2026 Community** (مجاني)
3. **⚠️ مهم جداً أثناء التثبيت:** في شاشة الـ Workloads، علّم على
   ☑️ **ASP.NET and web development**
4. اضغط Install واستنى (بياخد وقت — 20 دقيقة تقريباً)

> لو عندك **Visual Studio 2022 (17.12 أو أحدث)** بيشتغل برضه.

---

### برنامج 3: Docker Desktop (لقاعدة البيانات — الأسهل)

1. افتح المتصفح → https://www.docker.com/products/docker-desktop/
2. نزّله وثبّته
3. **افتح Docker Desktop** وسيبه شغال (أيقونة الحوت 🐳 لازم تبقى خضراء)

> **مش عايز Docker؟** مفيش مشكلة — فيه مسار بديل في الخطوة 2 (ب).

---

## 🗄️ الخطوة 2 — شغّل قاعدة البيانات

### المسار (أ) — Docker Desktop ⭐ الموصى به

**افتح:** PowerShell (جديد)، واكتب:

```powershell
cd $HOME\Desktop\Universal-Business-Platform\erp-nextgen-local
docker compose up -d
```

**استنى 20 ثانية**، وبعدين اتأكد:

```powershell
docker compose ps
```

**المفروض تشوف:** سطرين، حالتهم `Up (healthy)` — واحدة `postgres` وواحدة `pgadmin`.

كده عندك:
- **قاعدة بيانات** على `localhost:5432` — المستخدم `postgres` / كلمة المرور `postgres`
- **واجهة إدارة** على http://localhost:8080

---

### المسار (ب) — PostgreSQL مثبّت على Windows (بدون Docker)

1. افتح المتصفح → https://www.postgresql.org/download/windows/
2. نزّل **PostgreSQL 17** وثبّته
3. **⚠️ مهم:** لما يطلب منك كلمة مرور لمستخدم `postgres`، اكتب: `postgres`
   (احفظها، هنستخدمها بعدين)
4. سيب الـ Port على `5432`
5. بعد التثبيت، افتح **pgAdmin** (اللي اتثبت معاه) → اتصّل بالسيرفر
6. كليك يمين على **Databases** → **Create** → **Database**
   - Name: `erp`
   - اضغط **Save**

---

## 📥 الخطوة 3 — اعمل الجداول (Migrations)

**افتح:** PowerShell، واكتب:

```powershell
cd $HOME\Desktop\Universal-Business-Platform\erp-nextgen-local
powershell -ExecutionPolicy Bypass -File db\apply-migrations.ps1
```

**المفروض تشوف:**

```
=== ERP NextGen — تطبيق الـ Migrations ===
psql: C:\Program Files\PostgreSQL\17\bin\psql.exe
قاعدة البيانات 'erp' موجودة بالفعل.
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

### لو ظهر خطأ `psql.exe not found`

اكتب السطر ده الأول وبعدين أعد الأمر:

```powershell
$env:Path += ";C:\Program Files\PostgreSQL\17\bin"
```

### لو كلمة مرور postgres مختلفة عندك

```powershell
.\db\apply-migrations.ps1 -DbPassword "كلمة_المرور_بتاعتك"
```

---

## 👀 الخطوة 4 — شوف الجداول

### الطريقة الأسهل: pgAdmin

1. **افتح المتصفح** → http://localhost:8080
2. ادخل:
   - **Email:** `admin@demo.local`
   - **Password:** `admin`
3. من القائمة الشمال: كليك يمين على **Servers** → **Register** → **Server**
   - **General → Name:** `erp-local`
   - **Connection → Host:** `localhost`  **Port:** `5432`
   - **Username:** `postgres`  **Password:** `postgres`
   - اضغط **Save**
4. من الشجرة على الشمال افتح:
   **Servers → erp-local → Databases → erp → Schemas → core → Tables**

**المفروض تشوف 25 جدول** — منهم:
`tenants` (المنشآت) · `branches` (الفروع) · `users` (المستخدمين) ·
`roles` · `permissions` (الصلاحيات) · `actions` (كل أزرار النظام) ·
`entities` / `entity_fields` (محرك الشاشات) · `audit_log` (سجل التدقيق)

### طريقة أسرع: من سطر الأوامر

```powershell
psql -h localhost -U postgres -d erp -f db\verify.sql
```
(كلمة المرور: `postgres`)

هيطبعلك 10 تقارير: كل الجداول، عدد الصفوف، حالة الـ RLS، الموديولات، المستخدم التجريبي…

---

## ▶️ الخطوة 5 — شغّل الكود من Visual Studio 2026

### 5.1 افتح المشروع

1. **افتح برنامج Visual Studio 2026** (من قائمة ابدأ)
2. في شاشة البداية اضغط **Open a project or solution**
3. روح لـ: `Desktop → Universal-Business-Platform → erp-nextgen-local → dotnet`
4. اختار ملف **`Erp.sln`** واضغط **Open**

**استنى شوية** (أول مرة بيعمل restore للمكتبات — دقيقة أو اتنين).

**المفروض تشوف:** على الشمال في **Solution Explorer** 3 مشاريع:
`Erp.Api` · `Erp.Common` · `Erp.Gateway`

### 5.2 اختار المشروع اللي هيشتغل

في **Solution Explorer**:
- كليك يمين على **`Erp.Api`**
- اضغط **Set as Startup Project**

**المفروض تشوف:** اسم `Erp.Api` بقى **بالخط العريض** (Bold).

### 5.3 شغّل 🚀

اضغط زر **▶ Erp.Api** الأخضر اللي فوق (أو اضغط **F5**).

**استنى 10–15 ثانية** — هيفتحلك المتصفح تلقائياً على:

## 👉 http://localhost:5080

**المفروض تشوف:** صفحة غامقة فيها جدول بنقاط النهاية المتاحة.

---

## ✅ الخطوة 6 — اتأكد إن كل حاجة شغالة

في المتصفح، غيّر العنوان لـ:

## 👉 http://localhost:5080/api/v1/system/health

**المفروض تشوف:**

```json
{
  "status": "healthy",
  "database": "connected",
  "postgresVersion": "PostgreSQL",
  "coreTables": 25
}
```

✅ **لو ظهر كده — مبروك، كل حاجة شغالة!**

❌ **لو ظهر `"status": "unhealthy"`** → قاعدة البيانات مش متصلة:
- اتأكد إن Docker شغال (`docker compose ps`) أو إن خدمة PostgreSQL شغالة
- اتأكد إنك طبّقت الـ Migrations في الخطوة 3

---

## 🧪 الخطوة 7 — جرّب بنفسك (من داخل Visual Studio)

1. في **Solution Explorer** افتح: `Erp.Api → Erp.Api.http`
2. هتلاقي 10 طلبات جاهزة. **اضغط على الرابط الصغير "Send Request"** اللي فوق أي طلب.

**ابدأ بالترتيب ده:**

| # | الطلب | المفروض تشوف |
|---|---|---|
| 1 | فحص الاتصال | `"status": "healthy"` |
| 2 | عرض كل الجداول | 25 جدول |
| 5 | **تسجيل الدخول** | `token` + `permissionCount: 62` |
| 6 | قراءة الفروع | بيانات فرع "الفرع الرئيسي - القاهرة" |
| 8 | تحديث فرع | `"success": true, "version": 2` |
| 8 (تاني) | نفس الطلب تاني | **409 Conflict** ← ده صح! حد تاني عدّل قبلك |

> **مهم:** لازم تنفّذ طلب **تسجيل الدخول (#5)** الأول، لأن باقي الطلبات
> بتستخدم التوكن اللي بيترجع منه تلقائياً.

### بيانات الدخول

| البند | القيمة |
|---|---|
| كود المنشأة | `DEMO` |
| البريد | `admin@demo.local` |
| كلمة المرور | `Admin@123` |

---

## 🛑 إزاي توقّف كل حاجة

1. **في Visual Studio:** اضغط **Shift + F5** (أو المربع الأحمر ⏹)
2. **في PowerShell:**

```powershell
cd $HOME\Desktop\Universal-Business-Platform\erp-nextgen-local
docker compose down
```

> `docker compose down` بيسيب البيانات. لو عايز **تمسح كل حاجة وتبدأ من الأول**:
> `docker compose down -v` وبعدين اعد الخطوة 2 و3.

---

## ❓ مشاكل شائعة وحلولها

### «مفيش حاجة ظهرت على localhost:5080»
اتأكد إن الـ API شغال: في Visual Studio هتلاقي نافذة **Output** بتقول
`Now listening on: http://localhost:5080`.

### «الـ Port 5432 مستخدم بالفعل»
عندك PostgreSQL تاني شغال. وقّف خدمة PostgreSQL من **Services**، أو غيّر البورت في
`docker-compose.yml` (مثلاً `5433:5432`) وبعدين حدّث `appsettings.json`.

### «كل الطلبات بترجع 403»
انت نسيت تطبّق `0010_demo_seed.sql`. أعد الخطوة 3.
(النظام شغال بقاعدة **Default-Deny**: مفيش صلاحية مسجّلة = مفيش وصول)

### «Build failed» أول ما فتحت
اضغط كليك يمين على **Solution** → **Restore NuGet Packages** → وبعدين **Rebuild Solution**.

### «بتفتح صفحة بيضاء أو 404»
اتأكد إنك واقف على **`Erp.Api`** كـ Startup Project، وإن المتصفح مفتوح على
`http://localhost:5080` **مش** `https`.

---

## 📋 ملخص سريع (لو نسيت)

```powershell
# 1. شغّل الداتابيز
cd $HOME\Desktop\Universal-Business-Platform\erp-nextgen-local
docker compose up -d

# 2. اعمل الجداول
powershell -ExecutionPolicy Bypass -File db\apply-migrations.ps1

# 3. شوف الجداول
psql -h localhost -U postgres -d erp -f db\verify.sql

# 4. افتح Visual Studio 2026 → Erp.sln → Set Erp.Api as Startup → F5
# 5. المتصفح: http://localhost:5080/api/v1/system/health
```

---

## 📚 ملفات مفيدة

| الملف | إيه فيه |
|---|---|
| `START-HERE-AR.md` | الدليل ده (الأسهل) |
| `README-SETUP-AR.md` | دليل مفصل أكتر + شرح المشاكل اللي اتصلحت |
| `db/verify.sql` | استعلامات عرض الجداول |
| `dotnet/src/Erp.Api/Erp.Api.http` | 10 طلبات جاهزة للاختبار |
| `db/migrations/` | ملفات الـ SQL (10 ملفات) |
| `db/migrations-original/` | ملفات الـ SQL الأصلية من الـ Workbench |

