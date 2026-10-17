/**
 * API client (عميل الواجهة البرمجية).
 *
 * The browser must never hold database credentials again: when an API URL is
 * configured every read/write goes through the backend, which authenticates the user,
 * derives the tenant from the token and applies Row-Level Security.
 *
 * While `erp_api_url` is not configured the app keeps using the legacy direct
 * connection so nothing breaks during the migration.
 */

const API_URL_KEY = 'erp_api_url';
const API_TOKEN_KEY = 'erp_api_token';
const API_USER_KEY = 'erp_api_user';

export interface ApiUser {
  id: string;
  tenantId: string;
  role: string;
}

export const getApiUrl = (): string => {
  try {
    return String(localStorage.getItem(API_URL_KEY) || '').replace(/\/+$/, '');
  } catch {
    return '';
  }
};

export const isApiConfigured = (): boolean => getApiUrl().length > 0;

export const getApiToken = (): string => {
  try {
    return String(localStorage.getItem(API_TOKEN_KEY) || '');
  } catch {
    return '';
  }
};

export const getApiUser = (): ApiUser | null => {
  try {
    const raw = localStorage.getItem(API_USER_KEY);
    return raw ? (JSON.parse(raw) as ApiUser) : null;
  } catch {
    return null;
  }
};

export const setApiUrl = (url: string): void => {
  try {
    const clean = url.trim().replace(/\/+$/, '');
    if (clean) localStorage.setItem(API_URL_KEY, clean);
    else localStorage.removeItem(API_URL_KEY);
  } catch {
    /* ignore */
  }
};

export const clearApiSession = (): void => {
  try {
    localStorage.removeItem(API_TOKEN_KEY);
    localStorage.removeItem(API_USER_KEY);
  } catch {
    /* ignore */
  }
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  /** When false a missing token is allowed (login/health). */
  requiresAuth?: boolean;
}

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<{ ok: boolean; data?: T; status?: number; error?: string }> {
  const base = getApiUrl();
  if (!base) return { ok: false, error: 'api_not_configured' };
  const token = getApiToken();
  if (options.requiresAuth !== false && !token) return { ok: false, error: 'missing_token' };
  try {
    const response = await fetch(`${base}${path}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : ({} as T);
    if (!response.ok) {
      if (response.status === 401) clearApiSession();
      const payload = data as { message?: string; error?: string } | null;
      return { ok: false, status: response.status, error: payload?.message || payload?.error || `http_${response.status}` };
    }
    return { ok: true, status: response.status, data: data as T };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'network_error' };
  }
}

/** Signs in and stores the session token. */
export async function apiLogin(username: string, password: string, tenantId?: string): Promise<{ success: boolean; user?: ApiUser; error?: string }> {
  const result = await apiRequest<{ token: string; user: ApiUser }>('/auth/login', {
    method: 'POST',
    body: { username, password, tenantId },
    requiresAuth: false,
  });
  if (!result.ok || !result.data?.token) {
    return { success: false, error: result.error || 'login_failed' };
  }
  try {
    localStorage.setItem(API_TOKEN_KEY, result.data.token);
    localStorage.setItem(API_USER_KEY, JSON.stringify(result.data.user));
  } catch {
    /* ignore */
  }
  return { success: true, user: result.data.user };
}

export const apiHealth = () => apiRequest<{ status: string; database: string }>('/health', { requiresAuth: false });

/** Live records of one dataset (soft-deleted excluded). */
export const apiFetchRecords = (docKey: string, after?: string) =>
  apiRequest<{ records: any[]; nextAfter: string | null }>(
    `/records/${encodeURIComponent(docKey)}${after ? `?after=${encodeURIComponent(after)}` : ''}`
  );

/** Records changed since a cursor. */
export const apiFetchChanges = (docKey: string, since: string) =>
  apiRequest<{ records: any[]; deletedIds: string[]; nextCursor: string }>(
    `/records/${encodeURIComponent(docKey)}/changes?since=${encodeURIComponent(since)}`
  );

export const apiUpsertRecords = (docKey: string, records: unknown[]) =>
  apiRequest<{ upserted: number }>(`/records/${encodeURIComponent(docKey)}`, { method: 'POST', body: { records } });

export const apiDeleteRecords = (docKey: string, ids: string[]) =>
  apiRequest<{ deleted: number }>(`/records/${encodeURIComponent(docKey)}/delete`, { method: 'POST', body: { ids } });

export const apiPostJournal = (payload: unknown) =>
  apiRequest<{ journalId: string }>('/accounting/journal', { method: 'POST', body: payload });

export const apiReverseJournal = (journalId: string, reason: string) =>
  apiRequest<{ journalId: string }>(`/accounting/journal/${encodeURIComponent(journalId)}/reverse`, {
    method: 'POST',
    body: { reason },
  });

export const apiPostReceipt = (payload: unknown) =>
  apiRequest<{ result: any }>('/accounting/receipt', { method: 'POST', body: payload });

export const apiFetchBalances = () =>
  apiRequest<{ balances: { code: string; name_ar: string; account_type: string; balance: string }[] }>('/accounting/balances');

export const apiFetchInvoices = (queryParams: Record<string, string>) => {
  const query = new URLSearchParams(queryParams).toString();
  return apiRequest<any>(`/sales/invoices${query ? `?${query}` : ''}`);
};

export const apiFetchInvoiceSummary = (queryParams: Record<string, string>) => {
  const query = new URLSearchParams(queryParams).toString();
  return apiRequest<any>(`/sales/invoices/summary${query ? `?${query}` : ''}`);
};

export const apiFetchInvoiceDetail = (invoiceId: string) =>
  apiRequest<any>(`/sales/invoices/${encodeURIComponent(invoiceId)}`);

export const apiUpdateInvoice = (invoiceId: string, payload: { netAmount: number; paymentMethod?: string; reason: string; expectedVersion?: number }) =>
  apiRequest<{ ok: boolean; version?: number }>(`/sales/invoices/${encodeURIComponent(invoiceId)}`, {
    method: 'PUT',
    body: payload,
  });

export const apiCancelInvoice = (invoiceId: string, reason: string) =>
  apiRequest<{ ok: boolean }>(`/sales/invoices/${encodeURIComponent(invoiceId)}/cancel`, {
    method: 'POST',
    body: { reason },
  });
