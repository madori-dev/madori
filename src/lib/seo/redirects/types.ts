/** Git-authored redirect records use a separate version from cascade documents. */
export const SEO_REDIRECT_VERSION = 1 as const

export type RedirectStatus = 301 | 302 | 307 | 308

export interface SeoRedirect {
  version: typeof SEO_REDIRECT_VERSION
  /** Opaque, filename-safe identifier; never derive this from a public URL. */
  id: string
  site: string
  source: string
  destination: string
  status: RedirectStatus
  enabled: boolean
}

export interface SeoRedirectSnapshot {
  redirect: SeoRedirect
  revision: string
  path: string
}

export interface RedirectWriteOptions {
  expectedRevision?: string
}

export interface RedirectResolution {
  destination: string
  status: RedirectStatus
  id: string
}

export interface NotFoundObservation {
  /** Opaque operational identifier. Never encode path, query, user, or IP data. */
  opaqueId: string
  site: string
  path: string
  /** Query content is deliberately never retained. */
  query: 'redacted' | null
  firstSeen: string
  lastSeen: string
  hits: number
  /** Only an HTTP(S) origin; paths, queries, credentials, and fragments are removed. */
  referrerOrigin: string | null
}

export interface NotFoundSnapshot {
  observations: readonly NotFoundObservation[]
  revision: string | null
  path: string
}

export interface ObserveNotFoundInput {
  site: string
  path: string
  /** Presence is recorded as `redacted`; value is discarded before persistence. */
  query?: string | null
  referrer?: string | null
  observedAt?: Date
}

export interface NotFoundRetentionOptions {
  maxRecords?: number
  retentionDays?: number
}
