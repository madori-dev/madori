/**
 * Client-safe asset display utilities.
 * These are pure functions with no Node.js dependencies,
 * safe to import in 'use client' components.
 */

/**
 * Determine whether an asset should be displayed as a thumbnail or icon
 * based on its MIME type.
 */
export function getDisplayMode(mimeType: string): 'thumbnail' | 'icon' {
  return mimeType.startsWith('image/') ? 'thumbnail' : 'icon'
}

/**
 * Get the appropriate file-type icon name for a given MIME type.
 */
export function getFileTypeIcon(mimeType: string): string {
  const iconMap: Record<string, string> = {
    'application/pdf': 'file-text',
    'application/zip': 'archive',
    'video/': 'video',
    'audio/': 'music',
  }
  for (const [prefix, icon] of Object.entries(iconMap)) {
    if (mimeType.startsWith(prefix)) return icon
  }
  return 'file'
}
