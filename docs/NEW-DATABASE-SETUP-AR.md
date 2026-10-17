# 🗄️ إنشاء قاعدة بيانات جديدة وربطها بالتطبيق

> **الحالة:** قاعدة بياناتك وصلت للحد الأقصى ومش قادر تتصل بيها.
> **الحل:** قاعدة جديدة + **الهياكل فقط بدون داتا** + الربط من VS.

---

## 📄 الملف الجاهز

**`scripts/neon_full_schema.sql`** — ملف واحد فيه كل الهياكل:

| المحتوى | العدد |
|---|---|
| جداول | **28** |
| دوال | **10** |
| فهارس | **75** |
| سياسات أمان (RLS) | **19** |
| **بيانات مستخدم** | **صفر** ✅ |
| إعدادات تعريفية | 22 شاشة · 44 فعل · 6 كيانات · 32 حقل · 5 عملات |

**مُختبر فعليًا على قاعدة بيانات نظيفة:**
```
✅ نجح في 92 مللي ثانية
✅ متكرر بأمان (تشغيله مرتين لا يضر)
✅ صفر بيانات مستخدم
✅ المميزات الجديدة تعمل: version · تسلسل INV-1/INV-2 · سياسة التنظيف
```

---

## 1️⃣ اعمل قاعدة بيانات جديدة

### الخيار (أ) — Neon جديد (سحابي مجاني) ⭐

1. افتح: **https://console.neon.tech**
2. اضغط **New Project**
   - **Name:** `universal-erp`
   - **Region:** **AWS eu-central-1 (Frankfurt)** ← الأقرب لمصر (45ms)
   - **Postgres version:** 17
3. اضغط **Create project**
4. من الشاشة اللي هتظهر، انسخ **Connection string**:
   ```
   postgresql://user:password@ep-xxxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```

> 💡 **مهم:** تأكد إن **Region = Frankfurt** أو **Milan** — مش الخليج.
> (تحليل مسارات الكابلات موجود في `docs/PHASE3-4-NOTES.md`)

### الخيار (ب) — Postgres محلي (Docker)

```powershell
docker compose -f erp-nextgen-local\docker-compose.yml up -d
```
رابط الاتصال:
```
postgresql://postgres:postgres@localhost:5432/erp
```

---

## 2️⃣ شغّل الهياكل

### الطريقة 1 — من VS Code / Terminal (موصى بها) ⭐

```powershell
cd $HOME\Desktop\Universal-Business-Platform
$env:NEON_DATABASE_URL = "postgresql://ضع-الرابط-الجديد-هنا"
node scripts\apply-neon-migrations.mjs
```

**المفروض تشوف:**
```
✅ متصل بقاعدة البيانات (neon).

  scripts/neon_schema_migrations.sql            ✅ (204 سطر)
  scripts/neon_security_rls.sql                 ✅ (62 سطر)
  scripts/neon_accounting_functions.sql         ✅ (126 سطر)
  scripts/neon_optimistic_concurrency.sql       ✅ (100 سطر)
  scripts/neon_metadata_engine.sql              ✅ (88 سطر)
  scripts/neon_metadata_seed.sql                ✅ (173 سطر)
  scripts/neon_phase4_infrastructure.sql        ✅ (102 سطر)
  scripts/neon_phase4_missing_tables.sql        ✅ (158 سطر)
  scripts/neon_retention_policy.sql             ✅ (135 سطر)

  النتيجة: 9 ناجح / 0 فاشل
  🎉 كل شيء جاهز
```

### الطريقة 2 — ملف واحد من Neon Console

1. افتح `scripts/neon_full_schema.sql`
2. **Ctrl + A** ثم **Ctrl + C** (انسخ الملف كاملاً)
3. Neon Console → **SQL Editor** → الصق → **Run**

### الطريقة 3 — psql

```powershell
psql "postgresql://ضع-الرابط" -f scripts\neon_full_schema.sql
```

---

## 3️⃣ اربط التطبيق من VS

### أ) شغّل التطبيق

في **Visual Studio** أو Terminal:

```powershell
cd $HOME\Desktop\Universal-Business-Platform
npm install
npm run dev
```

افتح: **http://localhost:3000** · ادخل بـ `admin` / `admin123`

### ب) وصّل قاعدة البيانات من داخل التطبيق

1. من **الشريط الجانبي** → قسم **الرقابة والشركات والإعدادات**
2. اضغط **«قاعدة بيانات Neon»** (Neon Hub)
3. في خانة **رابط الاتصال** (Placeholder: `postgres://user:pass@ep-....neon.tech/neondb?sslmode=require`)
   الصق الرابط الجديد
4. اضغط زر **«اختبار وحفظ الرابط»** → لازم يقول ✅
5. اضغط **«🚀 رفع ومزامنة كافة البيانات إلى Neon الآن»**

> ⚠️ **مهم:** التطبيق **يرفض** الروابط الوهمية تلقائياً (اللي فيها `ep-cool-snowflake-12345`
> أو `user:pass@`) — فلازم رابط حقيقي.
>
> 📌 الرابط يُحفظ في `localStorage['erp_neon_cfg']` — تقدر تتأكد منه من Console (F12).

**بعد كده:**
- ✅ هتلاقي جدول `app_records` اتعبّى
- ✅ **استوديو الشاشات** هيشتغل (مش هيقول «غير مهيأ»)

### ج) اتأكد إن كل حاجة شغالة

في المتصفح افتح **Console (F12)** واكتب:

```javascript
// 1) تأكيد الرابط
localStorage.getItem('erp_neon_cfg')

// 2) تأكيد محرك الشاشات
JSON.parse(localStorage.getItem('erp_metadata_registry'))
```

لازم تشوف الرابط، والـ registry فيه **22 شاشة** و**44 فعل**.

---

## 4️⃣ لو عايز تنسخ **الهياكل فقط** من قاعدة بياناتك القديمة

لو قدرت تتصل بقاعدة بياناتك القديمة ولو للحظة:

### باستخدام pg_dump (الأنضف)

```powershell
# الهياكل فقط — بلا أي بيانات
pg_dump "postgresql://رابط-القاعدة-القديمة" --schema-only --no-owner --no-privileges -f old-schema.sql
```

### ثم شغّله على القاعدة الجديدة

```powershell
psql "postgresql://رابط-القاعدة-الجديدة" -f old-schema.sql
```

> ⚠️ **ملاحظة:** `--schema-only` بتنسخ الجداول والفهارس والدوال، **بس مش** سياسات RLS في بعض الإصدارات. الأنضف إنك تستخدم `scripts/neon_full_schema.sql` الجاهز والمُختبر.

### لو عايز تنسخ **البيانات** كمان (بعد ما الهياكل تشتغل)

```powershell
# البيانات فقط
pg_dump "postgresql://القديمة" --data-only --table=app_records -f app-records-data.sql
psql "postgresql://الجديدة" -f app-records-data.sql
```

---

## 5️⃣ قائمة تحقق

- [ ] عملت مشروع Neon جديد في **Frankfurt**
- [ ] نسخت رابط الاتصال
- [ ] شغّلت `node scripts\apply-neon-migrations.mjs` → 9/9 ناجح
- [ ] `npm run dev` وفتح على `localhost:3000`
- [ ] دخلت بـ `admin` / `admin123`
- [ ] من **Neon Hub** → أدخلت الرابط → اختبار الاتصال ✅ → حفظ
- [ ] ضغطت **مزامنة**
- [ ] **استوديو الشاشات** بقى شغال (مش بيقول «غير مهيأ»)

---

## 🛠️ لو حصلت مشكلة

| المشكلة | الحل |
|---|---|
| `password authentication failed` | تأكد من الرابط كامل — فيه كلمة المرور |
| `SSL required` | ضيف `?sslmode=require` آخر الرابط |
| `relation already exists` | عادي — الملفات متكررة، تجاهل التحذير |
| الاستوديو لسه «غير مهيأ» | اضغط **تحديث** جواه، أو أعد تحميل الصفحة |
| `too many connections` | Neon المجاني بيدّي 100 اتصال — اقفل التابات القديمة |

---

## 📌 الخلاصة في 3 خطوات

```powershell
# 1) قاعدة جديدة من https://console.neon.tech (Frankfurt)

# 2) الهياكل
cd $HOME\Desktop\Universal-Business-Platform
$env:NEON_DATABASE_URL = "الرابط-الجديد"
node scripts\apply-neon-migrations.mjs

# 3) التطبيق
npm install && npm run dev
# ثم من التطبيق: Neon Hub → الرابط → اختبار → حفظ → مزامنة
```

---

## 📂 الملفات المرتبطة

| الملف | إيه فيه |
|---|---|
| **`scripts/neon_full_schema.sql`** | **الهيكل الكامل — ملف واحد (1240 سطر)** |
| `scripts/apply-neon-migrations.mjs` | مشغّل الـ Migrations + التحقق |
| `scripts/build-full-schema.mjs` | مولّد الملف الموحّد |
| `scripts/*.sql` | الملفات الفردية (المصدر) |
| `docs/TESTING-NOW-AR.md` | دليل تجربة التطبيق |
