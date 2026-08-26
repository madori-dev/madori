'use client'

import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react'

export type Capabilities = Record<string, boolean>
export type CapabilityScopes = { entries?: Record<string, Capabilities> }
type CapabilityContract = { capabilities: Capabilities; scopes?: CapabilityScopes }
const CapabilityContext = createContext<CapabilityContract | null | undefined>(undefined)

export function CapabilityProvider({ children }: { children: ReactNode }) {
  const [contract, setContract] = useState<CapabilityContract | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function load() {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await fetch('/api/users/capabilities', { cache: 'no-store', signal: controller.signal })
          if (!response.ok) {
            const retryable = response.status === 408 || response.status === 429 || response.status >= 500
            if (!retryable) break
            throw new Error()
          }
          const payload = await response.json() as { data?: Partial<CapabilityContract> }
          if (!cancelled) setContract({ capabilities: payload.data?.capabilities ?? {}, scopes: payload.data?.scopes })
          return
        } catch {
          if (cancelled) return
          if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)))
        }
      }

      if (!cancelled) setContract({ capabilities: {} })
    }

    void load()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  return createElement(CapabilityContext.Provider, { value: contract }, children)
}

/** Client hint only; server permission guards remain authoritative. Fails closed. */
export function useCapabilityContract(): CapabilityContract | null {
  const contract = useContext(CapabilityContext)
  if (contract === undefined) throw new Error('Capability hooks must be used within CapabilityProvider')
  return contract
}

export function useCapabilities(): Capabilities | null {
  return useCapabilityContract()?.capabilities ?? null
}

export function useCapability(resource: string, action: string, scope?: string): boolean {
  const contract = useCapabilityContract()
  const mappedResource = resource === 'seo-defaults' ? 'seo' : resource
  if (mappedResource === 'entries' && scope) return contract?.scopes?.entries?.[scope]?.[action] === true
  return contract?.capabilities[`${mappedResource}:${action}`] === true
}
