'use client'

import { useLayoutEffect } from 'react'

const INDEX = '__madoriHistoryIndex'
const guards = new Set<(event: PopStateEvent) => void>()

export function registerHistoryGuard(guard: (event: PopStateEvent) => void): () => void {
  guards.add(guard)
  return () => { guards.delete(guard) }
}

/** Tags client history entries so unsaved-change guards can restore exact traversals. */
export function HistoryPosition(): null {
  // Register before the app router's passive effect. A listener mounted only
  // with the editor can run after Next has already synchronously unmounted it.
  useLayoutEffect(() => {
    const historyWithIndex = window.history
    const state = (historyWithIndex.state ?? {}) as Record<string, unknown>
    let index = typeof state[INDEX] === 'number' ? state[INDEX] as number : 0
    const originalPush = historyWithIndex.pushState.bind(historyWithIndex)
    const originalReplace = historyWithIndex.replaceState.bind(historyWithIndex)
    originalReplace({ ...state, [INDEX]: index }, '', window.location.href)

    historyWithIndex.pushState = ((next: unknown, title: string, url?: string | URL | null) => {
      index += 1
      originalPush({ ...(next as Record<string, unknown>), [INDEX]: index }, title, url)
    }) as typeof historyWithIndex.pushState
    historyWithIndex.replaceState = ((next: unknown, title: string, url?: string | URL | null) => {
      originalReplace({ ...(next as Record<string, unknown>), [INDEX]: index }, title, url)
    }) as typeof historyWithIndex.replaceState
    const onPopState = (event: PopStateEvent) => {
      for (const guard of guards) {
        guard(event)
        if (event.cancelBubble) return
      }
      const next = (event.state ?? {}) as Record<string, unknown>
      if (typeof next[INDEX] === 'number') index = next[INDEX] as number
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      historyWithIndex.pushState = originalPush
      historyWithIndex.replaceState = originalReplace
    }
  }, [])
  return null
}
