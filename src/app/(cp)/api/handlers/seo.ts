import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  SEO_DOCUMENT_VERSION,
  SeoValuesSchema,
  type SeoDocumentSnapshot,
  type SeoSiteDocument,
  type SeoSectionDocument,
} from '@/lib/seo/domain'
import type { FileSeoRepository } from '@/lib/seo/repositories'
import type { FileSeoRedirectRepository } from '@/lib/seo/redirects/redirect-repository'
import type { NotFoundObservationStore } from '@/lib/seo/redirects/not-found-observations'
import { parseSeoRedirect, type RedirectDestinationPolicy, type SeoRedirectSnapshot } from '@/lib/seo/redirects'
import { SeoRevisionConflictError, SeoStorageError } from '@/lib/seo/storage'

const MAX_BODY_BYTES = 256 * 1024
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const sectionSchema = z.enum(['collection', 'taxonomy'])
const contentPreviewSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('entry'), site: z.string().regex(SAFE_ID), collection: z.string().regex(SAFE_ID), slug: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*(?:\/[A-Za-z0-9][A-Za-z0-9_-]*)*$/), includeDraft: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('term'), site: z.string().regex(SAFE_ID), taxonomy: z.string().regex(SAFE_ID), slug: z.string().regex(SAFE_ID), includeDraft: z.boolean().optional() }).strict(),
])
const previewSchema = z.union([
  contentPreviewSchema,
  z.object({ site: z.string().regex(SAFE_ID) }).strict(),
  z.object({ section: sectionSchema, handle: z.string().regex(SAFE_ID), site: z.string().regex(SAFE_ID).optional() }).strict(),
])

export type SeoPreviewRequest = z.infer<typeof previewSchema>

export interface SeoRequestContext {
  /** Route layer supplies this when it has authenticated and authorized caller. */
  authorize: (request: Request, capability: SeoCapability) => boolean | Promise<boolean>
}

export type SeoCapability =
  | 'settings:read' | 'settings:write' | 'settings:delete'
  | 'preview:read' | 'report:read' | 'report:run' | 'redirect:read' | 'redirect:write' | 'redirect:delete'
  | 'not-found:read' | 'not-found:promote' | 'not-found:delete'

export interface SeoResolvedPreviewPort {
  resolve(input: SeoPreviewRequest, options?: { includeDraft?: boolean }): unknown | Promise<unknown>
}

export interface SeoReportPort {
  report?(input: { site?: string; page: number; perPage: number }): unknown | Promise<unknown>
  status?(input: { site?: string }): unknown | Promise<unknown>
  run?(input: { site?: string }): unknown | Promise<unknown>
}

export interface SeoHandlersDependencies {
  repository: Pick<FileSeoRepository, 'getSite' | 'listSites' | 'saveSite' | 'deleteSite' | 'getSection' | 'listSections' | 'saveSection' | 'deleteSection'>
  redirects: Pick<FileSeoRedirectRepository, 'get' | 'list' | 'save' | 'delete'>
  redirectPolicy?: RedirectDestinationPolicy
  notFound: Pick<NotFoundObservationStore, 'list'> & {
    delete?(opaqueId: string, expectedRevision?: string): Promise<boolean> | boolean
  }
  preview?: SeoResolvedPreviewPort
  reports?: SeoReportPort
  /** Optional promotion adapter. Kept narrow so route registration can own policy. */
  promoteNotFound?: (input: { site: string; source: string; destination: string; opaqueId?: string; status?: 301 | 302 | 307 | 308 }) => unknown | Promise<unknown>
}

type Snapshot = SeoDocumentSnapshot<SeoSiteDocument | SeoSectionDocument>

function requestId(request: Request): string {
  const supplied = request.headers.get('x-request-id')
  return supplied && /^[A-Za-z0-9._~-]{1,128}$/.test(supplied) ? supplied : `req_${randomUUID().replaceAll('-', '')}`
}

function ok<T>(request: Request, data: T, extra: Record<string, unknown> = {}, status = 200): NextResponse {
  return NextResponse.json({ data, meta: { requestId: requestId(request), version: 1, ...extra } }, { status })
}

function fail(request: Request, code: string, message: string, status: number, fields?: Record<string, string[]>): NextResponse {
  return NextResponse.json({ error: { code, message, ...(fields ? { fields } : {}) }, meta: { requestId: requestId(request) } }, { status })
}

function safe(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new InputError(`${label} is invalid`, { [label]: ['Must be a filename-safe identifier'] })
  return value
}

class InputError extends Error {
  constructor(message: string, readonly fields?: Record<string, string[]>) { super(message) }
}

function publicSnapshot(snapshot: Snapshot | SeoRedirectSnapshot | null): unknown {
  if (!snapshot) return null
  if ('document' in snapshot) return { ...snapshot.document, revision: snapshot.revision }
  return { ...snapshot.redirect, revision: snapshot.revision }
}

async function body(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_BODY_BYTES) throw new PayloadError()
  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new PayloadError()
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    return value as Record<string, unknown>
  } catch { throw new InputError('Request body must be valid JSON') }
}

class PayloadError extends Error {}

function page(request: Request): { page: number; perPage: number } {
  const url = new URL(request.url)
  const parse = (key: string, fallback: number, max: number) => {
    const value = url.searchParams.get(key)
    if (value === null) return fallback
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) throw new InputError(`Invalid ${key}`, { [key]: ['Must be a positive bounded integer'] })
    return parsed
  }
  return { page: parse('page', 1, 100_000), perPage: parse('perPage', 50, 100) }
}

export function createSeoHandlers(deps: SeoHandlersDependencies, context: SeoRequestContext) {
  async function allowed(request: Request, capability: SeoCapability): Promise<boolean> {
    return Boolean(await context.authorize(request, capability))
  }
  async function guard(request: Request, capability: SeoCapability): Promise<NextResponse | null> {
    return await allowed(request, capability) ? null : fail(request, 'FORBIDDEN', 'SEO operation is not authorized', 403)
  }
  async function run(request: Request, operation: () => Promise<NextResponse>): Promise<NextResponse> {
    try { return await operation() }
    catch (error) {
      if (error instanceof PayloadError) return fail(request, 'SEO_PAYLOAD_TOO_LARGE', 'Request payload is too large', 413)
      if (error instanceof InputError) return fail(request, 'SEO_INVALID_INPUT', error.message, 422, error.fields)
      if (error instanceof z.ZodError) {
        const fields: Record<string, string[]> = {}
        for (const issue of error.issues) {
          const key = String(issue.path[0] ?? 'body')
          fields[key] = [...(fields[key] ?? []), issue.message]
        }
        return fail(request, 'SEO_INVALID_INPUT', 'Request payload is invalid', 422, fields)
      }
      if (error instanceof SeoRevisionConflictError) return fail(request, 'SEO_REVISION_CONFLICT', 'SEO document changed; refresh before saving', 409)
      if (error instanceof SeoStorageError) return fail(request, 'SEO_STORAGE_ERROR', 'SEO storage operation failed', 500)
      return fail(request, 'SEO_OPERATION_FAILED', 'SEO operation failed', 500)
    }
  }
  async function settings(request: Request, operation: () => Promise<NextResponse>, capability: SeoCapability) {
    const denied = await guard(request, capability); return denied ?? run(request, operation)
  }
  function revision(input: Record<string, unknown>): string | undefined {
    const value = input.expectedRevision ?? input.revision
    if (value === undefined) return undefined
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new InputError('Revision is invalid', { revision: ['Must be a SHA-256 revision'] })
    return value
  }

  const handleGetSite = (request: Request, site: string) => settings(request, async () => {
    const result = await deps.repository.getSite(safe(site, 'site')); return result ? ok(request, publicSnapshot(result)) : fail(request, 'SEO_NOT_FOUND', 'SEO site settings not found', 404)
  }, 'settings:read')
  const handleListSites = (request: Request) => settings(request, async () => {
    const site = new URL(request.url).searchParams.get('site')
    const records = await deps.repository.listSites()
    return ok(request, records.filter(record => !site || record.document.site === site).map(publicSnapshot))
  }, 'settings:read')
  const handleSaveSite = (request: Request, site: string) => settings(request, async () => {
    const input = await body(request); const name = safe(site, 'site'); const seo = SeoValuesSchema.parse(input.seo ?? input)
    const result = await deps.repository.saveSite({ version: SEO_DOCUMENT_VERSION, kind: 'site', site: name, seo }, { expectedRevision: revision(input) })
    return ok(request, publicSnapshot(result), {}, 200)
  }, 'settings:write')
  const handleDeleteSite = (request: Request, site: string) => settings(request, async () => {
    const input = await body(request); const result = await deps.repository.deleteSite(safe(site, 'site'), { expectedRevision: revision(input) }); return ok(request, { deleted: result })
  }, 'settings:delete')

  const handleGetSection = (request: Request, section: string, handle: string) => settings(request, async () => {
    const kind = sectionSchema.parse(section); const result = await deps.repository.getSection(kind, safe(handle, 'handle')); return result ? ok(request, publicSnapshot(result)) : fail(request, 'SEO_NOT_FOUND', 'SEO section settings not found', 404)
  }, 'settings:read')
  const handleListSections = (request: Request, section: string) => settings(request, async () => ok(request, (await deps.repository.listSections(sectionSchema.parse(section))).map(publicSnapshot)), 'settings:read')
  const handleSaveSection = (request: Request, section: string, handle: string) => settings(request, async () => {
    const input = await body(request); const kind = sectionSchema.parse(section); const seo = SeoValuesSchema.parse(input.seo ?? input)
    const result = await deps.repository.saveSection({ version: SEO_DOCUMENT_VERSION, kind: 'section', section: kind, handle: safe(handle, 'handle'), seo }, { expectedRevision: revision(input) }); return ok(request, publicSnapshot(result))
  }, 'settings:write')
  const handleDeleteSection = (request: Request, section: string, handle: string) => settings(request, async () => {
    const input = await body(request); const result = await deps.repository.deleteSection(sectionSchema.parse(section), safe(handle, 'handle'), { expectedRevision: revision(input) }); return ok(request, { deleted: result })
  }, 'settings:delete')

  const handleResolvedPreview = (request: Request) => settings(request, async () => {
    if (!deps.preview) return fail(request, 'SEO_UNAVAILABLE', 'SEO preview is not configured', 501)
    const input = previewSchema.parse(await body(request)); const includeDraft = 'includeDraft' in input && input.includeDraft === true
    if (includeDraft && !(await allowed(request, 'settings:write'))) return fail(request, 'FORBIDDEN', 'Draft preview is not authorized', 403)
    return ok(request, await deps.preview.resolve(input, { includeDraft }), { sources: true })
  }, 'preview:read')
  const handleGetReport = (request: Request) => settings(request, async () => {
    if (!deps.reports?.report) return fail(request, 'SEO_UNAVAILABLE', 'SEO report is not configured', 501); const range = page(request); const site = new URL(request.url).searchParams.get('site') ?? undefined
    return ok(request, await deps.reports.report({ site, ...range }), range)
  }, 'report:read')
  const handleGetStatus = (request: Request) => settings(request, async () => deps.reports?.status ? ok(request, await deps.reports.status({ site: new URL(request.url).searchParams.get('site') ?? undefined })) : fail(request, 'SEO_UNAVAILABLE', 'SEO status is not configured', 501), 'report:read')
  const handleRunReport = (request: Request) => settings(request, async () => {
    if (!deps.reports?.run) return fail(request, 'SEO_UNAVAILABLE', 'SEO report runner is not configured', 501)
    const input = await body(request)
    if (input.site !== undefined) safe(input.site, 'site')
    return ok(request, await deps.reports.run({ site: input.site as string | undefined }), {}, 201)
  }, 'report:run')

  const handleListRedirects = (request: Request) => settings(request, async () => { const site = new URL(request.url).searchParams.get('site') ?? undefined; return ok(request, (await deps.redirects.list(site)).map(publicSnapshot)) }, 'redirect:read')
  const handleGetRedirect = (request: Request, id: string) => settings(request, async () => { const result = await deps.redirects.get(safe(id, 'id')); return result ? ok(request, publicSnapshot(result)) : fail(request, 'SEO_NOT_FOUND', 'SEO redirect not found', 404) }, 'redirect:read')
  const handleSaveRedirect = (request: Request) => settings(request, async () => { const input = await body(request); const redirect = parseSeoRedirect(input.redirect ?? input, deps.redirectPolicy); const result = await deps.redirects.save(redirect, { expectedRevision: revision(input) }); return ok(request, publicSnapshot(result)) }, 'redirect:write')
  const handleDeleteRedirect = (request: Request, id: string) => settings(request, async () => { const input = await body(request); return ok(request, { deleted: await deps.redirects.delete(safe(id, 'id'), { expectedRevision: revision(input) }) }) }, 'redirect:delete')
  const handleListNotFound = (request: Request) => settings(request, async () => { const result = await deps.notFound.list(); const range = page(request); const site = new URL(request.url).searchParams.get('site'); const filtered = result.observations.filter(item => !site || item.site === site); const values = [...filtered].slice((range.page - 1) * range.perPage, range.page * range.perPage); return ok(request, values, { ...range, total: filtered.length, storage: 'operational' }) }, 'not-found:read')
  const handlePromoteNotFound = (request: Request) => settings(request, async () => { if (!deps.promoteNotFound) return fail(request, 'SEO_UNAVAILABLE', '404 promotion is not configured', 501); const input = await body(request); if (typeof input.site !== 'string' || typeof input.source !== 'string' || typeof input.destination !== 'string') throw new InputError('site, source, and destination are required'); return ok(request, await deps.promoteNotFound({ site: safe(input.site, 'site'), source: input.source, destination: input.destination, ...(typeof input.opaqueId === 'string' ? { opaqueId: safe(input.opaqueId, 'opaqueId') } : {}), status: input.status as 301 | 302 | 307 | 308 })) }, 'not-found:promote')
  const handleDeleteNotFound = (request: Request, id: string) => settings(request, async () => { if (!deps.notFound.delete) return fail(request, 'SEO_UNAVAILABLE', '404 deletion is not configured', 501); const input = await body(request); return ok(request, { deleted: await deps.notFound.delete(safe(id, 'id'), revision(input)) }) }, 'not-found:delete')

  return { handleGetSite, handleListSites, handleSaveSite, handleDeleteSite, handleGetSection, handleListSections, handleSaveSection, handleDeleteSection, handleResolvedPreview, handleGetReport, handleGetStatus, handleRunReport, handleListRedirects, handleGetRedirect, handleSaveRedirect, handleDeleteRedirect, handleListNotFound, handlePromoteNotFound, handleDeleteNotFound }
}

export type SeoHandlers = ReturnType<typeof createSeoHandlers>
