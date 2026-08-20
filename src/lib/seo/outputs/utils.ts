export function isAbsoluteHttpUrl(value: string | undefined): value is string {
  if (!value) return false

  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
  } catch {
    return false
  }
}

export function requireAbsoluteHttpUrl(value: string, field: string): string {
  if (!isAbsoluteHttpUrl(value)) {
    throw new Error(`${field} must be an absolute HTTP(S) URL`)
  }

  return value
}

export function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function isoDate(value: string | Date | undefined): string | undefined {
  if (!value) return undefined
  const date = typeof value === 'string' ? new Date(value) : value
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

export function stableId(url: string, fragment: string): string {
  return `${url.replace(/#.*$/, '')}#${fragment}`
}
