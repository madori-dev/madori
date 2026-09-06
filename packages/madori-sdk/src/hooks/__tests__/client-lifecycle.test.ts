import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  state: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  effects: [] as Array<{ deps?: unknown[]; cleanup?: () => void }>,
  index: 0,
  render: null as (() => void) | null,
  pending: [] as Array<() => void>,
}))

vi.mock('react', () => ({
  useState(initial: unknown) {
    const index = runtime.index++
    if (!(index in runtime.state)) runtime.state[index] = initial
    return [runtime.state[index], (value: unknown) => {
      runtime.state[index] = typeof value === 'function'
        ? (value as (previous: unknown) => unknown)(runtime.state[index])
        : value
      runtime.render?.()
    }]
  },
  useRef(initial: unknown) {
    const index = runtime.index++
    if (!(index in runtime.refs)) runtime.refs[index] = { current: initial }
    return runtime.refs[index]
  },
  useEffect(effect: () => (() => void) | void, deps?: unknown[]) {
    const index = runtime.index++
    const previous = runtime.effects[index]
    const changed = !previous || !deps || !previous.deps || deps.some((value, i) => !Object.is(value, previous.deps?.[i]))
    if (changed) {
      previous?.cleanup?.()
      runtime.pending.push(() => {
        runtime.effects[index] = { deps, cleanup: effect() ?? undefined }
      })
    }
  },
}))

import { useMadoriEntries, useMadoriEntry } from '../client.js'

async function flushEffects(): Promise<void> {
  const pending = runtime.pending.splice(0)
  pending.forEach((run) => run())
  await Promise.resolve()
  await Promise.resolve()
}

function renderHook<T>(hook: () => T): { get current(): T; rerender: () => void } {
  let current!: T
  const rerender = () => {
    runtime.index = 0
    current = hook()
  }
  runtime.render = rerender
  rerender()
  return { get current() { return current }, rerender }
}

function resetRuntime(): void {
  runtime.state = []
  runtime.refs = []
  runtime.effects = []
  runtime.pending = []
  runtime.index = 0
  runtime.render = null
}

describe('client hook request lifecycle', () => {
  beforeEach(() => {
    resetRuntime()
    vi.restoreAllMocks()
  })

  it('clears entry errors immediately when returning to a previously failed request', async () => {
    const requests: Array<(response: Response) => void> = []
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => requests.push(resolve))))
    let props = ['blog', 'a']
    const hook = renderHook(() => useMadoriEntry<Record<string, string>>(props[0], props[1]))
    await flushEffects()
    requests.shift()?.(new Response('', { status: 500 }))
    await flushEffects()
    expect(hook.current.error?.message).toContain('500')

    props = ['blog', 'b']
    hook.rerender()
    await flushEffects()
    expect(hook.current.isLoading).toBe(true)
    expect(hook.current.error).toBeNull()

    props = ['blog', 'a']
    hook.rerender()
    expect(hook.current.isLoading).toBe(true)
    expect(hook.current.error).toBeNull()
  })

  it('starts a fresh list request for filter changes and ignores cancelled responses', async () => {
    const requests: Array<(response: Response) => void> = []
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => requests.push(resolve))))
    let filter = 'one'
    const hook = renderHook(() => useMadoriEntries<Record<string, string>>('blog', { filter: { term: filter } }))
    await flushEffects()
    filter = 'two'
    hook.rerender()
    await flushEffects()
    expect(hook.current.isLoading).toBe(true)
    expect(hook.current.error).toBeNull()
    requests.shift()?.(new Response(JSON.stringify({ data: [{ title: 'stale' }] }), { status: 200 }))
    await flushEffects()
    expect(hook.current.data).toEqual([])
  })
})
