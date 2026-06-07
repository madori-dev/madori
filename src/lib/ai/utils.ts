/**
 * Masks an API key so it is never fully exposed in the UI.
 *
 * - Keys longer than 8 characters: show first 4 + '••••' + last 4
 * - Keys 8 characters or shorter: fully masked as '••••••••'
 */
export function maskApiKey(key: string): string {
  if (key.length <= 8) return '••••••••'
  return key.slice(0, 4) + '••••' + key.slice(-4)
}
