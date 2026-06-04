'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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
