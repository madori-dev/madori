import { matchGlob } from './glob'

/**
 * Determines whether a URL should bypass caching.
 * CP routes are always excluded. User-defined patterns from
 * staticCache.exclude are matched using glob syntax.
 */
export function isExcluded(
  urlPath: string,
  excludePatterns: string[],
  cpPath: string
): boolean {
  // CP routes are always excluded
  if (urlPath.startsWith(cpPath)) return true

  // Check user-defined exclusion patterns
  for (const pattern of excludePatterns) {
    if (matchGlob(pattern, urlPath)) return true
  }

  return false
}
