export interface UrlNormalizerOptions {
  queryStrings: 'ignore' | 'separate'
}

export function normalizeCacheKey(
  urlPath: string,
  options: UrlNormalizerOptions
): string {
  const url = new URL(urlPath, 'http://localhost')
  let normalized = url.pathname.replace(/\/+$/, '') || '/'

  if (options.queryStrings === 'separate' && url.search) {
    const params = new URLSearchParams(url.search)
    const sorted = new URLSearchParams([...params.entries()].sort())
    normalized += `?${sorted.toString()}`
  }

  return normalized
}
