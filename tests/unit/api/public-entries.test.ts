import { describe, expect, it, vi } from 'vitest'

import { handlePublicEntries } from '@/app/api/public/entries/[collection]/[[...slug]]/route'
import type { ContentEngine } from '@/lib/content/engine'
import type { Entry } from '@/lib/types'
import { ValidationError } from '@/lib/errors'

const publishedEntry: Entry = {
  title: 'Published post',
  slug: 'published-post',
  status: 'published',
  content: 'Visible content',
  data: {},
  collection: 'blog',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  contentHash: 'private-concurrency-token',
}

function engineWith(overrides: Partial<ContentEngine>): ContentEngine {
  return overrides as ContentEngine
}

describe('published content API', () => {
  it('forces published status and removes concurrency hashes from lists', async () => {
    const listEntries = vi.fn().mockResolvedValue([publishedEntry])
    const response = await handlePublicEntries(
      new Request('http://localhost/api/public/entries/blog?limit=5&offset=2&sort=-createdAt'),
      engineWith({ listEntries }),
      'blog'
    )

    expect(response.status).toBe(200)
    expect(listEntries).toHaveBeenCalledWith('blog', {
      status: 'published',
      limit: 5,
      offset: 2,
      sort: { field: 'createdAt', direction: 'desc' },
    })
    const body = await response.json()
    expect(body.data).toEqual([{ ...publishedEntry, contentHash: undefined }])
    expect(body.data[0]).not.toHaveProperty('contentHash')
  })

  it('returns a published entry without requiring authentication', async () => {
    const response = await handlePublicEntries(
      new Request('http://localhost/api/public/entries/blog/published-post'),
      engineWith({ getEntry: vi.fn().mockResolvedValue(publishedEntry) }),
      'blog',
      ['published-post']
    )

    expect(response.status).toBe(200)
    expect((await response.json()).data.slug).toBe('published-post')
  })

  it('does not expose draft entries', async () => {
    const response = await handlePublicEntries(
      new Request('http://localhost/api/public/entries/blog/draft-post'),
      engineWith({ getEntry: vi.fn().mockResolvedValue({ ...publishedEntry, status: 'draft' }) }),
      'blog',
      ['draft-post']
    )

    expect(response.status).toBe(404)
  })

  it('maps invalid collection or entry identifiers to a safe client error', async () => {
    const response = await handlePublicEntries(
      new Request('http://localhost/api/public/entries/../secrets'),
      engineWith({ getEntry: vi.fn().mockRejectedValue(new ValidationError('Invalid collection', { collection: ['unsafe'] })) }),
      '../secrets',
      ['bad-slug']
    )

    expect(response.status).toBe(400)
    expect((await response.json()).error).toEqual({ code: 'BAD_REQUEST', message: 'Invalid collection or entry identifier' })
  })
})
