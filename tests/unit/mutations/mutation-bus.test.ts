import { describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'
import { ContentMutationBus, normaliseContentMutation, type ContentMutation } from '@/lib/mutations'

const mutation = (paths: string[]): ContentMutation => ({
  action: 'update',
  paths,
  resource: { type: 'entry', handle: 'blog', id: 'hello' },
  message: 'Updated entry hello',
  source: 'control-panel',
  actor: { id: 'michael', email: 'michael@example.test' },
  timestamp: 1,
})

describe('ContentMutationBus', () => {
  it('delivers an immutable event snapshot and supports unsubscribe', () => {
    const bus = new ContentMutationBus()
    const listener = vi.fn()
    const unsubscribe = bus.onMutation(listener)
    const source = mutation(['/content/hello.md'])

    bus.report(source)
    source.paths = ['/content/changed.md']

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ paths: ['/content/hello.md'] }))
    unsubscribe()
    bus.report(mutation(['/content/next.md']))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('requires at least one affected path', () => {
    expect(() => normaliseContentMutation(mutation([]))).toThrow('at least one affected path')
  })

  it('preserves every affected path', () => {
    fc.assert(fc.property(fc.array(fc.string({ minLength: 1 }), { minLength: 1 }), (paths) => {
      expect(normaliseContentMutation(mutation(paths)).paths).toEqual(paths)
    }))
  })
})
