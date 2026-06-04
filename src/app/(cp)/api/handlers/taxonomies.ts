import { NextRequest, NextResponse } from 'next/server'
import { TaxonomyOperations } from '@/lib/content/taxonomies'
import { NotFoundError } from '@/lib/errors'
import { getInvalidationEngine } from '@/lib/static-cache/instance'

export function createTaxonomyHandlers(taxonomyOps: TaxonomyOperations) {
  async function handleListTaxonomies(): Promise<NextResponse> {
    const taxonomies = await taxonomyOps.listTaxonomies()
    return NextResponse.json({ data: taxonomies })
  }

  async function handleListTerms(
    _request: NextRequest,
    taxonomyHandle: string
  ): Promise<NextResponse> {
    try {
      const terms = await taxonomyOps.listTerms(taxonomyHandle)
      return NextResponse.json({ data: terms })
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
   * Fires a taxonomy invalidation event.
   * Called after a successful taxonomy term write operation.
   */
  function fireTaxonomyInvalidation(url: string, relatedUrls?: string[]): void {
    const engine = getInvalidationEngine()
    if (engine) {
      engine.invalidate({ type: 'taxonomy', url, relatedUrls })
    }
  }

  return { handleListTaxonomies, handleListTerms, fireTaxonomyInvalidation }
}
