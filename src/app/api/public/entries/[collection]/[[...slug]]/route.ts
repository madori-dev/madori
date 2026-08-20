import { NextResponse } from 'next/server'

import { getMadori } from '@/lib/madori'
import type { ContentEngine } from '@/lib/content/engine'
import { NotFoundError, ValidationError } from '@/lib/errors'
import type { Entry, ListOptions } from '@/lib/types'

interface RouteParams {
  params: Promise<{ collection: string; slug?: string[] }>
}

function publicEntry(entry: Entry): Omit<Entry, 'contentHash'> {
  const { contentHash: _contentHash, ...publishedEntry } = entry
  return publishedEntry
}

function parseNonNegativeInteger(value: string | null, maximum: number): number | undefined {
  if (value === null) return undefined
  if (!/^\d+$/.test(value)) return undefined
  return Math.min(Number(value), maximum)
}

function parseSort(value: string | null): ListOptions['sort'] {
  if (!value) return undefined
  const direction = value.startsWith('-') ? 'desc' : 'asc'
  const field = value.replace(/^[+-]/, '')
  if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(field)) return undefined
  return { field, direction }
}

export async function handlePublicEntries(
  request: Request,
  contentEngine: ContentEngine,
  collection: string,
  slug?: string[]
): Promise<NextResponse> {
  try {
    if (slug && slug.length > 1) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Entry not found' } }, { status: 404 })
    }

    if (slug?.[0]) {
      const entry = await contentEngine.getEntry(collection, slug[0])
      if (!entry || entry.status !== 'published') {
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Entry not found' } }, { status: 404 })
      }
      return NextResponse.json(
        { data: publicEntry(entry) },
        { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' } }
      )
    }

    const url = new URL(request.url)
    const entries = await contentEngine.listEntries(collection, {
      status: 'published',
      limit: parseNonNegativeInteger(url.searchParams.get('limit'), 100),
      offset: parseNonNegativeInteger(url.searchParams.get('offset'), 10_000),
      sort: parseSort(url.searchParams.get('sort')),
    })
    return NextResponse.json(
      { data: entries.map(publicEntry) },
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' } }
    )
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Invalid collection or entry identifier' } },
        { status: 400 }
      )
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Collection not found' } }, { status: 404 })
    }
    console.error('[madori:public-api] Failed to load entries', error)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Could not load published content' } },
      { status: 500 }
    )
  }
}

export async function GET(request: Request, { params }: RouteParams) {
  const { collection, slug } = await params
  const { contentEngine } = await getMadori()
  return handlePublicEntries(request, contentEngine, collection, slug)
}
