import * as path from 'path'

/**
 * Derives an entity handle from a filename by stripping the file extension.
 * E.g. "my-taxonomy.yaml" → "my-taxonomy", "settings.json" → "settings"
 */
export function deriveHandle(filename: string): string {
  return path.basename(filename, path.extname(filename))
}
