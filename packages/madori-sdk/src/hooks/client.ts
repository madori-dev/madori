'use client'

import { useState, useEffect } from 'react'
import type { ListOptions } from '../index.js'

/**
 * Configuration for client-side hooks.
 * The API endpoint that the hooks call to fetch content.
 */
export interface ClientHookConfig {
  /** Published-content REST API base path. Defaults to same-origin `/api/public`. */
  apiEndpoint?: string
}

let hookConfig: ClientHookConfig = {
  apiEndpoint: '/api/public',
}

export function normalizePublicEntry<T>(value: unknown): T {
  if (!value || typeof value !== 'object') return value as T
  const entry = value as Record<string, unknown>
  const data = entry.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return value as T
  return { ...(data as Record<string, unknown>), ...entry } as T
}

/**
 * Configure the API endpoint used by client-side hooks.
 * Call this once at app initialization (e.g., in a layout or provider).
 */
export function configureMadoriHooks(config: ClientHookConfig): void {
  hookConfig = { ...hookConfig, ...config }
}

/**
 * Client-side React hook to fetch a single entry by collection and slug.
 * Must be used inside a React component tree.
 *
 * @throws Error if used outside React (useState not available)
 */
export function useMadoriEntry<T>(
  collection: string,
  slug: string
): { data: T | null; isLoading: boolean; error: Error | null } {
  if (typeof useState !== 'function') {
    throw new Error(
      'useMadoriEntry must be used within a React component. ' +
        'Hooks are only available within the React component tree.'
    )
  }

  const [data, setData] = useState<T | null>(null)
  const requestKey = `${collection}:${slug}`
  const [observedRequestKey, setObservedRequestKey] = useState(requestKey)
  const [requestState, setRequestState] = useState({ key: requestKey, isLoading: true, error: null as Error | null })

  // Reset request state during the render that observes a new key. This
  // prevents a previously completed error from flashing on a repeated key.
  if (observedRequestKey !== requestKey) {
    setObservedRequestKey(requestKey)
    setRequestState({ key: requestKey, isLoading: true, error: null })
  }

  useEffect(() => {
    let cancelled = false

    fetch(`${hookConfig.apiEndpoint}/entries/${collection}/${slug}`, {
      credentials: 'same-origin',
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch entry: ${res.status}`)
        return res.json()
      })
      .then((json) => {
        if (!cancelled) {
          setData(normalizePublicEntry<T>((json as { data: unknown }).data))
          setRequestState({ key: requestKey, isLoading: false, error: null })
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setRequestState({ key: requestKey, isLoading: false, error: err instanceof Error ? err : new Error(String(err)) })
        }
      })

    return () => {
      cancelled = true
    }
  }, [collection, slug, requestKey])

  return {
    data,
    isLoading: requestState.key !== requestKey || requestState.isLoading,
    error: requestState.key === requestKey && !requestState.isLoading ? requestState.error : null,
  }
}

/**
 * Client-side React hook to fetch a list of entries for a collection.
 * Must be used inside a React component tree.
 *
 * @throws Error if used outside React (useState not available)
 */
export function useMadoriEntries<T>(
  collection: string,
  options?: ListOptions
): { data: T[]; isLoading: boolean; error: Error | null } {
  if (typeof useState !== 'function') {
    throw new Error(
      'useMadoriEntries must be used within a React component. ' +
        'Hooks are only available within the React component tree.'
    )
  }

  const [data, setData] = useState<T[]>([])
  const limit = options?.limit
  const offset = options?.offset
  const sort = options?.sort
  const status = options?.status
  const filter = options?.filter
  const filterKey = JSON.stringify(filter ?? null)
  const requestKey = JSON.stringify([collection, limit, offset, sort, status, filterKey])
  const [observedRequestKey, setObservedRequestKey] = useState(requestKey)
  const [requestState, setRequestState] = useState({ key: requestKey, isLoading: true, error: null as Error | null })

  if (observedRequestKey !== requestKey) {
    setObservedRequestKey(requestKey)
    setRequestState({ key: requestKey, isLoading: true, error: null })
  }

  useEffect(() => {
    let cancelled = false

    const params = new URLSearchParams()
    if (limit != null) params.set('limit', String(limit))
    if (offset != null) params.set('offset', String(offset))
    if (sort) params.set('sort', sort)
    if (status) params.set('status', status)
    if (filterKey !== 'null') params.set('filter', filterKey)

    const queryString = params.toString()
    const url = `${hookConfig.apiEndpoint}/entries/${collection}${queryString ? `?${queryString}` : ''}`

    fetch(url, { credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch entries: ${res.status}`)
        return res.json()
      })
      .then((json) => {
        if (!cancelled) {
          setData((json as { data: unknown[] }).data.map((entry) => normalizePublicEntry<T>(entry)))
          setRequestState({ key: requestKey, isLoading: false, error: null })
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setRequestState({ key: requestKey, isLoading: false, error: err instanceof Error ? err : new Error(String(err)) })
        }
      })

    return () => {
      cancelled = true
    }
  }, [collection, limit, offset, sort, status, filterKey, requestKey])

  return {
    data,
    isLoading: requestState.key !== requestKey || requestState.isLoading,
    error: requestState.key === requestKey && !requestState.isLoading ? requestState.error : null,
  }
}
