import { normalizeRedirectSource } from './schema'
import type { RedirectResolution, SeoRedirect } from './types'

/** Pure, bounded redirect lookup. Redirect topology is enforced at write time. */
export function resolveRedirect(redirects: readonly SeoRedirect[], site: string, source: string): RedirectResolution | null {
  const normalized = normalizeRedirectSource(source)
  const match = redirects.find(redirect => redirect.enabled && redirect.site === site && redirect.source === normalized)
  return match ? { destination: match.destination, status: match.status, id: match.id } : null
}

export interface RedirectPromotionSuggestion {
  site: string
  source: string
  destination: string
  status: 301
  enabled: true
}

/** Creates a draft-safe redirect suggestion; repository validates final topology before promotion. */
export function promoteNotFoundObservation(site: string, source: string, destination: string): RedirectPromotionSuggestion {
  return { site, source: normalizeRedirectSource(source), destination, status: 301, enabled: true }
}
