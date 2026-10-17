/**
 * توسيع أكواد الأفعال (Permission Expansion)
 * ---------------------------------------------------------------------------
 * المشكلة التي يحلّها هذا الملف:
 *
 *   الواجهة تُسجّل **44 فعلاً موجّهاً للشاشات** (`pos.checkout`, `parties.add`,
 *   `accounting.add_entry`, …) لأنها تتحكم في زر معيّن داخل شاشة.
 *
 *   الـ API يُفرض فيه **5 أفعال عامّة** (`record.save`, `record.delete`,
 *   `journal.post`, `journal.reverse`, `receipt.create`) لأن نقطة النهاية
 *   واحدة تخدم كل الجداول ولا تعرف الشاشة التي استدعتها.
 *
 *   النتيجة: مستخدم يملك `pos.checkout` لكن لا يملك `record.save`
 *   ⇒ **403 على كل عملية حفظ** رغم أنه مصرّح له في الواجهة.
 *
 * الحل:
 *   عند تسجيل الدخول نُوسّع أفعال المستخدم: كل فعل شاشة يمنح **تلقائياً**
 *   الأفعال العامة التي يتطلبها. هذا يحافظ على مبدأ Default-Deny (الفعل غير
 *   المذكور لا يُمنح) وفي نفس الوقت لا يعطّل المستخدمين الحاليين.
 *
 * ⚠️ لا تُضِف توسيعاً إلا إذا كان الفعل الموجّه **يتطلب فعلاً** كتابة البيانات.
 */

/** الأفعال العامّة التي يفرضها الـ API. */
export type GenericAction =
  | 'record.save'
  | 'record.delete'
  | 'journal.post'
  | 'journal.reverse'
  | 'receipt.create'
  | 'invoices.view';

/** الفعل الواحد قد يحتاج أكثر من فعل عام. */
export const ACTION_EXPANSION: Record<string, GenericAction[]> = {
  // --- نقطة البيع ---
  'pos.checkout': ['record.save', 'receipt.create'],
  'pos.return': ['record.save', 'journal.post'],
  'pos.discount': [],
  'pos.tax_edit': [],
  'pos.close_shift': ['record.save'],
  'pos.print': [],

  // --- التشغيل (الريسيبشن) ---
  'reception_ops.open_shift': ['record.save'],
  'reception_ops.close_shift': ['record.save'],
  'reception_ops.add_run_row': ['record.save', 'receipt.create'],
  'reception_ops.edit_row': ['record.save'],
  'reception_ops.add_expense': ['record.save'],
  'reception_ops.adjust_balance': ['record.save', 'journal.post'],
  'reception_ops.print_shift': [],

  // --- الحجوزات والمتابعات ---
  'bookings.create_booking': ['record.save'],
  'bookings.edit_booking': ['record.save'],
  'bookings.cancel_booking': ['record.save'],
  'bookings.reschedule_booking': ['record.save'],
  'bookings.mark_attendance': ['record.save'],
  'bookings.add_followup': ['record.save'],
  'bookings.manage_staff_schedule': ['record.save'],

  // --- الموظفون ---
  'staff.add_staff': ['record.save'],
  'staff.edit_staff': ['record.save'],
  'staff.delete_staff': ['record.delete'],

  // --- التقارير ---
  'shift_reports.print': [],
  'shift_reports.export': [],

  // --- المخازن ---
  'inventory.add_item': ['record.save'],
  'inventory.delete_item': ['record.delete'],
  'inventory.adjust_stock': ['record.save', 'journal.post'],
  'inventory.transfer': ['record.save'],

  // --- العملاء والموردون ---
  'parties.add': ['record.save'],
  'parties.edit': ['record.save'],
  'parties.delete': ['record.delete'],
  'parties.import': ['record.save'],

  // --- طرق السداد ---
  'payment_methods.manage': ['record.save', 'record.delete'],

  // --- المحاسبة ---
  'accounting.add_entry': ['journal.post', 'journal.reverse'],
  'accounting.add_account': ['record.save'],

  // --- العيادات ---
  'clinics.add_patient': ['record.save'],
  'clinics.book_appointment': ['record.save'],

  // --- الشركات والفروع والمخازن ---
  'companies.create': ['record.save'],
  'companies.edit': ['record.save'],
  'branches.manage': ['record.save', 'record.delete'],
  'warehouses.manage': ['record.save', 'record.delete'],

  // --- المستخدمون ---
  'users.create': ['record.save'],
  'users.edit': ['record.save'],
  'users.delete': ['record.delete'],
};

/**
 * يُوسّع قائمة أفعال المستخدم: كل فعل موجّه للواجهة يُضيف ما يتطلبه من
 * أفعال عامّة يفرضها الـ API.
 *
 * @param grantedActions الأفعال المسجّلة للمستخدم من قاعدة البيانات
 * @returns قائمة موحّدة بلا تكرار
 */
export function expandPermissions(grantedActions: string[]): string[] {
  const effective = new Set<string>(grantedActions);

  for (const action of grantedActions) {
    // '*' تعني كل شيء — لا حاجة للتوسيع
    if (action === '*') return ['*'];

    for (const generic of ACTION_EXPANSION[action] ?? []) {
      effective.add(generic);
    }
  }

  return [...effective];
}
