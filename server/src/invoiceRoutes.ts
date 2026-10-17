import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

export interface InvoiceRouteDeps {
  one: <T = any>(tenantId: string, text: string, params?: unknown[]) => Promise<T>;
  assertTenant: (request: FastifyRequest, requestedTenantId?: string) => string;
  assertAction: (request: FastifyRequest, action: string) => void;
}

const updateInvoiceSchema = z.object({
  netAmount: z.number().nonnegative(),
  paymentMethod: z.string().optional(),
  reason: z.string().min(1, 'Reason is required'),
  expectedVersion: z.number().int().positive('expectedVersion is mandatory for optimistic locking'),
});

const cancelInvoiceSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
});

function assertCanViewInvoices(request: FastifyRequest, assertAction: (req: FastifyRequest, action: string) => void) {
  const auth = (request as any).auth;
  if (!auth) throw Object.assign(new Error('unauthorized'), { statusCode: 401 });
  const isSuper = auth.role === 'SuperAdmin' || (auth.allowedActions || []).includes('*');
  const hasAction = (auth.allowedActions || []).includes('invoices.view');
  const hasView = (auth.allowedViews || []).includes('invoices');
  if (isSuper || hasAction || hasView) return;
  assertAction(request, 'invoices.view');
}

export function registerInvoiceRoutes(app: FastifyInstance, deps: InvoiceRouteDeps) {
  const { one, assertTenant, assertAction } = deps;

  /**
   * GET /sales/invoices
   * Keyset paginated invoice list for the authenticated tenant.
   */
  app.get('/sales/invoices', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = assertTenant(request);
    assertCanViewInvoices(request, assertAction);
    const query = request.query as Record<string, string | undefined>;
    const limitNum = Math.min(Math.max(Number(query.limit || 50), 1), 200);

    const sourceVal = query.source && query.source !== 'all' ? query.source : null;
    const customerIdVal = query.customerId && query.customerId !== 'all' ? query.customerId : null;

    try {
      const rows = await one<any[]>(
        tenantId,
        `SELECT fn_invoice_list($1, $2, $3::date, $4::date, $5, $6, $7::date, $8, $9, $10, $11) AS page`,
        [
          tenantId,
          query.search || null,
          query.from || null,
          query.to || null,
          query.status || null,
          limitNum,
          query.afterDate || null,
          query.afterId || null,
          sourceVal,
          customerIdVal,
          query.branchId || null,
        ]
      );
      const page = rows?.[0]?.page || { items: [], nextAfterDate: null, nextAfterId: null };
      return page;
    } catch {
      return reply.code(500).send({ error: 'internal_error' });
    }
  });

  /**
   * GET /sales/invoices/summary
   * Summary totals (count, net total, tax total) for filtered invoices.
   */
  app.get('/sales/invoices/summary', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = assertTenant(request);
    assertCanViewInvoices(request, assertAction);
    const query = request.query as Record<string, string | undefined>;

    const sourceVal = query.source && query.source !== 'all' ? query.source : null;
    const customerIdVal = query.customerId && query.customerId !== 'all' ? query.customerId : null;

    try {
      const rows = await one<any[]>(
        tenantId,
        `SELECT fn_invoice_summary($1, $2, $3::date, $4::date, $5, $6, $7, $8) AS summary`,
        [
          tenantId,
          query.search || null,
          query.from || null,
          query.to || null,
          query.status || null,
          sourceVal,
          customerIdVal,
          query.branchId || null,
        ]
      );
      const summary = rows?.[0]?.summary || { count: 0, netTotal: 0, taxTotal: 0 };
      return summary;
    } catch {
      return reply.code(500).send({ error: 'internal_error' });
    }
  });

  /**
   * GET /sales/invoices/:id
   * Invoice detail (header + lines) strictly isolated by tenant.
   */
  app.get('/sales/invoices/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = assertTenant(request);
    assertCanViewInvoices(request, assertAction);
    const { id } = request.params as { id: string };

    try {
      const rows = await one<any[]>(
        tenantId,
        `SELECT fn_invoice_detail($1, $2) AS detail`,
        [tenantId, id]
      );
      const detail = rows?.[0]?.detail;
      if (!detail || !detail.header) {
        return reply.code(404).send({ error: 'invoice_not_found', invoiceId: id });
      }
      return detail;
    } catch {
      return reply.code(500).send({ error: 'internal_error' });
    }
  });

  /**
   * PUT /sales/invoices/:id
   * Edit invoice net amount & payment method with mandatory audit reason and version lock.
   */
  app.put('/sales/invoices/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = assertTenant(request);
    assertAction(request, 'record.save');
    const { id } = request.params as { id: string };

    const parsed = updateInvoiceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_payload', details: parsed.error.issues });
    }

    const actor = String(request.auth?.sub || 'api');
    try {
      const rows = await one<any[]>(
        tenantId,
        `SELECT fn_invoice_update($1, $2, $3::numeric, $4, $5, $6, $7) AS result`,
        [
          tenantId,
          id,
          parsed.data.netAmount,
          parsed.data.paymentMethod || null,
          parsed.data.reason,
          actor,
          parsed.data.expectedVersion,
        ]
      );
      const result = rows?.[0]?.result || {};
      return { ok: true, ...result };
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('conflict_version')) {
        return reply.code(409).send({ error: 'conflict_version', message: 'Invoice version modified concurrently' });
      }
      if (msg.includes('not_found')) {
        return reply.code(404).send({ error: 'invoice_not_found' });
      }
      return reply.code(400).send({ error: 'invoice_update_failed' });
    }
  });

  /**
   * POST /sales/invoices/:id/cancel
   * Cancel invoice with mandatory audit reason.
   */
  app.post('/sales/invoices/:id/cancel', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = assertTenant(request);
    assertAction(request, 'record.delete');
    const { id } = request.params as { id: string };

    const parsed = cancelInvoiceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_payload', details: parsed.error.issues });
    }

    const actor = String(request.auth?.sub || 'api');
    try {
      const rows = await one<any[]>(
        tenantId,
        `SELECT fn_invoice_cancel($1, $2, $3, $4) AS result`,
        [tenantId, id, parsed.data.reason, actor]
      );
      const result = rows?.[0]?.result || {};
      return { ok: true, ...result };
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('not_found')) {
        return reply.code(404).send({ error: 'invoice_not_found' });
      }
      return reply.code(400).send({ error: 'invoice_cancel_failed' });
    }
  });
}
