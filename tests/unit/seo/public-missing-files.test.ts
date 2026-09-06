import { expect, it, vi } from 'vitest'
import { resolvePublishedContentRoute } from '@/lib/seo/next/runtime'
import { assertContentIdentifier } from '@/lib/content/identifiers'

const { getEntry } = vi.hoisted(() => ({ getEntry: vi.fn() }))
vi.mock('@/lib/madori', () => ({ getMadori: async () => ({contentEngine:{
  listCollections:async () => [{handle:'pages',route:'/{slug}'}],
  listTaxonomies:async () => [], getEntry,
}}) }))
vi.mock('next/headers', () => ({headers:async () => new Headers()}))

it('treats file-like missing URLs as no matching record rather than server errors', async () => {
  getEntry.mockImplementation(async (_collection, slug) => {
    assertContentIdentifier(slug, 'entry slug')
    return null
  })
  await expect(resolvePublishedContentRoute('/missing.txt')).resolves.toBeNull()
  expect(getEntry).not.toHaveBeenCalled()
  await expect(resolvePublishedContentRoute('/missing')).resolves.toBeNull()
  expect(getEntry).toHaveBeenCalledWith('pages','missing')
})
