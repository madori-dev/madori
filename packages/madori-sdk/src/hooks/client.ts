'use client'

import { useState, useEffect } from 'react'
import type { ListOptions } from '../index.js'

/**
 * Configuration for client-side hooks.
 * The API endpoint that the hooks call to fetch content.
 */
export interface ClientHookConfig {
  apiEndpoint?: string // default: '/api/madori'
}

let hookConfig: ClientHookConfig = {
  apiEndpoint: '/api/madori',
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
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)

    fetch(`${hookConfig.apiEndpoint}/entry/${collection}/${slug}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch entry: ${res.status}`)
        return res.json()
      })
      .then((json) => {
        if (!cancelled) {
          setData(json as T)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [collection, slug])

  return { data, isLoading, error }
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
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)

    const params = new URLSearchParams()
    if (options?.limit != null) params.set('limit', String(options.limit))
    if (options?.offset != null) params.set('offset', String(options.offset))
    if (options?.sort) params.set('sort', options.sort)
    if (options?.status) params.set('status', options.status)

    const queryString = params.toString()
    const url = `${hookConfig.apiEndpoint}/entries/${collection}${queryString ? `?${queryString}` : ''}`

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch entries: ${res.status}`)
        return res.json()
      })
      .then((json) => {
        if (!cancelled) {
          setData(json as T[])
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [collection, JSON.stringify(options)])

  return { data, isLoading, error }
}
