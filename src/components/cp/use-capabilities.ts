'use client'

import { useEffect, useState } from 'react'

export type Capabilities = Record<string, boolean>
export type CapabilityScopes = { entries?: Record<string, Capabilities> }
type CapabilityContract = { capabilities: Capabilities; scopes?: CapabilityScopes }

/** Client hint only; server permission guards remain authoritative. Fails closed. */
export function useCapabilityContract(): CapabilityContract | null {
  const [contract, setContract] = useState<CapabilityContract | null>(null)
  useEffect(() => {
    queueMicrotask(() => {
      void fetch('/api/users/capabilities').then(async response => {
        if (!response.ok) throw new Error()
        const payload = await response.json() as { data?: Partial<CapabilityContract> }
        setContract({ capabilities: payload.data?.capabilities ?? {}, scopes: payload.data?.scopes })
      }).catch(() => setContract({ capabilities: {} }))
    })
  }, [])
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
