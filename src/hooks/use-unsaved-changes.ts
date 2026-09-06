'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { registerHistoryGuard } from './history-position'

/**
 * Hook that detects unsaved form changes and warns users before navigating away.
 *
 * Handles:
 * - Browser `beforeunload` event (tab close, hard navigation, back/forward)
 * - Tracks dirty state by comparing current values to a saved snapshot
 *
 * Usage:
 * ```ts
 * const { isDirty, markSaved, markDirty } = useUnsavedChanges(formData, { enabled: !saving })
 * ```
 */
export interface UseUnsavedChangesOptions {
  /** Whether the warning should be active. Disable during save operations. Default: true */
  enabled?: boolean
  /** Custom message shown in the beforeunload dialog (browsers may ignore this). */
  message?: string
}

export interface UseUnsavedChangesReturn {
  /** Whether the form has unsaved changes */
  isDirty: boolean
  /** Mark the current state as saved (resets dirty tracking) */
  markSaved: () => void
  /** Manually mark the form as dirty */
  markDirty: () => void
  /** Reset dirty state without updating the snapshot */
  reset: () => void
}

/**
 * Detects unsaved changes by comparing current form data to a snapshot.
 * Registers a `beforeunload` handler when dirty to warn on browser navigation.
 */
export function useUnsavedChanges(
  currentValues: Record<string, unknown>,
  options: UseUnsavedChangesOptions = {}
): UseUnsavedChangesReturn {
  const { enabled = true, message = 'You have unsaved changes. Are you sure you want to leave?' } = options
  const [isDirty, setIsDirty] = useState(false)
  const savedSnapshotRef = useRef<string>('')
  const initializedRef = useRef(false)
  const fallbackGuardRef = useRef(false)
  const fallbackIndexRef = useRef<number | null>(null)

  // Serialize values for comparison (handles nested objects, order-independent)
  const serialize = useCallback((values: Record<string, unknown>): string => {
    try {
      return JSON.stringify(values, (_key, value) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const sorted: Record<string, unknown> = {}
          for (const k of Object.keys(value).sort()) {
            sorted[k] = (value as Record<string, unknown>)[k]
          }
          return sorted
        }
        return value
      })
    } catch {
      return ''
    }
  }, [])

  // Set the initial snapshot once form data loads
  useEffect(() => {
    if (!initializedRef.current && currentValues && Object.keys(currentValues).length > 0) {
      savedSnapshotRef.current = serialize(currentValues)
      initializedRef.current = true
    }
  }, [currentValues, serialize])

  // Compare current values to the saved snapshot
  useEffect(() => {
    if (!initializedRef.current) return
    const currentSerialized = serialize(currentValues)
    setIsDirty(currentSerialized !== savedSnapshotRef.current)
  }, [currentValues, serialize])

  // Register beforeunload handler when dirty and enabled
  useEffect(() => {
    if (!isDirty || !enabled) return

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      // Modern browsers ignore custom messages but returnValue is still required
      e.returnValue = message
      return message
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty, enabled, message])

  // Chromium's Navigation API runs before framework popstate handlers. Limit
  // this guard to traversals: router.push/replace is guarded by the anchor
  // handler (and saves may redirect while dirty state is being cleared).
  useEffect(() => {
    if (!isDirty || !enabled) return
    const navigation = (window as Window & { navigation?: { addEventListener: (type: string, listener: (event: { canIntercept?: boolean; destination?: { sameDocument?: boolean }; navigationType?: string; preventDefault: () => void }) => void, options?: boolean) => void; removeEventListener: (type: string, listener: unknown, options?: boolean) => void } }).navigation
    if (!navigation) return
    const handleNavigate = (event: { canIntercept?: boolean; destination?: { sameDocument?: boolean }; navigationType?: string; preventDefault: () => void }) => {
      if (event.navigationType !== 'traverse' || event.canIntercept === false || event.destination?.sameDocument === false) return
      if (!window.confirm(message)) event.preventDefault()
    }
    navigation.addEventListener('navigate', handleNavigate, true)
    return () => navigation.removeEventListener('navigate', handleNavigate, true)
  }, [isDirty, enabled, message])

  useEffect(() => {
    if (!isDirty || !enabled) return
    const navigation = (window as Window & { navigation?: unknown }).navigation
    if (navigation) return

    let restoring = false
    const currentState = (window.history.state ?? {}) as Record<string, unknown>
    const currentIndex = typeof currentState.__madoriHistoryIndex === 'number'
      ? currentState.__madoriHistoryIndex
      : 0
    fallbackGuardRef.current = true
    fallbackIndexRef.current = currentIndex
    window.history.replaceState({ ...currentState, __madoriHistoryIndex: currentIndex, __madoriDirtyGuard: true }, '', window.location.href)

    function handlePopState(event: PopStateEvent) {
      const targetState = (event.state ?? {}) as Record<string, unknown>
      const targetIndex = typeof targetState.__madoriHistoryIndex === 'number'
        ? targetState.__madoriHistoryIndex
        : currentIndex - 1
      if (restoring && targetIndex === currentIndex) {
        restoring = false
        event.stopImmediatePropagation()
        event.preventDefault()
        return
      }
      if (!fallbackGuardRef.current) return
      if (window.confirm(message)) {
        // Traversal already happened. Let Next consume this popstate once.
        fallbackGuardRef.current = false
        fallbackIndexRef.current = targetIndex
      } else {
        // Capture before Next's router popstate listener so cancelled traversal
        // leaves editor mounted at its current history entry.
        event.stopImmediatePropagation()
        event.preventDefault()
        restoring = true
        window.history.go(currentIndex - targetIndex)
      }
    }
    const unregister = registerHistoryGuard(handlePopState)
    return () => {
      unregister()
      if (fallbackGuardRef.current) {
        const state = (window.history.state ?? {}) as Record<string, unknown>
        const { __madoriDirtyGuard: _guard, ...cleanState } = state
        window.history.replaceState(cleanState, '', window.location.href)
      }
      fallbackGuardRef.current = false
      fallbackIndexRef.current = null
    }
  }, [isDirty, enabled, message])

  // beforeunload does not cover Next client-side links. Guard same-origin
  // anchors so sidebar, breadcrumbs, and back links all use one confirmation.
  useEffect(() => {
    if (!isDirty || !enabled) return
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(target instanceof HTMLAnchorElement) || target.target === '_blank') return
      const url = new URL(target.href, window.location.href)
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return
      if (!window.confirm(message)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [isDirty, enabled, message])

  const markSaved = useCallback(() => {
    savedSnapshotRef.current = serialize(currentValues)
    setIsDirty(false)
  }, [currentValues, serialize])

  const markDirty = useCallback(() => {
    setIsDirty(true)
  }, [])

  const reset = useCallback(() => {
    setIsDirty(false)
    initializedRef.current = false
  }, [])

  return { isDirty, markSaved, markDirty, reset }
}
