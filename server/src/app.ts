import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from 'jsonwebtoken';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { expandPermissions } from './permissionExpansion.js';
import { isTenantScoped, resolveTable } from './datasetTables.js';
import { softDeleteRecords, writeRecords } from './recordWriter.js';
import { registerInvoiceRoutes } from './invoiceRoutes.js';

/**
 * Universal Business Platform API
 * -----------------------------------------------------------------------------
 * The browser never talks to Postgres again: it calls this API, which
 *   1. authenticates the user (JWT),
 *   2. derives the tenant from the token (never from the request body),
 *   3. opens a transaction with `app.tenant_id` set so RLS isolates the tenant,
 *   4. and runs the atomic accounting functions.
 */


interface TokenPayload {
  sub: string;
  tenantId: string;
  role: string;
  allowedTenantIds: string[];
  allowedBranchIds: string[];
  allowedViews: string[];
  /**
   * الأفعال المسموحة للمستخدم (Action Registry) — صلاحيات على مستوى الزر لا الشاشة.
   * غياب الفعل = ممنوع (Default-Deny). القيمة '*' تعني كل الأفعال.
   */
  allowedActions?: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: TokenPayload;
  }
}

/**
 * تبعيات التطبيق — تُمرَّر من الخارج لتصبح قابلة للاستبدال في الاختبارات.
 */
export interface AppDeps {
  /** طبقة الوصول لقاعدة البيانات (تُستبدل في الاختبارات بدوال وهمية). */
  db: {
    one: <T = any>(tenantId: string, text: string, params?: unknown[]) => Promise<T>;
    withTenant: (tenantId: string, statements: { text: string; params?: unknown[] }[]) => Promise<any[]>;
    rawQuery: <T = any>(text: string, params?: unknown[]) => Promise<T>;
  };
  jwtSecret: string;
  jwtExpiresIn?: string;
  corsOrigins?: string[];
  /** تشغيل سجلات Fastify (يُطفأ في الاختبارات لتقليل الضجيج). */
  logger?: boolean;
  /** تعطيل Rate Limiting في الاختبارات. */
  disableRateLimit?: boolean;
}

/**
 * يبني نسخة Fastify كاملة بكل المسارات والفلاتر — **بلا تشغيل**.
 *
 * فصل البناء عن التشغيل يسمح باختبار الأمان (الصلاحيات وعزل المستأجرين)
 * عبر `app.inject()` بلا الحاجة إلى خادم حقيقي أو شبكة.
 */
export async function buildApp(deps: AppDeps) {
  const { one, withTenant, rawQuery } = deps.db;
  const JWT_SECRET = deps.jwtSecret;
  const JWT_EXPIRES_IN = deps.jwtExpiresIn || '12h';
  const CORS_ORIGINS = deps.corsOrigins ?? [];

  const app = Fastify({ logger: deps.logger ?? true, trustProxy: true });
  await app.register(helmet);
  await app.register(cors, {
    origin: CORS_ORIGINS.length > 0 ? CORS_ORIGINS : false,
    credentials: true,
  });
  if (!deps.disableRateLimit) {
    await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  }
  app.decorateRequest('auth', undefined);
  app.addHook('preHandler', async (request, reply) => {
    const path = request.routeOptions?.url || request.url;
    if (path === '/health' || path === '/auth/login') return;
    const header = request.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return reply.code(401).send({ error: 'missing_token' });
    try {
      request.auth = jwt.verify(token, JWT_SECRET as string) as TokenPayload;
    } catch {
      return reply.code(401).send({ error: 'invalid_token' });
    }
  });

  const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
  const safeEqual = (a: string, b: string) => {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  };

  app.get('/health', async () => {
    const rows = await rawQuery<any[]>('SELECT 1 AS ok');
    return { status: 'ok', database: rows?.[0]?.ok === 1 ? 'up' : 'down' };
  });

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------
  const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
    tenantId: z.string().min(1).optional(),
  });

  app.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_payload' });
    const { username, password, tenantId } = parsed.data;

    // المصدر الوحيد: الجدول المنمّط users (عبر دالة SECURITY DEFINER,
    // لأن تسجيل الدخول يسبق معرفة المنشأة فلا يوجد سياق لـ RLS).
    const rows = await rawQuery<any[]>(
      `SELECT out_tenant_id AS tenant_id, out_user_id AS user_id, out_payload AS payload
         FROM fn_authenticate_user($1)`,
      [username]
    );
    const matches = (rows || []).filter((row) => {
      const stored = String(row.payload?.password || '');
      const storedHash = String(row.payload?.passwordHash || '');
      if (storedHash) return safeEqual(storedHash, sha256(password));
      return stored.length > 0 && safeEqual(stored, password);
    });
    const account = tenantId ? matches.find((row) => row.tenant_id === tenantId) : matches[0];
    if (!account) return reply.code(401).send({ error: 'invalid_credentials' });
    if (account.payload?.isActive === false) return reply.code(403).send({ error: 'user_disabled' });

    const payload: TokenPayload = {
      sub: String(account.payload?.id || username),
      tenantId: String(account.tenant_id),
      role: String(account.payload?.role || 'Custom'),
      allowedTenantIds: Array.isArray(account.payload?.allowedTenantIds) ? account.payload.allowedTenantIds : [String(account.tenant_id)],
      allowedBranchIds: Array.isArray(account.payload?.allowedBranchIds) ? account.payload.allowedBranchIds : [],
      allowedViews: Array.isArray(account.payload?.allowedViews) ? account.payload.allowedViews : [],
      // توسيع أكواد شاشات الواجهة إلى الأكواد العامة التي يفرضها الـ API
      // (بدون هذا التوسيع: مستخدم يملك pos.checkout يحصل على 403 على record.save)
      allowedActions: expandPermissions(
        Array.isArray(account.payload?.allowedActions) ? account.payload.allowedActions : []
      ),
    };
    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
    if (!account.payload?.passwordHash && account.payload?.password) {
      request.log.warn(`User ${username} still stores a plaintext password - migrate to passwordHash`);
    }
    return { token, user: { id: payload.sub, tenantId: payload.tenantId, role: payload.role } };
  });

  app.get('/me', async (request) => ({ auth: request.auth }));

  // ---------------------------------------------------------------------------
  // محرك الشاشات (Metadata Registry)
  // ---------------------------------------------------------------------------
  /**
   * يُرجع تعريف الشاشات والأفعال والكيانات وحقولها.
   *
   * هذا هو ما يجعل إضافة حقل أو شاشة **بيانات** لا كوداً: الواجهة تقرأ من هنا
   * ولا تحتاج إعادة بناء. البيانات تُدار في جداول erp_* (انظر
   * scripts/neon_metadata_engine.sql).
   *
   * الجداول غير تابعة لمنشأة (configuration عام)، لذلك لا تخضع للـ RLS،
   * لكن الوصول يظل محمياً بالتوكن (preHandler).
   */
  app.get('/metadata/registry', async () => {
    const [views, actions, entities, fields, screens] = await Promise.all([
      rawQuery<any[]>(`SELECT id, name_ar, name_en, description_ar, description_en,
                              icon_name, category, sort_order
                         FROM erp_views WHERE is_active = TRUE
                        ORDER BY sort_order, id`),
      rawQuery<any[]>(`SELECT key, name_ar, name_en, view_id, description_ar, description_en, sort_order
                         FROM erp_actions ORDER BY sort_order, key`),
      rawQuery<any[]>(`SELECT code, table_name, display_name_ar, display_name_en, view_id, soft_delete
                         FROM erp_entities WHERE is_active = TRUE ORDER BY code`),
      rawQuery<any[]>(`SELECT id, entity_code, column_name, label_ar, label_en, data_type,
                              is_required, is_readonly, grid_visible, form_order, width
                         FROM erp_entity_fields ORDER BY entity_code, form_order`),
      rawQuery<any[]>(`SELECT code, view_id, entity_code, kind, route, menu_group, sort_order, icon
                         FROM erp_screens ORDER BY sort_order, code`),
    ]);

    const fieldsByEntity = new Map<string, any[]>();
    for (const row of fields || []) {
      const key = String(row.entity_code);
      const list = fieldsByEntity.get(key) || [];
      list.push({
        id: Number(row.id),
        columnName: row.column_name,
        labelAr: row.label_ar,
        labelEn: row.label_en,
        dataType: row.data_type,
        isRequired: Boolean(row.is_required),
        isReadonly: Boolean(row.is_readonly),
        gridVisible: Boolean(row.grid_visible),
        formOrder: Number(row.form_order),
        width: Number(row.width),
      });
      fieldsByEntity.set(key, list);
    }

    return {
      views: (views || []).map((v: any) => ({
        id: v.id,
        nameAr: v.name_ar,
        nameEn: v.name_en,
        descriptionAr: v.description_ar || '',
        descriptionEn: v.description_en || '',
        iconName: v.icon_name || 'Layers',
        category: v.category,
        sortOrder: Number(v.sort_order),
      })),
      actions: (actions || []).map((a: any) => ({
        key: a.key,
        nameAr: a.name_ar,
        nameEn: a.name_en,
        viewId: a.view_id,
        descriptionAr: a.description_ar || undefined,
        descriptionEn: a.description_en || undefined,
        sortOrder: Number(a.sort_order),
      })),
      entities: (entities || []).map((e: any) => ({
        code: e.code,
        tableName: e.table_name,
        displayNameAr: e.display_name_ar,
        displayNameEn: e.display_name_en,
        viewId: e.view_id,
        softDelete: Boolean(e.soft_delete),
        fields: fieldsByEntity.get(String(e.code)) || [],
      })),
      screens: (screens || []).map((s: any) => ({
        code: s.code,
        viewId: s.view_id,
        entityCode: s.entity_code,
        kind: s.kind,
        route: s.route,
        menuGroup: s.menu_group,
        sortOrder: Number(s.sort_order),
        icon: s.icon,
      })),
    };
  });

  /** Guarantees the caller may operate on the requested tenant. */
  function assertTenant(request: any, requestedTenantId?: string): string {
    const auth = request.auth as TokenPayload;
    const target = requestedTenantId || auth.tenantId;
    if (target !== auth.tenantId && !auth.allowedTenantIds.includes(target)) {
      throw Object.assign(new Error('tenant_forbidden'), { statusCode: 403 });
    }
    return target;
  }

  /**
   * فحص صلاحية على مستوى الزر (Action Registry) بقاعدة Default-Deny.
   *
   * هذا هو الفرق بين «المستخدم يشوف الشاشة» و«المستخدم يملك حق تنفيذ الفعل»:
   *   - allowedViews تسمح بفتح الشاشة.
   *   - allowedActions تسمح بالضغط على زر معيّن داخلها.
   *
   * غياب الفعل من القائمة = 403 فوري، حتى لو كان المستخدم يرى الشاشة.
   * القيمة '*' (أو دور SuperAdmin) تعني كل الأفعال.
   */
  function assertAction(request: any, actionCode: string): void {
    const auth = request.auth as TokenPayload;
    const actions = auth.allowedActions || [];
    const isSuper = auth.role === 'SuperAdmin' || actions.includes('*');
    if (isSuper || actions.includes(actionCode)) return;

    throw Object.assign(new Error('action_not_allowed'), {
      statusCode: 403,
      actionCode,
      detail: `ليس لديك الصلاحية المسجّلة [${actionCode}] لتنفيذ هذه العملية.`,
    });
  }

  // ---------------------------------------------------------------------------
  // معالج الأخطاء الموحّد: يحوّل الأخطاء المرفوعة إلى ردود JSON واضحة
  // ---------------------------------------------------------------------------
  app.setErrorHandler((error: any, request, reply) => {
    const statusCode = Number(error?.statusCode) || 500;

    if (statusCode === 403) {
      return reply.code(403).send({
        error: error?.message || 'forbidden',
        actionCode: error?.actionCode,
        message: error?.detail || 'مرفوض أمنياً: لا تملك الصلاحية لتنفيذ هذه العملية.',
      });
    }

    if (statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({ error: error?.message || 'bad_request' });
    }

    request.log.error(error);
    return reply.code(500).send({ error: 'internal_error' });
  });

  // ---------------------------------------------------------------------------
  // إدارة الـ Metadata (Metadata Studio)
  // ---------------------------------------------------------------------------
  /**
   * تعديل حقول الكيانات من الواجهة مباشرة — بلا نشر ولا إعادة بناء.
   *
   * ⚠️ ملاحظة أمنية: هذه الجداول إعدادات عامة (لا تخص منشأة بعينها)، لذلك
   * تقتصر الكتابة على دور SuperAdmin. غياب الفحص يعني أن أي مستخدم يستطيع
   * تغيير واجهة كل الشركات.
   */
  function assertSuperAdmin(request: any): void {
    const auth = request.auth as TokenPayload;
    const isSuper =
      auth.role === 'SuperAdmin' ||
      (auth.allowedActions || []).includes('*') ||
      (auth.allowedViews || []).includes('*');

    if (!isSuper) {
      throw Object.assign(new Error('metadata_forbidden'), {
        statusCode: 403,
        detail: 'تعديل تعريفات الشاشات متاح للمدير العام فقط.',
      });
    }
  }

  const metadataFieldSchema = z.object({
    entityCode: z.string().min(1).max(150),
    columnName: z.string().min(1).max(150),
    labelAr: z.string().min(1).max(255),
    labelEn: z.string().min(1).max(255),
    dataType: z.enum(['string', 'number', 'currency', 'badge', 'date', 'select', 'boolean', 'json']),
    isRequired: z.boolean().optional(),
    isReadonly: z.boolean().optional(),
    gridVisible: z.boolean().optional(),
    formOrder: z.number().int().min(0).max(9999).optional(),
    width: z.number().int().min(40).max(1200).optional(),
  });

  /** إضافة حقل جديد لكيان. */
  app.post('/metadata/fields', async (request, reply) => {
    assertSuperAdmin(request);
    const parsed = metadataFieldSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_payload', details: parsed.error.issues });
    }
    const f = parsed.data;

    const rows = await rawQuery<any[]>(
      `INSERT INTO erp_entity_fields
         (entity_code, column_name, label_ar, label_en, data_type,
          is_required, is_readonly, grid_visible, form_order, width)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (entity_code, column_name) DO UPDATE SET
         label_ar = EXCLUDED.label_ar,
         label_en = EXCLUDED.label_en,
         data_type = EXCLUDED.data_type,
         is_required = EXCLUDED.is_required,
         is_readonly = EXCLUDED.is_readonly,
         grid_visible = EXCLUDED.grid_visible,
         form_order = EXCLUDED.form_order,
         width = EXCLUDED.width
       RETURNING id`,
      [
        f.entityCode, f.columnName, f.labelAr, f.labelEn, f.dataType,
        f.isRequired ?? false, f.isReadonly ?? false, f.gridVisible ?? true,
        f.formOrder ?? 10, f.width ?? 150,
      ]
    );

    return { id: rows?.[0]?.id ?? null, saved: true };
  });

  /** تعديل حقل موجود (بالمعرّف). */
  app.put('/metadata/fields/:id', async (request, reply) => {
    assertSuperAdmin(request);
    const { id } = request.params as { id: string };
    const parsed = metadataFieldSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_payload', details: parsed.error.issues });
    }

    const f = parsed.data;
    const rows = await rawQuery<any[]>(
      `UPDATE erp_entity_fields SET
         label_ar     = COALESCE($2, label_ar),
         label_en     = COALESCE($3, label_en),
         data_type    = COALESCE($4, data_type),
         is_required  = COALESCE($5, is_required),
         is_readonly  = COALESCE($6, is_readonly),
         grid_visible = COALESCE($7, grid_visible),
         form_order   = COALESCE($8, form_order),
         width        = COALESCE($9, width)
       WHERE id = $1
       RETURNING id`,
      [
        Number(id),
        f.labelAr ?? null, f.labelEn ?? null, f.dataType ?? null,
        f.isRequired ?? null, f.isReadonly ?? null, f.gridVisible ?? null,
        f.formOrder ?? null, f.width ?? null,
      ]
    );

    if (!rows || rows.length === 0) {
      return reply.code(404).send({ error: 'field_not_found' });
    }
    return { id: rows[0].id, saved: true };
  });

  /** حذف حقل من الكيان. */
  app.delete('/metadata/fields/:id', async (request, reply) => {
    assertSuperAdmin(request);
    const { id } = request.params as { id: string };
    const rows = await rawQuery<any[]>(
      `DELETE FROM erp_entity_fields WHERE id = $1 RETURNING id`,
      [Number(id)]
    );
    if (!rows || rows.length === 0) {
      return reply.code(404).send({ error: 'field_not_found' });
    }
    return { id: rows[0].id, deleted: true };
  });

  // ---------------------------------------------------------------------------
  // Records (the data layer the app uses)
  // ---------------------------------------------------------------------------
  const PAGE_SIZE = 2000;

  /** Live records of a dataset (soft-deleted excluded), keyset-paginated. */
  app.get('/records/:docKey', async (request, reply) => {
    const { docKey } = request.params as { docKey: string };
    const query = request.query as { after?: string; limit?: string };
    const tenantId = assertTenant(request);
    const limit = Math.min(Number(query.limit || PAGE_SIZE), PAGE_SIZE);
    const after = query.after || '';

    // 🔒 الجدول من خريطة معتمدة فقط (Allow-list) — لا أسماء خام من العميل.
    const table = resolveTable(docKey);
    if (!table) return reply.code(404).send({ error: 'unknown_dataset', docKey });

    // المصدر الوحيد: الجدول المنمّط.
    const scoped = isTenantScoped(docKey);
    const rows = await one<any[]>(
      tenantId,
      scoped
        ? `SELECT id, payload, updated_at FROM ${table}
            WHERE tenant_id = $1 AND deleted_at IS NULL AND ($2 = '' OR id > $2)
            ORDER BY id LIMIT $3`
        : `SELECT id, payload, updated_at FROM ${table}
            WHERE deleted_at IS NULL AND ($1 = '' OR id > $1)
            ORDER BY id LIMIT $2`,
      scoped ? [tenantId, after, limit] : [after, limit]
    );

    const records = (rows || []).map((row: any) => ({ ...(row.payload || {}), id: String(row.id) }));
    const nextAfter =
      rows && rows.length === limit ? String(rows[rows.length - 1].id) : null;
    return { records, nextAfter, count: records.length };
  });

  /** Changes since a cursor - what the client polls for. */
  app.get('/records/:docKey/changes', async (request, reply) => {
    const { docKey } = request.params as { docKey: string };
    const query = request.query as { since?: string };
    const tenantId = assertTenant(request);
    const since = query.since || '1970-01-01T00:00:00.000Z';

    const table = resolveTable(docKey);
    if (!table) return reply.code(404).send({ error: 'unknown_dataset', docKey });

    const scoped = isTenantScoped(docKey);
    const rows = await one<any[]>(
      tenantId,
      scoped
        ? `SELECT id, payload, updated_at, deleted_at FROM ${table}
            WHERE tenant_id = $1 AND updated_at > $2::timestamptz
            ORDER BY updated_at`
        : `SELECT id, payload, updated_at, deleted_at FROM ${table}
            WHERE updated_at > $1::timestamptz
            ORDER BY updated_at`,
      scoped ? [tenantId, since] : [since]
    );

    const records: any[] = [];
    const deletedIds: string[] = [];
    let nextCursor = since;
    (rows || []).forEach((row: any) => {
      const stamp = row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at);
      if (stamp > nextCursor) nextCursor = stamp;
      if (row.deleted_at) deletedIds.push(String(row.id));
      else records.push({ ...(row.payload || {}), id: String(row.id) });
    });
    return { records, deletedIds, nextCursor };
  });

  const upsertSchema = z.object({
    records: z.array(z.record(z.any())).min(1).max(1000),
    /** عند تفعيله، يرفض الخادم أي كتابة تُلغي تعديلاً أحدث موجود على الخادم. */
    enforceVersion: z.boolean().optional(),
  });

  /**
   * فحص التزامن المتفائل (Optimistic Concurrency).
   *
   * يقارن إصدار كل سجل قادم بالإصدار المخزَّن، ويرجع قائمة التعارضات.
   * الاعتماد على `version` الرقمي (لا على الطوابع الزمنية) يمنع الكتابة فوق
   * تعديلات مستخدم آخر حتى لو كانت ساعات الأجهزة مختلفة.
   */
  async function findVersionConflicts(
    tenantId: string,
    docKey: string,
    incoming: Record<string, any>[]
  ): Promise<{ id: string; serverVersion: number; clientVersion: number }[]> {
    const ids = incoming.map((r) => String(r?.id ?? '')).filter(Boolean);
    if (ids.length === 0) return [];

    const table = resolveTable(docKey);
    if (!table) return []; // مجموعة غير معروفة — لا يمكن فحص التعارض

    const scoped = isTenantScoped(docKey);
    const rows = await one<any[]>(
      tenantId,
      scoped
        ? `SELECT id, payload->>'version' AS version FROM ${table}
            WHERE tenant_id = $1 AND id = ANY($2) AND deleted_at IS NULL`
        : `SELECT id, payload->>'version' AS version FROM ${table}
            WHERE id = ANY($1) AND deleted_at IS NULL`,
      scoped ? [tenantId, ids] : [ids]
    );

    const conflicts: { id: string; serverVersion: number; clientVersion: number }[] = [];
    for (const row of rows || []) {
      const recordId = String(row.id);
      const serverVersion = Number(row.version);
      const clientRecord = incoming.find((r) => String(r?.id ?? '') === recordId);
      const clientVersion = Number(clientRecord?.version);

      if (!Number.isFinite(serverVersion) || !Number.isFinite(clientVersion)) continue;

      // تعارض حقيقي: الخادم أحدث من النسخة التي عدّلها العميل.
      if (serverVersion > clientVersion) {
        conflicts.push({ id: recordId, serverVersion, clientVersion });
      }
    }
    return conflicts;
  }

  /** Upserts records (one transaction, tenant-scoped) with optional version enforcement. */
  app.post('/records/:docKey', async (request, reply) => {
    const { docKey } = request.params as { docKey: string };
    const parsed = upsertSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_payload' });
    const tenantId = assertTenant(request);
    assertAction(request, 'record.save');
    const actor = String(request.auth?.sub || 'api');

    if (parsed.data.enforceVersion === true) {
      const conflicts = await findVersionConflicts(tenantId, docKey, parsed.data.records);
      if (conflicts.length > 0) {
        return reply.code(409).send({
          error: 'version_conflict',
          message: 'تم تعديل بعض السجلات من مستخدم آخر. حدّث الشاشة ثم أعد المحاولة.',
          conflicts,
        });
      }
    }

    // المصدر الوحيد: الجدول المنمّط (كتابة مباشرة بأعمدته الفعلية).
    const table = resolveTable(docKey);
    if (!table) return reply.code(404).send({ error: 'unknown_dataset', docKey });

    const result = await writeRecords({
      query: (text, params) => one<any[]>(tenantId, text, params),
      table,
      tenantId,
      scoped: isTenantScoped(docKey),
      records: parsed.data.records,
      actor,
    });

    if (result.error) {
      return reply.code(500).send({ error: 'write_failed', message: result.error });
    }
    return { upserted: result.written };
  });

  const deleteSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(1000) });

  /** Soft-deletes records (never a hard delete). */
  app.post('/records/:docKey/delete', async (request, reply) => {
    const { docKey } = request.params as { docKey: string };
    const parsed = deleteSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_payload' });
    const tenantId = assertTenant(request);
    assertAction(request, 'record.delete');
    const actor = String(request.auth?.sub || 'api');

    // المصدر الوحيد: الجدول المنمّط (حذف ناعم).
    const table = resolveTable(docKey);
    if (!table) return reply.code(404).send({ error: 'unknown_dataset', docKey });

    const result = await softDeleteRecords({
      query: (text, params) => one<any[]>(tenantId, text, params),
      table,
      tenantId,
      scoped: isTenantScoped(docKey),
      ids: parsed.data.ids,
      actor,
    });

    if (result.error) {
      return reply.code(500).send({ error: 'delete_failed', message: result.error });
    }
    return { deleted: result.written };
  });

  // ---------------------------------------------------------------------------
  // Atomic accounting (the business operations live in the database)
  // ---------------------------------------------------------------------------
  const journalSchema = z.object({
    branchId: z.string().optional(),
    date: z.string().min(8),
    description: z.string().min(1),
    sourceDocument: z.string().default('API'),
    lines: z.array(z.object({
      account_id: z.string().min(1),
      account_code: z.string().default(''),
      account_name_ar: z.string().default(''),
      memo: z.string().default(''),
      debit: z.number().nonnegative(),
      credit: z.number().nonnegative(),
    })).min(2),
  });

  /** Posts a balanced journal atomically; rejects unbalanced input with 400. */
  app.post('/accounting/journal', async (request, reply) => {
    // فحص الصلاحية أولاً: لا نكشف تفاصيل شكل البيانات لمستخدم غير مصرّح له.
    const tenantId = assertTenant(request);
    assertAction(request, 'journal.post');
    const parsed = journalSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_payload', details: parsed.error.issues });
    const body = parsed.data;
    try {
      const rows = await one<any[]>(
        tenantId,
        `SELECT fn_post_journal($1, $2, $3, $4, $5, $6::jsonb, $7) AS journal_id`,
        [tenantId, body.branchId || null, body.date, body.description, body.sourceDocument,
         JSON.stringify(body.lines), String(request.auth?.sub || 'api')]
      );
      return { journalId: String(rows?.[0]?.journal_id) };
    } catch (error: any) {
      return reply.code(400).send({ error: 'posting_rejected', message: error?.message });
    }
  });

  const receiptSchema = z.object({
    branchId: z.string().min(1),
    customerCode: z.string().min(1),
    amount: z.number().positive(),
    date: z.string().min(8),
    paymentAccountId: z.string().min(1),
    service: z.string().optional(),
    receipt: z.record(z.any()),
  });

  /** Records a customer collection receipt atomically (payment account debit / customer credit). */
  app.post('/accounting/receipt', async (request, reply) => {
    const tenantId = assertTenant(request);
    assertAction(request, 'receipt.create');
    const parsed = receiptSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_payload' });
    const b = parsed.data;
    try {
      const rows = await one<any[]>(
        tenantId,
        `SELECT fn_post_customer_receipt($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) AS result`,
        [tenantId, b.branchId, b.customerCode, b.amount, b.date, b.paymentAccountId,
         b.service || '', JSON.stringify(b.receipt), String(request.auth?.sub || 'api')]
      );
      return { result: rows?.[0]?.result };
    } catch (error: any) {
      return reply.code(400).send({ error: 'posting_rejected', message: error?.message });
    }
  });

  /** Reverses a journal atomically (the original is kept). */
  app.post('/accounting/journal/:id/reverse', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = assertTenant(request);
    assertAction(request, 'journal.reverse');
    const parsed = z.object({ reason: z.string().min(3) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_payload' });
    try {
      const rows = await one<any[]>(
        tenantId,
        `SELECT fn_reverse_journal($1,$2,$3,$4) AS journal_id`,
        [tenantId, id, parsed.data.reason, String(request.auth?.sub || 'api')]
      );
      return { journalId: String(rows?.[0]?.journal_id) };
    } catch (error: any) {
      return reply.code(400).send({ error: 'reversal_rejected', message: error?.message });
    }
  });

  /** Authoritative account balances straight from the ledger. */
  app.get('/accounting/balances', async (request) => {
    const tenantId = assertTenant(request);
    const rows = await one<any[]>(
      tenantId,
      `SELECT code, name_ar, account_type, balance FROM accounts ORDER BY code`,
      []
    );
    return { balances: rows || [] };
  });


  registerInvoiceRoutes(app, { one, assertTenant, assertAction });

  return app;
}
