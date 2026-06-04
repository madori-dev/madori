import { describe, it, expect, beforeEach } from 'vitest'
import { GET, sectionRegistry } from '@/app/_nocache/[section]/route'

function makeParams(section: string) {
  return { params: Promise.resolve({ section }) }
}

describe('NoCache API endpoint', () => {
  beforeEach(() => {
    sectionRegistry.clear()
  })

  it('returns 404 when section is not registered', async () => {
    const request = new Request('http://localhost/_nocache/unknown')
    const response = await GET(request, makeParams('unknown'))

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Section not found')
  })

  it('returns rendered HTML for a registered section', async () => {
    sectionRegistry.set('greeting', () => '<p>Hello, world!</p>')

    const request = new Request('http://localhost/_nocache/greeting')
    const response = await GET(request, makeParams('greeting'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
    expect(await response.text()).toBe('<p>Hello, world!</p>')
  })

  it('supports async section renderers', async () => {
    sectionRegistry.set('async-section', async () => '<div>async content</div>')

    const request = new Request('http://localhost/_nocache/async-section')
    const response = await GET(request, makeParams('async-section'))

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('<div>async content</div>')
  })

  it('returns 500 when renderer throws', async () => {
    sectionRegistry.set('broken', () => {
      throw new Error('render failed')
    })

    const request = new Request('http://localhost/_nocache/broken')
    const response = await GET(request, makeParams('broken'))

    expect(response.status).toBe(500)
    expect(await response.text()).toBe('Internal server error')
  })
})
