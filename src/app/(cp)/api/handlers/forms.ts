import { NextRequest, NextResponse } from 'next/server'
import { FormOperations } from '@/lib/content/forms'
import { NotFoundError } from '@/lib/errors'
import { getInvalidationEngine } from '@/lib/static-cache/instance'
import { validateFields } from '@/lib/validation/rules'
import type { BlueprintRegistry } from '@/lib/blueprints/registry'
import type { FieldConfig } from '@/lib/blueprints/types'

export function createFormHandlers(formOps: FormOperations, blueprintRegistry?: BlueprintRegistry) {
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
    const body = await request.json()

    try {
      // Validate submission data against the form blueprint's field definitions
      if (blueprintRegistry) {
        const blueprint = await blueprintRegistry.getBlueprint('forms', handle)
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
            const result = validateFields(fieldConfigs, body)
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

      const submission = await formOps.submitForm(handle, body)

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
