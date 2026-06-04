/**
 * Sanitises a blueprint field handle into a valid GraphQL identifier.
 *
 * GraphQL identifiers must match: /^[_A-Za-z][_0-9A-Za-z]*$/
 *
 * Rules applied:
 * 1. Replace invalid characters (hyphens, dots, spaces, etc.) with underscores
 * 2. Prefix with underscore if the handle starts with a digit
 * 3. Prefix reserved GraphQL introspection names (__typename, __type, __schema) with "field_"
 * 4. Collapse consecutive underscores and trim trailing underscores
 * 5. Return "field" as fallback if the result would be empty
 */

/** Reserved GraphQL introspection names that cannot be used as field names. */
const RESERVED_GRAPHQL_NAMES = new Set(['__typename', '__type', '__schema'])

/** Valid GraphQL identifier pattern. */
const VALID_GRAPHQL_IDENTIFIER = /^[_A-Za-z][_0-9A-Za-z]*$/

/**
 * Check whether a string is already a valid GraphQL identifier.
 */
export function isValidGraphQLIdentifier(name: string): boolean {
  return VALID_GRAPHQL_IDENTIFIER.test(name)
}

/**
 * Sanitise a field handle to produce a valid GraphQL identifier.
 *
 * @param handle - The raw blueprint field handle
 * @returns A valid GraphQL field name
 */
export function sanitiseFieldHandle(handle: string): string {
  if (!handle || handle.trim().length === 0) {
    return '_field'
  }

  // Check for reserved GraphQL introspection names first
  if (RESERVED_GRAPHQL_NAMES.has(handle)) {
    return `field_${handle.replace(/^__/, '')}`
  }

  // Replace any character that isn't [A-Za-z0-9_] with an underscore
  let sanitised = handle.replace(/[^A-Za-z0-9_]/g, '_')

  // Collapse consecutive underscores
  sanitised = sanitised.replace(/_+/g, '_')

  // Remove trailing underscores
  sanitised = sanitised.replace(/_+$/, '')

  // If starts with a digit, prefix with underscore
  if (/^[0-9]/.test(sanitised)) {
    sanitised = `_${sanitised}`
  }

  // If empty after sanitisation, return fallback
  if (sanitised.length === 0) {
    return '_field'
  }

  return sanitised
}
