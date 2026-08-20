import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ list: vi.fn() }))

vi.mock('@/lib/seo/redirects', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/seo/redirects')>()
  return {
    ...original,
    FileSeoRedirectRepository: class {
      list = mocks.list
    },
  }
})

describe('public SEO redirects', () => {
  beforeEach(() => mocks.list.mockReset())

  it('executes an enabled site redirect before rendering or cache lookup', async () => {
    mocks.list.mockResolvedValue([{
      redirect: { version: 1, id: 'legacy', site: 'default', source: '/legacy', destination: '/new-home', status: 308, enabled: true },
      revision: 'a'.repeat(64),
      path: '/private/content/seo/redirects/legacy.yaml',
    }])
    const { proxy } = await import('@/proxy')

    const response = await proxy(new NextRequest('http://localhost:3000/legacy'))

    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('http://localhost:3000/new-home')
    expect(mocks.list).toHaveBeenCalledWith('default')
  })
})
