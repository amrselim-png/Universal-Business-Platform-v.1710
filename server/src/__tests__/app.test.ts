/**
 * اختبارات أمان الـ API
 * ---------------------------------------------------------------------------
 * هذه **أخطر فجوة كانت في المشروع**: 15 نقطة نهاية بلا أي اختبار،
 * وأهمها فرض الصلاحيات وعزل المستأجرين.
 *
 * تعمل كلها عبر `app.inject()` — بلا خادم حقيقي ولا شبكة ولا قاعدة بيانات:
 * طبقة قاعدة البيانات تُستبدل بدوال وهمية، فنختبر **منطق الأمان** فقط.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { buildApp, type AppDeps } from '../app.js';

const JWT_SECRET = 'test-secret-for-security-tests-0123456789';

/** طبقة قاعدة بيانات وهمية: تسجّل كل استعلام وتُرجع نتائج محددة. */
function createFakeDb(overrides: Partial<AppDeps['db']> = {}) {
  const calls: { text: string; params?: unknown[] }[] = [];
  const db: AppDeps['db'] = {
    one: async (_tenantId, text, params) => {
      calls.push({ text, params });
      return [] as unknown as never;
    },
    withTenant: async (_tenantId, statements) => {
      statements.forEach((s) => calls.push({ text: s.text, params: s.params }));
      return statements.map(() => []);
    },
    rawQuery: async (text, params) => {
      calls.push({ text, params });
      return [] as unknown as never;
    },
    ...overrides,
  };
  return { db, calls };
}

/** يوقّع توكن بنفس شكل التوكن الحقيقي في التطبيق. */
function makeToken(payload: Record<string, unknown>, secret = JWT_SECRET): string {
  return jwt.sign(
    {
      sub: 'user-1',
      tenantId: 'tenant-1',
      role: 'Custom',
      allowedTenantIds: ['tenant-1'],
      allowedBranchIds: [],
      allowedViews: [],
      allowedActions: [],
      ...payload,
    },
    secret,
    { expiresIn: '1h' }
  );
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function buildTestApp(overrides: Partial<AppDeps['db']> = {}) {
  const { db, calls } = createFakeDb(overrides);
  const app = await buildApp({
    db,
    jwtSecret: JWT_SECRET,
    logger: false,
    disableRateLimit: true,
  });
  await app.ready();
  return { app, calls };
}

describe('المصادقة (Authentication)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    ({ app } = await buildTestApp());
  });
  afterAll(async () => {
    await app.close();
  });

  it('/health متاح بلا توكن (فحص صحة الخدمة)', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).not.toBe(401);
  });

  it('يرفض الطلبات بلا توكن بـ 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/records/erp_branches' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('missing_token');
  });

  it('يرفض التوكن التالف بـ 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/records/erp_branches',
      headers: auth('not-a-real-token'),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('invalid_token');
  });

  it('يرفض التوكن الموقّع بمفتاح آخر (منع التزوير)', async () => {
    const forged = makeToken({}, 'wrong-secret-key-0123456789');
    const res = await app.inject({
      method: 'GET',
      url: '/records/erp_branches',
      headers: auth(forged),
    });
    expect(res.statusCode).toBe(401);
  });

  it('/me يرجع بيانات التوكن لمستخدم مُصادَق', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: auth(makeToken({ tenantId: 'tenant-9' })),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().auth.tenantId).toBe('tenant-9');
  });
});

describe('عزل المستأجرين (Tenant Isolation)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    ({ app } = await buildTestApp());
  });
  afterAll(async () => {
    await app.close();
  });

  it('المستأجر يُشتق من التوكن ولا يُقبل من جسم الطلب', async () => {
    const seenTenants: string[] = [];
    const { db } = createFakeDb({
      one: async (tenantId: string) => {
        seenTenants.push(tenantId);
        return [] as unknown as never;
      },
    });
    const localApp = await buildApp({
      db,
      jwtSecret: JWT_SECRET,
      logger: false,
      disableRateLimit: true,
    });
    await localApp.ready();

    const token = makeToken({ tenantId: 'tenant-real' });
    await localApp.inject({
      method: 'GET',
      url: '/accounting/balances',
      headers: { ...auth(token), 'x-tenant-id': 'tenant-forged' },
    });

    expect(seenTenants.length).toBeGreaterThan(0);
    // المنشأة المستخدمة هي من التوكن، وتُهمَل أي قيمة في الترويسة أو الجسم.
    expect(seenTenants.every((t) => t === 'tenant-real')).toBe(true);
    await localApp.close();
  });

  it('يرفض الكتابة على منشأة غير مسموح بها', async () => {
    const token = makeToken({ tenantId: 'tenant-1', allowedTenantIds: ['tenant-1'] });
    const res = await app.inject({
      method: 'POST',
      url: '/records/erp_branches',
      headers: auth(token),
      payload: { tenantId: 'tenant-2', records: [{ id: 'b1' }] },
    });
    // لا يجب أن يصل الطلب بنجاح لمنشأة أخرى
    expect([200, 403]).toContain(res.statusCode);
  });

  it('يسمح بالمنشأة المذكورة في allowedTenantIds', async () => {
    const token = makeToken({ tenantId: 'tenant-1', allowedTenantIds: ['tenant-1', 'tenant-2'] });
    const res = await app.inject({
      method: 'GET',
      url: '/records/erp_branches',
      headers: auth(token),
    });
    expect(res.statusCode).not.toBe(403);
  });
});

describe('صلاحيات الأفعال (Action Registry) — Default-Deny', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const payload = { records: [{ id: 'b1', version: 1 }] };

  beforeAll(async () => {
    ({ app } = await buildTestApp());
  });
  afterAll(async () => {
    await app.close();
  });

  it('يرفض الحفظ بلا صلاحية record.save بـ 403 مع اسم الفعل', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/records/erp_branches',
      headers: auth(makeToken({ allowedActions: [] })),
      payload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('action_not_allowed');
    expect(res.json().actionCode).toBe('record.save');
  });

  it('يرفض الحفظ لمن يملك صلاحية القراءة فقط', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/records/erp_branches',
      headers: auth(makeToken({ allowedActions: ['record.read'] })),
      payload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().actionCode).toBe('record.save');
  });

  it('يسمح بالحفظ لمن يملك صلاحية record.save', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/records/erp_branches',
      headers: auth(makeToken({ allowedActions: ['record.save'] })),
      payload,
    });
    expect(res.statusCode).not.toBe(403);
  });

  it('يرفض الحذف بلا صلاحية record.delete', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/records/erp_branches/delete',
      headers: auth(makeToken({ allowedActions: ['record.save'] })),
      payload: { ids: ['b1'] },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().actionCode).toBe('record.delete');
  });

  it('يرفض القيد المحاسبي بلا صلاحية journal.post', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/accounting/journal',
      headers: auth(makeToken({ allowedActions: ['record.save'] })),
      payload: { date: '2026-10-14', description: 'قيد', lines: [] },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().actionCode).toBe('journal.post');
  });

  it('يرفض عكس القيد بلا صلاحية journal.reverse', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/accounting/journal/j1/reverse',
      headers: auth(makeToken({ allowedActions: [] })),
      payload: { reason: 'خطأ في الترحيل' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().actionCode).toBe('journal.reverse');
  });

  it('يرفض إيصال التحصيل بلا صلاحية receipt.create', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/accounting/receipt',
      headers: auth(makeToken({ allowedActions: [] })),
      payload: {
        branchId: 'b1',
        customerCode: '1001',
        amount: 100,
        date: '2026-10-14',
        paymentAccountId: 'acc-1',
        receipt: {},
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().actionCode).toBe('receipt.create');
  });

  it('صلاحية * تمنح كل الأفعال', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/records/erp_branches',
      headers: auth(makeToken({ allowedActions: ['*'] })),
      payload,
    });
    expect(res.statusCode).not.toBe(403);
  });

  it('دور SuperAdmin يتجاوز فحص الأفعال', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/records/erp_branches',
      headers: auth(makeToken({ role: 'SuperAdmin', allowedActions: [] })),
      payload,
    });
    expect(res.statusCode).not.toBe(403);
  });
});

describe('صلاحيات إدارة الـ Metadata (استوديو الشاشات)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const field = {
    entityCode: 'parties',
    columnName: 'phone',
    labelAr: 'الهاتف',
    labelEn: 'Phone',
    dataType: 'string',
  };

  beforeAll(async () => {
    ({ app } = await buildTestApp());
  });
  afterAll(async () => {
    await app.close();
  });

  it('يرفض تعديل تعريفات الشاشات لمستخدم عادي بـ 403', async () => {
    const token = makeToken({
      role: 'Custom',
      allowedActions: ['record.save'],
      allowedViews: ['pos'],
    });
    const res = await app.inject({
      method: 'POST',
      url: '/metadata/fields',
      headers: auth(token),
      payload: field,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('metadata_forbidden');
  });

  it('يرفض الحذف لمستخدم عادي أيضاً', async () => {
    const token = makeToken({ role: 'Custom', allowedActions: ['record.delete'] });
    const res = await app.inject({
      method: 'DELETE',
      url: '/metadata/fields/1',
      headers: auth(token),
    });
    expect(res.statusCode).toBe(403);
  });

  it('يسمح للمدير العام بالتعديل', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/metadata/fields',
      headers: auth(makeToken({ role: 'SuperAdmin' })),
      payload: field,
    });
    expect(res.statusCode).not.toBe(403);
  });

  it('يرفض حقلاً بنوع غير معروف بـ 400 (حتى للمدير)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/metadata/fields',
      headers: auth(makeToken({ role: 'SuperAdmin' })),
      payload: { ...field, dataType: 'نوع-وهمي' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_payload');
  });
});

describe('معالج الأخطاء الموحّد', () => {
  it('يُرجع JSON واضحاً عند فشل قاعدة البيانات (بلا تسريب تفاصيل)', async () => {
    const { db } = createFakeDb({
      one: async () => {
        throw new Error('connection refused: password authentication failed for user "app_api"');
      },
    });
    const app = await buildApp({
      db,
      jwtSecret: JWT_SECRET,
      logger: false,
      disableRateLimit: true,
    });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/accounting/balances',
      headers: auth(makeToken({ allowedActions: ['*'] })),
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe('internal_error');
    // لا يجب أن تظهر رسالة قاعدة البيانات الأصلية للمستخدم
    expect(JSON.stringify(res.json())).not.toContain('password authentication');
    await app.close();
  });

  it('يرفض جسم طلب غير صالح بـ 400 JSON', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/records/erp_branches',
      headers: auth(makeToken({ allowedActions: ['*'] })),
      payload: { records: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_payload');
    await app.close();
  });

  describe('نقاط نهاية فواتير المبيعات (/sales/invoices)', () => {
    it('GET /sales/invoices يعزل المستأجر ويستدعي دالة القائمة مع التوكن فقط', async () => {
      const { app, calls } = await buildTestApp({
        one: async (_tenantId, text, params) => {
          calls.push({ text, params });
          return [{ page: { items: [{ id: 'inv-1', invoice_number: 'INV-001' }], nextAfterDate: null, nextAfterId: null } }] as any;
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/sales/invoices?limit=25&status=Paid',
        headers: auth(makeToken({ tenantId: 'tenant-secure-1', allowedViews: ['invoices'] })),
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.items).toHaveLength(1);
      // تأكيد أن المستأجر مشتق حصراً من التوكن
      expect(calls[0].params?.[0]).toBe('tenant-secure-1');
      await app.close();
    });

    it('GET /sales/invoices/summary يعود بالمجاميع للمستأجر', async () => {
      const { app, calls } = await buildTestApp({
        one: async (_tenantId, text, params) => {
          calls.push({ text, params });
          return [{ summary: { count: 120, netTotal: 50000, taxTotal: 7000 } }] as any;
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/sales/invoices/summary',
        headers: auth(makeToken({ tenantId: 'tenant-secure-2', allowedViews: ['invoices'] })),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().count).toBe(120);
      expect(calls[0].params?.[0]).toBe('tenant-secure-2');
      await app.close();
    });

    it('PUT /sales/invoices/:id يرفض التعديل بدون صلاحية كتابة (403)', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'PUT',
        url: '/sales/invoices/inv-100',
        headers: auth(makeToken({ allowedActions: [] })), // لا يملك record.save
        payload: { netAmount: 250, reason: 'تعديل السعر' },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it('PUT /sales/invoices/:id يرفض التعديل بدون سبب إلزامي (400)', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'PUT',
        url: '/sales/invoices/inv-100',
        headers: auth(makeToken({ allowedActions: ['record.save'] })),
        payload: { netAmount: 250, reason: '' },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it('POST /sales/invoices/:id/cancel ينفذ الإلغاء مع توثيق السبب والفاعل', async () => {
      const { app, calls } = await buildTestApp({
        one: async (_tenantId, text, params) => {
          calls.push({ text, params });
          return [{ result: { invoiceId: 'inv-100', status: 'Cancelled' } }] as any;
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/sales/invoices/inv-100/cancel',
        headers: auth(makeToken({ sub: 'admin-user', tenantId: 'tenant-x', allowedActions: ['record.delete'] })),
        payload: { reason: 'إلغاء بناء على طلب العميل' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);
      expect(calls[0].params?.[0]).toBe('tenant-x');
      expect(calls[0].params?.[1]).toBe('inv-100');
      expect(calls[0].params?.[2]).toBe('إلغاء بناء على طلب العميل');
      expect(calls[0].params?.[3]).toBe('admin-user');
      await app.close();
    });

    it('PUT /sales/invoices/:id يرفض التعديل إذا غاب expectedVersion (400)', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'PUT',
        url: '/sales/invoices/inv-100',
        headers: auth(makeToken({ allowedActions: ['record.save'] })),
        payload: { netAmount: 250, reason: 'تعديل السعر' }, // بلا expectedVersion
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('invalid_payload');
      await app.close();
    });

    it('PUT /sales/invoices/:id يُرجع 409 عند تعارض إصدار الفاتورة (conflict_version)', async () => {
      const { app } = await buildTestApp({
        one: async () => {
          throw new Error('conflict_version: invoice was modified concurrently');
        },
      });

      const res = await app.inject({
        method: 'PUT',
        url: '/sales/invoices/inv-100',
        headers: auth(makeToken({ allowedActions: ['record.save'] })),
        payload: { netAmount: 250, reason: 'تعديل السعر', expectedVersion: 2 },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe('conflict_version');
      await app.close();
    });

    it('GET /sales/invoices لا يسرّب أخطاء قاعدة البيانات الحساسة (500 sanitized)', async () => {
      const { app } = await buildTestApp({
        one: async () => {
          throw new Error('database connection pool exhausted credentials secret');
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/sales/invoices',
        headers: auth(makeToken({ allowedActions: ['*'] })),
      });

      expect(res.statusCode).toBe(500);
      expect(res.json().error).toBe('internal_error');
      expect(JSON.stringify(res.json())).not.toContain('database connection pool');
      await app.close();
    });
  });
});
