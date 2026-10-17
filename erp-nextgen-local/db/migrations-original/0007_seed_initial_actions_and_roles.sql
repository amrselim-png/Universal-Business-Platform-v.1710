-- 0007_seed_initial_actions_and_roles.sql

-- 1. العملات الأساسية
INSERT INTO core.currencies (code, name, decimals) VALUES
  ('EGP', 'الجنيه المصري', 2),
  ('USD', 'الدولار الأمريكي', 2),
  ('EUR', 'اليورو الأوروبي', 2),
  ('SAR', 'الريال السعودي', 2)
ON CONFLICT (code) DO NOTHING;

-- 2. موديولات النظام
INSERT INTO core.modules (code, name, version, depends_on, description) VALUES
  ('core', 'النواة الإدارية والهوية', '1.0.0', '{}', 'المستخدمين والفروع والصلاحيات وسجل التدقيق'),
  ('inventory', 'المخازن والأصناف', '1.0.0', '{core}', 'إدارة الأصناف، أذون الإضافة والصرف، الجرد المستمر'),
  ('sales', 'المبيعات ونقاط البيع POS', '1.0.0', '{core, inventory}', 'الفواتير، الكاشير، الإيصال الإلكتروني ETA'),
  ('purchasing', 'المشتريات والموردين', '1.0.0', '{core, inventory}', 'أوامر الشراء، استلام البضائع، سداد الموردين'),
  ('accounting', 'الحسابات العامة GL', '1.0.0', '{core}', 'دليل الحسابات، قيود اليومية، ميزان المراجعة، الفترات'),
  ('hr', 'الموارد البشرية والمرتبات', '1.0.0', '{core}', 'الموظفين، الحضور، الإجازات، مسيرات الرواتب'),
  ('manufacturing', 'التصنيع والتشغيل BOM', '1.0.0', '{core, inventory}', 'شجرة المنتج BOM، أوامر الإنتاج، التكلفة الفعلية'),
  ('clinic', 'العيادات الطبية', '1.0.0', '{core}', 'سجلات المرضى، مواعيد الأطباء، الزيارات والفوترة')
ON CONFLICT (code) DO NOTHING;

-- 3. تسجيل الأفعال (Action Registry) بقاعدة module.entity.action
INSERT INTO core.actions (code, module_code, entity_code, label_ar, label_en, type, default_scope) VALUES
  -- 1. المصادقة والهوية (Auth)
  ('auth.login', 'core', NULL, 'تسجيل الدخول للنظام', 'Login', 'button', 'own'),
  ('auth.reset', 'core', NULL, 'استرجاع كلمة المرور', 'Password Reset', 'button', 'own'),
  ('auth.logout', 'core', NULL, 'تسجيل الخروج وإنهاء الجلسة', 'Logout', 'button', 'own'),

  -- 2. إعدادات المنشأة والفروع (Tenant & Branch)
  ('tenant.settings.save', 'core', NULL, 'حفظ إعدادات المنشأة والضرائب', 'Save Tenant Settings', 'button', 'all'),
  ('branch.create', 'core', NULL, 'إضافة فرع جديد', 'Create Branch', 'button', 'all'),

  -- 3. المستخدمون (Users)
  ('user.create', 'core', NULL, 'إنشاء موظف ومستخدم جديد', 'Create User', 'button', 'all'),
  ('user.toggle', 'core', NULL, 'تعطيل أو تفعيل المستخدم', 'Toggle User Active Status', 'button', 'all'),
  ('user.resetpw', 'core', NULL, 'توليد رابط إعادة تعيين كلمة المرور', 'Reset User Password', 'button', 'all'),
  ('user.assignrole', 'core', NULL, 'تعيين الأدوار والفروع للمستخدم', 'Assign User Roles', 'button', 'all'),

  -- 4. الأدوار والصلاحيات (Roles & Permissions)
  ('role.create', 'core', NULL, 'إنشاء أو نسخ دور جديد', 'Create or Clone Role', 'button', 'all'),
  ('role.permissions.save', 'core', NULL, 'حفظ مصفوفة الصلاحيات وبث NOTIFY', 'Save Permissions Matrix', 'button', 'all'),

  -- 5. مدير الموديولات (Modules)
  ('module.enable', 'core', NULL, 'تفعيل الموديول وفحص الاعتماديات', 'Enable Module', 'button', 'all'),
  ('module.disable', 'core', NULL, 'إيقاف الموديول مؤقتاً للـ Tenant', 'Disable Module', 'button', 'all'),

  -- 6. سجل التدقيق (Audit)
  ('audit.export', 'core', NULL, 'تصدير سجل التدقيق عبر Job خلفي', 'Export Audit Log', 'button', 'all'),

  -- 7. محرك الشاشات العام (Generic Screen Actions)
  ('generic.record.create', 'core', NULL, 'إضافة سجل جديد من الـ Metadata', 'Create Record', 'button', 'branch'),
  ('generic.record.save', 'core', NULL, 'حفظ السجل مع التحقق من الإصدار version', 'Save Record', 'button', 'branch'),
  ('generic.record.delete', 'core', NULL, 'حذف ناعم مع فحص الارتباطات', 'Soft Delete Record', 'button', 'branch'),
  ('generic.record.export', 'core', NULL, 'تصدير بيانات الجدول إلى Excel/CSV', 'Export Grid Data', 'button', 'branch'),
  ('generic.record.print', 'core', NULL, 'طباعة السجل الرسمي عبر Playwright PDF', 'Print Record PDF', 'button', 'branch'),

  -- 8. المخازن (Inventory)
  ('item.import', 'inventory', NULL, 'استيراد الأصناف دفعة واحدة من Excel', 'Batch Import Items', 'button', 'branch'),
  ('item.toggle', 'inventory', NULL, 'تعطيل أو تفعيل الصنف دون حذفه', 'Toggle Item Active', 'button', 'branch'),
  ('warehouse.create', 'inventory', NULL, 'إنشاء مخزن جديد تابع للفرع', 'Create Warehouse', 'button', 'branch'),
  ('stock.receive', 'inventory', NULL, 'إذن استلام بضاعة وإضافة مخزون', 'Receive Stock', 'button', 'branch'),
  ('stock.issue', 'inventory', NULL, 'إذن صرف مخزن ومنع الرصيد السالب', 'Issue Stock', 'button', 'branch'),
  ('stock.transfer', 'inventory', NULL, 'تحويل بضاعة بين مخزنين في Transaction واحدة', 'Transfer Stock', 'button', 'all'),
  ('stockcount.start', 'inventory', NULL, 'بدء جرد مخزني وتثبيت الدفتري', 'Start Stock Count', 'button', 'branch'),
  ('stockcount.approve', 'inventory', NULL, 'اعتماد الجرد وتوليد تسويات الفروق', 'Approve Stock Count', 'button', 'branch'),

  -- 9. المبيعات ونقاط البيع (Sales & POS)
  ('pos.discount', 'sales', NULL, 'منح خصم كاشير ضمن الحد المسموح', 'Apply POS Discount', 'button', 'branch'),
  ('pos.hold', 'sales', NULL, 'تعليق السلة أو استرجاعها', 'Hold or Retrieve Cart', 'button', 'branch'),
  ('pos.pay', 'sales', NULL, 'سداد الفاتورة وإرسال الإيصال لـ ETA', 'Pay POS Order & Send ETA', 'button', 'branch'),
  ('pos.return', 'sales', NULL, 'مرتجع بيع مع إعادة المخزون', 'Process POS Return', 'button', 'branch'),
  ('shift.close', 'sales', NULL, 'إغلاق وردية الكاشير ومطابقة العجز/الزيادة', 'Close Cashier Shift', 'button', 'branch'),
  ('invoice.approve', 'sales', NULL, 'اعتماد الفاتورة وتوليد قيد الحسابات', 'Approve Sales Invoice', 'button', 'branch'),
  ('invoice.cancel', 'sales', NULL, 'إلغاء الفاتورة وإنشاء قيد عكسي', 'Cancel Sales Invoice', 'button', 'branch'),
  ('payment.receive', 'sales', NULL, 'تسجيل تحصيل نقدية أو بنك لعميل', 'Receive Customer Payment', 'button', 'branch'),

  -- 10. المشتريات (Purchasing)
  ('po.create', 'purchasing', NULL, 'إنشاء أمر شراء للمورد', 'Create Purchase Order', 'button', 'branch'),
  ('po.approve', 'purchasing', NULL, 'اعتماد أمر الشراء ورقابته مالياً', 'Approve Purchase Order', 'button', 'all'),
  ('po.receive', 'purchasing', NULL, 'استلام أمر الشراء وتوليد إذن المخزن', 'Receive Purchase Order', 'button', 'branch'),
  ('supplierpay.create', 'purchasing', NULL, 'سداد مستحقات مورد وربطها بالفواتير', 'Create Supplier Payment', 'button', 'all'),

  -- 11. المحاسبة (Accounting)
  ('account.create', 'accounting', NULL, 'إضافة حساب جديد في الدليل الهرمي', 'Create Ledger Account', 'button', 'all'),
  ('journal.post', 'accounting', NULL, 'ترحيل قيد اليومية العام والتأكد من التوازن', 'Post Journal Entry', 'button', 'all'),
  ('journal.reverse', 'accounting', NULL, 'عكس قيد محاسبي دون حذفه', 'Reverse Journal Entry', 'button', 'all'),
  ('period.close', 'accounting', NULL, 'إقفال الفترة المالية ومنع القيود', 'Close Fiscal Period', 'button', 'all'),

  -- 12. الموارد البشرية والمرتبات (HR)
  ('employee.create', 'hr', NULL, 'تسجيل ملف موظف جديد وعقد العمل', 'Create Employee Record', 'button', 'all'),
  ('attendance.import', 'hr', NULL, 'استيراد بصمة الحضور والانصراف', 'Import Attendance Fingerprints', 'button', 'all'),
  ('payroll.run', 'hr', NULL, 'تشغيل احتساب مسير المرتبات الشهري', 'Run Payroll Calculation', 'button', 'all'),
  ('payroll.approve', 'hr', NULL, 'اعتماد مسير المرتبات وتوليد القيد المالي', 'Approve Payroll Run', 'button', 'all'),
  ('payslip.print', 'hr', NULL, 'طباعة قسيمة الراتب السرية PDF للموظف', 'Print Payslip PDF', 'button', 'own'),

  -- 13. التصنيع والعيادات (Manufacturing & Clinic)
  ('bom.newversion', 'manufacturing', NULL, 'إنشاء إصدار جديد من شجرة المنتج BOM', 'Create BOM Version', 'button', 'all'),
  ('bom.approve', 'manufacturing', NULL, 'اعتماد شجرة المنتج للتشغيل الفعلي', 'Approve BOM', 'button', 'all'),
  ('production.start', 'manufacturing', NULL, 'بدء أمر تشغيل وصرف الخامات', 'Start Production Order', 'button', 'branch'),
  ('production.complete', 'manufacturing', NULL, 'إنهاء أمر تشغيل وإضافة التام وحساب التكلفة', 'Complete Production Order', 'button', 'branch'),
  ('costing.recalc', 'manufacturing', NULL, 'إعادة احتساب التكلفة الفعلية للمنتجات', 'Recalculate Actual Costs', 'button', 'all'),
  ('patient.create', 'clinic', NULL, 'فتح ملف طبي وبحث مريض جديد', 'Create Patient File', 'button', 'all'),
  ('appointment.book', 'clinic', NULL, 'حجز موعد طبي مع منع تضارب الجدول GIST', 'Book Doctor Appointment', 'button', 'branch'),
  ('visit.addservice', 'clinic', NULL, 'إضافة فحص أو خدمة طبية للزيارة', 'Add Service to Visit', 'button', 'branch'),
  ('visit.close', 'clinic', NULL, 'إنهاء الزيارة الطبية وتوليد الفاتورة', 'Close Visit & Generate Invoice', 'button', 'branch'),
  ('eta.resend', 'sales', NULL, 'إعادة إرسال الفاتورة الفاشلة لمنظومة الضرائب المصرية', 'Resend ETA Invoice', 'button', 'all'),

  -- 14. التقارير والتشغيل (Reporting & Maintenance)
  ('report.run', 'reporting', NULL, 'تشغيل التقارير المجمعة من Materialized Views', 'Run Materialized Report', 'button', 'branch'),
  ('report.schedule', 'reporting', NULL, 'جدولة إرسال التقرير دورياً بالبريد عبر Hangfire', 'Schedule Report Dispatch', 'button', 'all'),
  ('event.retry', 'core', NULL, 'إعادة تشغيل الأحداث الفاشلة من جدول الـ Outbox', 'Retry Failed Outbox Event', 'button', 'all')
ON CONFLICT (code) DO UPDATE
SET label_ar = EXCLUDED.label_ar, label_en = EXCLUDED.label_en;
