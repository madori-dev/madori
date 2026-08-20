import { AuthorizationError } from '@/lib/errors'
import type { PermissionGuard } from '@/lib/auth/guard'
import type { GraphQLContext } from '@/lib/graphql/resolvers'
import { createGraphQLError } from '@/lib/graphql/resolvers'
import { parseSeoDocument } from '@/lib/seo/domain'
import type { SeoRedirect } from '@/lib/seo/redirects'
import { SeoRevisionConflictError } from '@/lib/seo/storage'
import { toSeoGraphQLResolved, type SeoGraphQLPort, type SeoResolvedQuery, type SeoResolvedTermQuery } from './types'

export interface BuildSeoGraphQLResolversOptions {
  port: SeoGraphQLPort
  guard?: PermissionGuard
}

type Resolver = (parent: unknown, args: unknown, context: GraphQLContext) => Promise<unknown>

function safe<TArgs>(resolver: (args: TArgs) => Promise<unknown>): Resolver {
  return async (_parent, args) => {
    try {
      return await resolver(args as TArgs)
    } catch (error) {
      if (error instanceof AuthorizationError) throw createGraphQLError('Unauthorized', 'UNAUTHORIZED')
      if (error instanceof SeoRevisionConflictError) throw createGraphQLError('SEO record changed', 'CONFLICT')
      // Never surface parser, storage, or provenance details via GraphQL.
      throw createGraphQLError('Internal server error', 'INTERNAL_ERROR')
    }
  }
}

function protect(
  guard: PermissionGuard | undefined,
  resource: Parameters<PermissionGuard['wrapResolver']>[0],
  action: Parameters<PermissionGuard['wrapResolver']>[1],
  resolver: Resolver,
  scope?: (args: never) => string | undefined | Promise<string | undefined>,
): Resolver {
  if (!guard) return resolver
  const guarded = guard.wrapResolver(resource, action, resolver as never, scope) as Resolver
  return async (parent, args, context) => {
    try {
      return await guarded(parent, args, context)
    } catch (error) {
      if (error instanceof AuthorizationError) throw createGraphQLError('Unauthorized', 'UNAUTHORIZED')
      throw error
    }
  }
}

function documentResult(snapshot: { document: unknown; revision: string } | null) {
  return snapshot ? { data: snapshot.document, meta: { revision: snapshot.revision } } : null
}

function redirectResult(snapshot: { redirect: unknown; revision: string } | null) {
  return snapshot ? { data: snapshot.redirect, meta: { revision: snapshot.revision } } : null
}

/** Builds optional SEO fields. Existing schemas remain unchanged until a port is supplied. */
export function buildSeoGraphQLResolvers(options: BuildSeoGraphQLResolversOptions): Record<string, Resolver> {
  const { port, guard } = options
  const resolvers: Record<string, Resolver> = {}
  const readSeo = (resolver: Resolver, scope?: (args: never) => string | undefined) => protect(guard, 'seo', 'view', resolver, scope)

  resolvers.seoSite = readSeo(safe(async ({ site }: { site: string }) => documentResult(await port.getSite(site))), (args: { site: string }) => args.site)
  resolvers.seoSection = readSeo(safe(async ({ section, handle }: { section: 'collection' | 'taxonomy'; handle: string }) => documentResult(await port.getSection(section, handle))), (args: { handle: string }) => args.handle)
  resolvers.seoResolved = readSeo(safe(async (input: SeoResolvedQuery) => {
    const resolved = await port.resolve(input)
    return resolved ? toSeoGraphQLResolved(resolved) : null
  }), (args: SeoResolvedQuery) => args.site)
  if (port.resolveTerm) resolvers.seoResolvedTerm = readSeo(safe(async (input: SeoResolvedTermQuery) => {
    const resolved = await port.resolveTerm!(input)
    return resolved ? toSeoGraphQLResolved(resolved) : null
  }), (args: SeoResolvedTermQuery) => args.site)

  if (port.preview) {
    resolvers.seoPreview = readSeo(safe(async (input: SeoResolvedQuery) => {
      const resolved = await port.preview!(input)
      return resolved ? {
        data: toSeoGraphQLResolved(resolved),
        // Provenance is intentional only on permission-guarded preview endpoint.
        provenance: Object.entries(resolved.provenance).map(([field, source]) => ({ field, source })),
      } : null
    }), (args: SeoResolvedQuery) => args.site)
  }
  if (port.previewTerm) resolvers.seoPreviewTerm = readSeo(safe(async (input: SeoResolvedTermQuery) => {
    const resolved = await port.previewTerm!(input)
    return resolved ? {
      data: toSeoGraphQLResolved(resolved),
      provenance: Object.entries(resolved.provenance).map(([field, source]) => ({ field, source })),
    } : null
  }), (args: SeoResolvedTermQuery) => args.site)
  if (port.getReport) resolvers.seoReport = protect(guard, 'seo-reports', 'view', safe(async ({ id, site }: { id?: string; site?: string }) => port.getReport!(id, site)), (args: { site?: string }) => args.site)
  if (port.listRedirects) resolvers.seoRedirects = protect(guard, 'seo-redirects', 'view', safe(async ({ site }: { site?: string }) => (await port.listRedirects!(site)).map(redirectResult)), (args: { site?: string }) => args.site)
  if (port.getRedirect) resolvers.seoRedirect = protect(guard, 'seo-redirects', 'view', safe(async ({ id }: { id: string }) => redirectResult(await port.getRedirect!(id))), async (args: { id: string }) => (await port.getRedirect!(args.id))?.redirect.site)

  if (port.saveSite) resolvers.seoSaveSite = protect(guard, 'seo', 'edit', safe<{ document: unknown; expectedRevision?: string }>(async ({ document, expectedRevision }) => {
    const saved = await port.saveSite!(parseSeoDocument(document) as import('@/lib/seo/domain').SeoSiteDocument, expectedRevision)
    return documentResult(saved)
  }), (args: { document?: { site?: string } }) => args.document?.site)
  if (port.saveSection) resolvers.seoSaveSection = protect(guard, 'seo', 'edit', safe<{ document: unknown; expectedRevision?: string }>(async ({ document, expectedRevision }) => {
    const saved = await port.saveSection!(parseSeoDocument(document) as import('@/lib/seo/domain').SeoSectionDocument, expectedRevision)
    return documentResult(saved)
  }), (args: { document?: { handle?: string } }) => args.document?.handle)
  // Repository remains authoritative for configured external-origin policy and
  // performs strict runtime parsing before persistence.
  if (port.saveRedirect) resolvers.seoSaveRedirect = protect(guard, 'seo-redirects', 'edit', safe<{ redirect: unknown; expectedRevision?: string }>(async ({ redirect, expectedRevision }) => redirectResult(await port.saveRedirect!(redirect as SeoRedirect, expectedRevision))), (args: { redirect?: { site?: string } }) => args.redirect?.site)
  if (port.deleteRedirect) resolvers.seoDeleteRedirect = protect(guard, 'seo-redirects', 'delete', safe<{ id: string; expectedRevision?: string }>(async ({ id, expectedRevision }) => ({ deleted: await port.deleteRedirect!(id, expectedRevision) })), async (args: { id: string }) => (await port.getRedirect?.(args.id))?.redirect.site)
  return resolvers
}
