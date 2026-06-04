/**
 * Glob pattern matching utility for URL pattern matching
 * in exclusion rules and invalidation patterns.
 */

/**
 * Converts a glob pattern to a RegExp.
 * Supports `*` as a wildcard matching any sequence of characters.
 * All other regex special characters are escaped.
 */
export function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`)
}

/**
 * Tests whether a value matches a glob pattern.
 * Uses `*` as a wildcard that matches any sequence of characters.
 */
export function matchGlob(pattern: string, value: string): boolean {
  return globToRegex(pattern).test(value)
}
