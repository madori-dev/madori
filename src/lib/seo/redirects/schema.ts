import { z } from 'zod'
import { normalizePublicPath } from '@/lib/sites'
import { SEO_REDIRECT_VERSION, type NotFoundObservation, type SeoRedirect } from './types'

const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const SITE_HANDLE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const CONTROL = /[\u0000-\u001F\u007F]/u

function safePath(value: string): string {
  try {
    return normalizePublicPath(value, 'never', { allowRoot: true })
  } catch {
    throw new Error('Redirect path must be a safe public path.')
  }
}

/** External destinations stay intentionally narrow: only absolute HTTP(S), no credentials. */
export interface RedirectDestinationPolicy {
  /** External targets are denied unless their exact origin appears here. */
  allowedExternalOrigins?: readonly string[]
}

function allowedOrigins(policy: RedirectDestinationPolicy): Set<string> {
  const values = policy.allowedExternalOrigins ?? []
  const origins = new Set<string>()
  for (const value of values) {
    try {
      const url = new URL(value)
      if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) origins.add(url.origin)
    } catch {
      // Invalid configured values cannot broaden redirect authority.
    }
  }
  return origins
}

export function normalizeRedirectDestination(value: string, policy: RedirectDestinationPolicy = {}): string {
  if (typeof value !== 'string' || value.length === 0 || CONTROL.test(value)) {
    throw new Error('Redirect destination is invalid.')
  }
  if (value.startsWith('/')) return safePath(value)

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('Redirect destination must be a safe path or absolute HTTP(S) URL.')
  }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password) {
    throw new Error('Redirect destination must be an HTTP(S) URL without credentials.')
  }
  if (!allowedOrigins(policy).has(parsed.origin)) {
    throw new Error('External redirect destinations are not allowed by policy.')
  }
  try {
    if (CONTROL.test(decodeURIComponent(`${parsed.pathname}${parsed.search}${parsed.hash}`))) {
      throw new Error('Redirect destination contains encoded control characters.')
    }
  } catch (error) {
    if (error instanceof URIError) throw new Error('Redirect destination contains invalid percent encoding.')
    throw error
  }
  return parsed.toString()
}

export function normalizeRedirectSource(value: string): string { return safePath(value) }

export function createSeoRedirectSchema(policy: RedirectDestinationPolicy = {}): z.ZodType<SeoRedirect> { return z.object({
  version: z.literal(SEO_REDIRECT_VERSION),
  id: z.string().regex(OPAQUE_ID, 'Redirect ID must be filename-safe.'),
  site: z.string().regex(SITE_HANDLE, 'Invalid site handle.'),
  source: z.string().transform(normalizeRedirectSource),
  destination: z.string().transform((value) => normalizeRedirectDestination(value, policy)),
  status: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]),
  enabled: z.boolean(),
}).strict() }

export const SeoRedirectSchema = createSeoRedirectSchema()

const IsoDate = z.string().datetime({ offset: true })
export const NotFoundObservationSchema: z.ZodType<NotFoundObservation> = z.object({
  opaqueId: z.string().regex(OPAQUE_ID),
  site: z.string().regex(SITE_HANDLE),
  path: z.string().transform((value) => safePath(value)),
  query: z.union([z.literal('redacted'), z.null()]),
  firstSeen: IsoDate,
  lastSeen: IsoDate,
  hits: z.number().int().positive(),
  referrerOrigin: z.string().url().nullable(),
}).strict().superRefine((value, context) => {
  if (value.referrerOrigin) {
    try {
      const parsed = new URL(value.referrerOrigin)
      if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
        context.addIssue({ code: 'custom', message: 'Referrer must contain only an HTTP(S) origin.', path: ['referrerOrigin'] })
      }
    } catch {
      context.addIssue({ code: 'custom', message: 'Invalid referrer origin.', path: ['referrerOrigin'] })
    }
  }
})

export function parseSeoRedirect(value: unknown, policy: RedirectDestinationPolicy = {}): SeoRedirect { return createSeoRedirectSchema(policy).parse(value) }
export function parseNotFoundObservations(value: unknown): NotFoundObservation[] {
  return z.array(NotFoundObservationSchema).parse(value)
}
