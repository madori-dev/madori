export interface SeoApiMeta {
  requestId?: string
  version?: number
  page?: number
  perPage?: number
  total?: number
  [key: string]: unknown
}

export interface SeoApiError {
  code: string
  message: string
  fields?: Record<string, string[]>
}

export interface SeoApiEnvelope<T> {
  data: T
  meta: SeoApiMeta
}

export class SeoApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: SeoApiError,
  ) {
    super(message)
    this.name = 'SeoApiRequestError'
  }
}

export type SeoSource =
  | { kind: 'inherit' | 'disabled' }
  | { kind: 'literal' | 'field' | 'template'; value: string }

export interface SeoValues {
  enabled?: boolean
  title?: SeoSource
  description?: SeoSource
  canonical?: SeoSource
  robots?: { indexing?: 'index' | 'noindex'; following?: 'follow' | 'nofollow'; noarchive?: boolean; noimageindex?: boolean; nosnippet?: boolean }
  social?: { image?: SeoSource; imageAlt?: SeoSource; twitterCard?: 'summary' | 'summary_large_image'; twitterSite?: string; twitterCreator?: string }
  sitemap?: { enabled?: boolean; priority?: number; changeFrequency?: string }
  jsonLd?: { enabled?: boolean; type?: string; custom?: Record<string, unknown> }
}

export interface SeoSettingsDocument {
  version: number
  kind: 'site' | 'section'
  site?: string
  section?: 'collection' | 'taxonomy'
  handle?: string
  seo: SeoValues
  revision?: string
}

export interface SeoIssue {
  id: string
  severity: 'error' | 'warning' | 'notice' | string
  title: string
  description?: string
  url?: string
  type?: string
}

export interface SeoRedirect {
  id: string
  site: string
  source: string
  destination: string
  status: 301 | 302 | 307 | 308
  enabled: boolean
  revision?: string
}

export interface NotFoundObservation {
  opaqueId: string
  site: string
  path: string
  hits: number
  firstSeenAt?: string
  lastSeenAt?: string
  referrerOrigin?: string
}

async function request<T>(url: string, init?: RequestInit): Promise<SeoApiEnvelope<T>> {
  const response = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  })
  const payload = await response.json().catch(() => null) as Partial<SeoApiEnvelope<T>> & { error?: SeoApiError } | null
  if (!response.ok) {
    throw new SeoApiRequestError(payload?.error?.message ?? `SEO request failed (${response.status})`, response.status, payload?.error)
  }
  if (!payload || !('data' in payload) || !payload.meta) throw new SeoApiRequestError('SEO response is malformed', response.status)
  return payload as SeoApiEnvelope<T>
}

export const seoApi = {
  status: () => request<Record<string, unknown>>('/api/seo/status'),
  report: (params = new URLSearchParams()) => request<{ issues?: SeoIssue[]; results?: SeoIssue[] } | SeoIssue[]>(`/api/seo/report${params.size ? `?${params}` : ''}`),
  runReport: (site?: string) => request<Record<string, unknown>>('/api/seo/report/run', { method: 'POST', body: JSON.stringify(site ? { site } : {}) }),
  sites: () => request<SeoSettingsDocument[]>('/api/seo/sites'),
  site: (site: string) => request<SeoSettingsDocument>(`/api/seo/sites/${encodeURIComponent(site)}`),
  saveSite: (site: string, seo: SeoValues, expectedRevision?: string) => request<SeoSettingsDocument>(`/api/seo/sites/${encodeURIComponent(site)}`, { method: 'POST', body: JSON.stringify({ seo, expectedRevision }) }),
  deleteSite: (site: string, expectedRevision?: string) => request<{ deleted: boolean }>(`/api/seo/sites/${encodeURIComponent(site)}`, { method: 'DELETE', body: JSON.stringify({ expectedRevision }) }),
  sections: (kind: 'collection' | 'taxonomy') => request<SeoSettingsDocument[]>(`/api/seo/sections/${kind}`),
  section: (kind: 'collection' | 'taxonomy', handle: string) => request<SeoSettingsDocument>(`/api/seo/sections/${kind}/${encodeURIComponent(handle)}`),
  saveSection: (kind: 'collection' | 'taxonomy', handle: string, seo: SeoValues, expectedRevision?: string) => request<SeoSettingsDocument>(`/api/seo/sections/${kind}/${encodeURIComponent(handle)}`, { method: 'POST', body: JSON.stringify({ seo, expectedRevision }) }),
  deleteSection: (kind: 'collection' | 'taxonomy', handle: string, expectedRevision?: string) => request<{ deleted: boolean }>(`/api/seo/sections/${kind}/${encodeURIComponent(handle)}`, { method: 'DELETE', body: JSON.stringify({ expectedRevision }) }),
  preview: (input: Record<string, unknown>) => request<Record<string, unknown>>('/api/seo/preview', { method: 'POST', body: JSON.stringify(input) }),
  redirects: (site?: string) => request<SeoRedirect[]>(`/api/seo/redirects${site ? `?site=${encodeURIComponent(site)}` : ''}`),
  saveRedirect: (redirect: SeoRedirect, expectedRevision?: string) => request<SeoRedirect>('/api/seo/redirects', { method: 'POST', body: JSON.stringify({ redirect, expectedRevision }) }),
  deleteRedirect: (id: string, expectedRevision?: string) => request<{ deleted: boolean }>(`/api/seo/redirects/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ expectedRevision }) }),
  notFound: () => request<NotFoundObservation[]>('/api/seo/not-found'),
  promoteNotFound: (input: { site: string; source: string; destination: string; opaqueId?: string; status: 301 | 302 | 307 | 308 }) => request<unknown>('/api/seo/not-found/promote', { method: 'POST', body: JSON.stringify(input) }),
  deleteNotFound: (opaqueId: string) => request<{ deleted: boolean }>(`/api/seo/not-found/${encodeURIComponent(opaqueId)}`, { method: 'DELETE', body: JSON.stringify({}) }),
}

export function apiErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to complete SEO request'
}
