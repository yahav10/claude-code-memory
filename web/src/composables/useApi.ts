const BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (options?.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${url}`, {
    headers,
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  // Dashboard
  getDashboard: () => fetchJson<any>('/dashboard'),
  getTimeline: (days = 30) => fetchJson<any[]>(`/dashboard/timeline?days=${days}`),

  // Decisions
  getDecisions: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return fetchJson<any>(`/decisions?${qs}`);
  },
  getDecision: (id: number) => fetchJson<any>(`/decisions/${id}`),
  updateDecision: (id: number, data: Record<string, any>) =>
    fetchJson<any>(`/decisions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Sessions
  getSessions: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return fetchJson<any>(`/sessions?${qs}`);
  },
  getSession: (id: string) => fetchJson<any>(`/sessions/${id}`),

  // Settings
  getDatabaseInfo: () => fetchJson<any>('/settings/database'),
  vacuum: () => fetchJson<any>('/settings/vacuum', { method: 'POST' }),
  rebuildFts: () => fetchJson<any>('/settings/rebuild-fts', { method: 'POST' }),

  // Export
  exportData: (format: string) => fetchJson<any>(`/export?format=${format}`),

  // Import Sessions
  scanSessions: () => fetchJson<any>('/import/scan', { method: 'POST' }),
  runImport: (opts?: { skipExtraction?: boolean }) =>
    fetchJson<any>('/import/run', {
      method: 'POST',
      body: JSON.stringify(opts || {}),
    }),

  // Analytics
  getAnalyticsQuality: () => fetchJson<any>('/analytics/quality'),
  getAnalyticsPatterns: () => fetchJson<any>('/analytics/patterns'),
  getAnalyticsCodebase: () => fetchJson<any>('/analytics/codebase'),
  getAnalyticsCoach: () => fetchJson<any>('/analytics/coach', { method: 'POST' }),
};
