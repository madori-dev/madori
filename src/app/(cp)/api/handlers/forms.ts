import { NextRequest, NextResponse } from 'next/server'
import { FormOperations } from '@/lib/content/forms'
import { NotFoundError } from '@/lib/errors'
import { getInvalidationEngine } from '@/lib/static-cache/instance'
import { validateFields } from '@/lib/validation/rules'
import type { BlueprintRegistry } from '@/lib/blueprints/registry'
import type { FieldConfig } from '@/lib/blueprints/types'
import type { DefinitionLoader } from '@/lib/definitions/loader'
import type { FormDefinition } from '@/lib/definitions/schemas'
import { evaluateCondition, filterPayloadByVisibility } from '@/lib/blueprints/visibility'

const MAX_FORM_PAYLOAD_BYTES = 64 * 1024
const MAX_SUBMISSIONS_PER_WINDOW = 10
const MAX_UNTRUSTED_SUBMISSIONS_PER_WINDOW = 100
const RATE_WINDOW_MS = 60_000
const MAX_RATE_LIMIT_KEYS = 10_000
const submissionsByClient = new Map<string, number[]>()

export function resetFormSubmissionRateLimit(): void {
  submissionsByClient.clear()
}

export interface FormHandlerOptions {
  /** Set only when deployment infrastructure sanitises forwarding headers. */
  trustedProxy?: boolean
}

export function formRateLimitKey(request: NextRequest, trustedProxy = false, scope = 'forms'): string {
  // Forwarding headers are client-controlled unless a configured proxy strips
  // and rewrites them. A shared fallback is intentionally restrictive.
  if (!trustedProxy) return `global:${scope}`
  const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'global'
  return `${scope}:${client}`
}

function isRateLimited(client: string, limit: number, now = Date.now()): boolean {
  if (submissionsByClient.size >= MAX_RATE_LIMIT_KEYS && !submissionsByClient.has(client)) {
    // Bound memory under spoofed client identifiers.
    for (const [key, timestamps] of submissionsByClient) {
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] <= now - RATE_WINDOW_MS) submissionsByClient.delete(key)
      if (submissionsByClient.size < MAX_RATE_LIMIT_KEYS) break
    }
    if (submissionsByClient.size >= MAX_RATE_LIMIT_KEYS) return true
  }
  const recent = (submissionsByClient.get(client) ?? []).filter((time) => time > now - RATE_WINDOW_MS)
  if (recent.length >= limit) {
    submissionsByClient.set(client, recent)
    return true
  }
  recent.push(now)
  submissionsByClient.set(client, recent)
  return false
}

async function readFormBody(request: NextRequest): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_FORM_PAYLOAD_BYTES) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))))
}

export function createFormHandlers(
  formOps: FormOperations,
  blueprintRegistry?: BlueprintRegistry,
  options: FormHandlerOptions = {},
  definitionLoader?: DefinitionLoader,
) {
  async function handleListForms(): Promise<NextResponse> {
    const forms = await formOps.listForms()
    return NextResponse.json({ data: forms })
  }

  async function handleGetForm(
    _request: NextRequest,
    handle: string
  ): Promise<NextResponse> {
    const form = await formOps.getForm(handle)
    if (!form) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Form "${handle}" not found` } },
        { status: 404 }
      )
    }
    return NextResponse.json({ data: form })
  }

  async function handleSubmitForm(
    request: NextRequest,
    handle: string
  ): Promise<NextResponse> {
    const declaredLength = Number(request.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_FORM_PAYLOAD_BYTES) {
      return NextResponse.json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Form submission is too large' } }, { status: 413 })
    }

    // Do not allocate a rate-limit bucket for arbitrary, nonexistent handles.
    // Otherwise an attacker can exhaust the bounded map before a real form is
    // submitted and make its first request appear rate-limited.
    const form = await formOps.getForm(handle)
    if (!form) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Form "${handle}" not found` } },
        { status: 404 }
      )
    }

    const submissionLimit = options.trustedProxy
      ? MAX_SUBMISSIONS_PER_WINDOW
      : MAX_UNTRUSTED_SUBMISSIONS_PER_WINDOW
    if (isRateLimited(formRateLimitKey(request, options.trustedProxy, handle), submissionLimit)) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many form submissions. Try again shortly.' } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(RATE_WINDOW_MS / 1000)) } }
      )
    }

    const rawBody = await readFormBody(request)
    if (rawBody === null) {
      return NextResponse.json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Form submission is too large' } }, { status: 413 })
    }
    let body: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(rawBody)
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Invalid form body')
      body = parsed as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Form submission must be a JSON object' } }, { status: 422 })
    }

    try {
      // Validate submission data against the form blueprint's field definitions
      if (blueprintRegistry) {
        const definition = definitionLoader
          ? await definitionLoader.load<FormDefinition>('forms', handle).catch(() => null)
          : null
        const blueprint = await blueprintRegistry.getBlueprint('forms', definition?.blueprint ?? handle)
        if (blueprint) {
          // Extract all field configs from the blueprint (across all tabs/sections)
          const fieldConfigs: Record<string, FieldConfig> = {}
          for (const tab of Object.values(blueprint.tabs)) {
            for (const fieldDef of tab.fields) {
              fieldConfigs[fieldDef.handle] = fieldDef.field
            }
            if (tab.sections) {
              for (const section of Object.values(tab.sections)) {
                for (const fieldDef of section.fields) {
                  fieldConfigs[fieldDef.handle] = fieldDef.field
                }
              }
            }
          }

          if (Object.keys(fieldConfigs).length > 0) {
            const visibleConfigs = Object.fromEntries(Object.entries(fieldConfigs).filter(([, field]) => !field.visibility || evaluateCondition(field.visibility, body)))
            const result = validateFields(visibleConfigs, body)
            if (!result.valid) {
              return NextResponse.json(
                {
                  error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Validation failed',
                    fields: result.errors,
                  },
                },
                { status: 422 }
              )
            }
          }
        }
      }

      const visibleFields = blueprintRegistry
        ? await blueprintRegistry.getBlueprint('forms', (definitionLoader ? await definitionLoader.load<FormDefinition>('forms', handle).catch(() => null) : null)?.blueprint ?? handle)
        : null
      const submission = await formOps.submitForm(handle, visibleFields
        ? filterPayloadByVisibility(Object.values(visibleFields.tabs).flatMap((tab) => [...tab.fields, ...Object.values(tab.sections ?? {}).flatMap((section) => section.fields)]).map((field) => ({ handle: field.handle, visibility: field.field.visibility })), body)
        : body)

      // If submission was silently discarded (honeypot triggered), return 201
      // to not reveal to bots that spam was detected.
      if (!submission) {
        return NextResponse.json({ data: { id: 'discarded', form: handle, submittedAt: new Date().toISOString(), data: {} } }, { status: 201 })
      }

      // Fire cache invalidation after successful form submission
      // Form submissions may affect pages that display form data
      const engine = getInvalidationEngine()
      if (engine) {
        engine.invalidate({ type: 'form', handle, relatedUrls: [] })
      }

      return NextResponse.json({ data: submission }, { status: 201 })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: error.message } },
          { status: 404 }
        )
      }
      throw error
    }
  }

  /**
   * GET /api/forms/{handle}/submissions — paginated list of submissions.
   * Query params: page (default 1), perPage (default 20), sort (newest|oldest, default newest)
   */
  async function handleListSubmissions(
    request: NextRequest,
    handle: string
  ): Promise<NextResponse> {
    const form = await formOps.getForm(handle)
    if (!form) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Form "${handle}" not found` } },
        { status: 404 }
      )
    }

    const url = new URL(request.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const perPage = Math.max(1, Math.min(100, parseInt(url.searchParams.get('perPage') ?? '20', 10) || 20))
    const sortParam = url.searchParams.get('sort')
    const sort: 'newest' | 'oldest' = sortParam === 'oldest' ? 'oldest' : 'newest'

    const result = await formOps.listSubmissions(handle, { page, perPage, sort })
    return NextResponse.json({ data: result })
  }

  /**
   * GET /api/forms/{handle}/submissions/{id} — single submission detail.
   */
  async function handleGetSubmission(
    _request: NextRequest,
    handle: string,
    id: string
  ): Promise<NextResponse> {
    const form = await formOps.getForm(handle)
    if (!form) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Form "${handle}" not found` } },
        { status: 404 }
      )
    }

    const submission = await formOps.getSubmission(handle, id)
    if (!submission) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Submission "${id}" not found` } },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: submission })
  }

  /**
   * DELETE /api/forms/{handle}/submissions/{id} — delete a submission.
   */
  async function handleDeleteSubmission(
    _request: NextRequest,
    handle: string,
    id: string
  ): Promise<NextResponse> {
    try {
      await formOps.deleteSubmission(handle, id)
      return NextResponse.json({ data: { deleted: true } })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: error.message } },
          { status: 404 }
        )
      }
      throw error
    }
  }

  /**
   * GET /api/forms/{handle}/export/csv — export all submissions as CSV.
   */
  async function handleExportCsv(
    _request: NextRequest,
    handle: string
  ): Promise<NextResponse> {
    const form = await formOps.getForm(handle)
    if (!form) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Form "${handle}" not found` } },
        { status: 404 }
      )
    }

    const csv = await formOps.exportCsv(handle)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${handle}-submissions.csv"`,
      },
    })
  }

  /**
   * GET /api/forms/{handle}/export/json — export all submissions as JSON.
   */
  async function handleExportJson(
    _request: NextRequest,
    handle: string
  ): Promise<NextResponse> {
    const form = await formOps.getForm(handle)
    if (!form) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Form "${handle}" not found` } },
        { status: 404 }
      )
    }

    const json = await formOps.exportJson(handle)
    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${handle}-submissions.json"`,
      },
    })
  }

  /**
   * Fires a form invalidation event.
   * Called after a successful form definition write operation.
   */
  function fireFormInvalidation(handle: string, relatedUrls?: string[]): void {
    const engine = getInvalidationEngine()
    if (engine) {
      engine.invalidate({ type: 'form', handle, relatedUrls })
    }
  }

  return {
    handleListForms,
    handleGetForm,
    handleSubmitForm,
    handleListSubmissions,
    handleGetSubmission,
    handleDeleteSubmission,
    handleExportCsv,
    handleExportJson,
    fireFormInvalidation,
  }
}
