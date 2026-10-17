/**
 * قراءة وتعديل الفواتير عبر خادم الـ API (Fastify)
 * ---------------------------------------------------------------------------
 * الأمان أولاً:
 * المتصفح لا يتصل بقاعدة البيانات مباشرة أبداً ولا يحمل بيانات اعتمادها.
 * جميع الطلبات تمر عبر خادم API الموثوق الذي يستخرج المستأجر (tenantId)
 * حصراً من الـ JWT Token، ويفرض سياسة عزل المستأجرين (RLS).
 *
 * في حال عدم تهيئة السيرفر، يتوفر مسار احتياطي للقراءة من الذاكرة المحلية (Offline/Local).
 */

import type { SalesInvoice } from '../types';
import {
  apiCancelInvoice,
  apiFetchInvoiceDetail,
  apiFetchInvoices,
  apiFetchInvoiceSummary,
  apiUpdateInvoice,
  isApiConfigured,
} from './apiClient';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/safeStorage';

const readLocal = <T>(key: string): T | null => {
  try {
    const raw = safeLocalStorageGet(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const writeLocal = (key: string, value: unknown): void => {
  try {
    safeLocalStorageSet(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
};

export interface InvoiceFilters {
  search?: string;
  from?: string;
  to?: string;
  status?: string;
  source?: string;
  customerId?: string;
  branchId?: string;
}

export interface InvoicePage {
  invoices: SalesInvoice[];
  nextAfterDate: string | null;
  nextAfterId: string | null;
  error?: string;
}

export interface InvoiceSummary {
  count: number;
  netTotal: number;
  taxTotal: number;
  error?: string;
}

export interface InvoiceDetail {
  header: SalesInvoice | null;
  lines: Array<Record<string, unknown>>;
  error?: string;
}

const toInvoice = (row: Record<string, any>): SalesInvoice => {
  const payload = (row.payload ?? {}) as Partial<SalesInvoice>;
  return {
    ...payload,
    id: String(row.id ?? payload.id ?? ''),
    tenantId: String(row.tenant_id ?? payload.tenantId ?? ''),
    invoiceNumber: String(row.invoice_number ?? payload.invoiceNumber ?? ''),
    customerId: String(row.customer_id ?? payload.customerId ?? ''),
    customerName: String(row.customer_name ?? payload.customerName ?? ''),
    items: Array.isArray(payload.items) ? payload.items : [],
    subtotal: Number(payload.subtotal ?? row.net_amount ?? 0),
    taxAmount: Number(row.tax_amount ?? payload.taxAmount ?? 0),
    discountAmount: Number(payload.discountAmount ?? 0),
    netAmount: Number(row.net_amount ?? payload.netAmount ?? 0),
    paymentMethod: String(payload.paymentMethod ?? ''),
    status: String(row.status ?? payload.status ?? 'Posted') as SalesInvoice['status'],
    createdAt: String(row.created_at ?? payload.createdAt ?? ''),
    source: String(row.source ?? payload.source ?? 'pos') as SalesInvoice['source'],
  } as SalesInvoice;
};

/** ترشيح محلي عند غياب خادم الـ API */
const filterLocalInvoices = (invoices: SalesInvoice[], filters: InvoiceFilters): SalesInvoice[] => {
  return invoices.filter((inv) => {
    if (filters.status && inv.status !== filters.status) return false;
    if (filters.source && filters.source !== 'all' && inv.source !== filters.source) return false;
    if (filters.customerId && filters.customerId !== 'all' && inv.customerId !== filters.customerId) return false;
    if (filters.branchId && inv.branchId && inv.branchId !== filters.branchId) return false;
    if (filters.from && inv.createdAt && inv.createdAt.slice(0, 10) < filters.from) return false;
    if (filters.to && inv.createdAt && inv.createdAt.slice(0, 10) > filters.to) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const matchNum = inv.invoiceNumber?.toLowerCase().includes(q);
      const matchCust = inv.customerName?.toLowerCase().includes(q);
      if (!matchNum && !matchCust) return false;
    }
    return true;
  });
};

export async function loadInvoicePage(paramsInput: {
  tenantId: string;
  filters: InvoiceFilters;
  limit?: number;
  afterDate?: string | null;
  afterId?: string | null;
}): Promise<InvoicePage> {
  if (isApiConfigured()) {
    const queryParams: Record<string, string> = {
      limit: String(paramsInput.limit ?? 50),
    };
    if (paramsInput.filters.search) queryParams.search = paramsInput.filters.search;
    if (paramsInput.filters.from) queryParams.from = paramsInput.filters.from;
    if (paramsInput.filters.to) queryParams.to = paramsInput.filters.to;
    if (paramsInput.filters.status) queryParams.status = paramsInput.filters.status;
    if (paramsInput.filters.source) queryParams.source = paramsInput.filters.source;
    if (paramsInput.filters.customerId) queryParams.customerId = paramsInput.filters.customerId;
    if (paramsInput.filters.branchId) queryParams.branchId = paramsInput.filters.branchId;
    if (paramsInput.afterDate) queryParams.afterDate = paramsInput.afterDate;
    if (paramsInput.afterId) queryParams.afterId = paramsInput.afterId;

    const res = await apiFetchInvoices(queryParams);
    if (res.ok && res.data) {
      const items = Array.isArray(res.data.items) ? res.data.items : [];
      return {
        invoices: items.map((item: Record<string, unknown>) => toInvoice(item)),
        nextAfterDate: res.data.nextAfterDate ? String(res.data.nextAfterDate).slice(0, 10) : null,
        nextAfterId: res.data.nextAfterId ? String(res.data.nextAfterId) : null,
      };
    }
  }

  // مسار احتياطي آمن: قراءة التخزين المحلي بدون الاتصال المباشر بقاعدة البيانات
  const localList = readLocal<SalesInvoice[]>('erp_invoices') || [];
  const filtered = filterLocalInvoices(localList, paramsInput.filters);
  const limit = paramsInput.limit ?? 50;
  return {
    invoices: filtered.slice(0, limit),
    nextAfterDate: null,
    nextAfterId: null,
  };
}

export async function loadInvoiceSummary(paramsInput: {
  tenantId: string;
  filters: InvoiceFilters;
}): Promise<InvoiceSummary> {
  if (isApiConfigured()) {
    const queryParams: Record<string, string> = {};
    if (paramsInput.filters.search) queryParams.search = paramsInput.filters.search;
    if (paramsInput.filters.from) queryParams.from = paramsInput.filters.from;
    if (paramsInput.filters.to) queryParams.to = paramsInput.filters.to;
    if (paramsInput.filters.status) queryParams.status = paramsInput.filters.status;
    if (paramsInput.filters.source) queryParams.source = paramsInput.filters.source;
    if (paramsInput.filters.customerId) queryParams.customerId = paramsInput.filters.customerId;
    if (paramsInput.filters.branchId) queryParams.branchId = paramsInput.filters.branchId;

    const res = await apiFetchInvoiceSummary(queryParams);
    if (res.ok && res.data) {
      return {
        count: Number(res.data.count ?? 0),
        netTotal: Number(res.data.netTotal ?? 0),
        taxTotal: Number(res.data.taxTotal ?? 0),
      };
    }
  }

  // مسار احتياطي محلي
  const localList = readLocal<SalesInvoice[]>('erp_invoices') || [];
  const filtered = filterLocalInvoices(localList, paramsInput.filters);
  const netTotal = filtered.reduce((sum, inv) => sum + (Number(inv.netAmount) || 0), 0);
  const taxTotal = filtered.reduce((sum, inv) => sum + (Number(inv.taxAmount) || 0), 0);
  return { count: filtered.length, netTotal, taxTotal };
}

export async function loadInvoiceDetail(tenantId: string, invoiceId: string): Promise<InvoiceDetail> {
  if (isApiConfigured()) {
    const res = await apiFetchInvoiceDetail(invoiceId);
    if (res.ok && res.data) {
      return {
        header: res.data.header ? toInvoice({ id: invoiceId, ...res.data.header }) : null,
        lines: Array.isArray(res.data.lines) ? res.data.lines : [],
      };
    }
  }

  const localList = readLocal<SalesInvoice[]>('erp_invoices') || [];
  const found = localList.find((inv) => inv.id === invoiceId) || null;
  return {
    header: found,
    lines: (found?.items || []) as unknown as Array<Record<string, unknown>>,
  };
}

/** تعديل فاتورة عبر الـ API الموثوق مع سبب إلزامي */
export async function updateInvoiceRow(params: {
  tenantId: string;
  invoiceId: string;
  netAmount: number;
  paymentMethod?: string;
  reason: string;
  expectedVersion?: number;
  actor?: string;
}): Promise<{ ok: boolean; version?: number; error?: string }> {
  if (isApiConfigured()) {
    const res = await apiUpdateInvoice(params.invoiceId, {
      netAmount: params.netAmount,
      paymentMethod: params.paymentMethod,
      reason: params.reason,
      expectedVersion: params.expectedVersion || 1,
    });
    if (res.ok) return { ok: true, version: res.data?.version };
    return { ok: false, error: res.error || 'update_failed' };
  }

  // تعديل محلي آمن
  const localList = readLocal<SalesInvoice[]>('erp_invoices') || [];
  const idx = localList.findIndex((i) => i.id === params.invoiceId);
  if (idx >= 0) {
    const updated = { ...localList[idx], netAmount: params.netAmount, paymentMethod: params.paymentMethod || localList[idx].paymentMethod };
    localList[idx] = updated;
    writeLocal('erp_invoices', localList);
    return { ok: true, version: 1 };
  }
  return { ok: false, error: 'invoice_not_found' };
}

/** إلغاء فاتورة عبر الـ API الموثوق مع سبب إلزامي */
export async function cancelInvoiceRow(params: {
  tenantId: string;
  invoiceId: string;
  reason: string;
  actor?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (isApiConfigured()) {
    const res = await apiCancelInvoice(params.invoiceId, params.reason);
    if (res.ok) return { ok: true };
    return { ok: false, error: res.error || 'cancel_failed' };
  }

  const localList = readLocal<SalesInvoice[]>('erp_invoices') || [];
  const idx = localList.findIndex((i) => i.id === params.invoiceId);
  if (idx >= 0) {
    localList[idx] = { ...localList[idx], status: 'Cancelled' };
    writeLocal('erp_invoices', localList);
    return { ok: true };
  }
  return { ok: false, error: 'invoice_not_found' };
}
