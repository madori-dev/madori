import { normalizePublicPath, normalizePublicSegment } from '@/lib/sites'

export type PublicContentRouteMatch =
  | { kind: 'collection'; handle: string; slug: string; route: string }
  | { kind: 'taxonomy'; handle: string; slug: string; route: string }

export interface PublicRouteDefinition {
  handle: string
  route?: string
}

type RankedRouteMatch = PublicContentRouteMatch & {
  score: number
  order: number
}

/**
 * Match a public path against the same route templates used to generate URLs.
 * More-specific configured routes win; default catch-all routes remain last.
 */
export function matchPublicContentRoutes(
  publicPath: string,
  collections: readonly PublicRouteDefinition[],
  taxonomies: readonly PublicRouteDefinition[],
): PublicContentRouteMatch[] {
  let normalizedPath: string
  try {
    normalizedPath = normalizePublicPath(publicPath, 'never')
  } catch {
    return []
  }

  const matches: RankedRouteMatch[] = []
  let order = 0

  for (const collection of collections) {
    const route = collection.route ?? '/{slug}'
    const slug = matchRouteTemplate(route, normalizedPath, {
      collection: collection.handle,
    })
    if (slug) {
      matches.push({
        kind: 'collection',
        handle: collection.handle,
        slug,
        route,
        score: routeSpecificity(route, collection.route !== undefined),
        order: order++,
      })
    }
  }

  for (const taxonomy of taxonomies) {
    const route = taxonomy.route ?? '/{taxonomy}/{slug}'
    const slug = matchRouteTemplate(route, normalizedPath, {
      taxonomy: taxonomy.handle,
    })
    if (slug) {
      matches.push({
        kind: 'taxonomy',
        handle: taxonomy.handle,
        slug,
        route,
        score: routeSpecificity(route, taxonomy.route !== undefined),
        order: order++,
      })
    }
  }

  return matches
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .map(({ score: _score, order: _order, ...match }) => match)
}

function matchRouteTemplate(
  template: string,
  publicPath: string,
  fixed: { collection?: string; taxonomy?: string },
): string | null {
  if (!template.startsWith('/') || template.includes('?') || template.includes('#') || template.includes('\\')) return null
  if (!template.includes('{slug}')) return null

  const supported = new Set(['slug', 'collection', 'taxonomy', 'parent_uri'])
  const tokens = [...template.matchAll(/\{([^}]+)\}/g)]
  if (tokens.some(token => !supported.has(token[1]))) return null

  let source = ''
  let cursor = 0
  let capturedSlug = false

  for (const token of tokens) {
    const index = token.index ?? 0
    const key = token[1]
    const literal = template.slice(cursor, index)

    if (key === 'parent_uri' && literal.endsWith('/')) {
      source += escapeRegExp(literal.slice(0, -1))
      source += '(?:/(?:[^/]+(?:/[^/]+)*))?'
    } else {
      source += escapeRegExp(literal)
      if (key === 'slug') {
        source += capturedSlug ? '\\k<slug>' : '(?<slug>[^/]+)'
        capturedSlug = true
      } else if (key === 'parent_uri') {
        source += '(?:[^/]+(?:/[^/]+)*)?'
      } else {
        const expected = fixed[key as 'collection' | 'taxonomy']
        if (!expected) return null
        source += escapeRegExp(normalizePublicSegment(expected))
      }
    }
    cursor = index + token[0].length
  }

  source += escapeRegExp(template.slice(cursor))

  let result: RegExpMatchArray | null
  try {
    result = publicPath.match(new RegExp(`^${source}/?$`))
  } catch {
    return null
  }
  const encodedSlug = result?.groups?.slug
  if (!encodedSlug) return null

  try {
    return decodeURIComponent(encodedSlug)
  } catch {
    return null
  }
}

function routeSpecificity(route: string, configured: boolean): number {
  const literalCharacters = route.replace(/\{[^}]+\}/g, '').length
  const segments = route.split('/').filter(Boolean).length
  return literalCharacters * 100 + segments * 10 + (configured ? 1 : 0)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
