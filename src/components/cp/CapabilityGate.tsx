'use client'

import type { ReactNode } from 'react'
import { useCapability } from './use-capabilities'

/** Hide client controls unless capability contract explicitly grants access. */
export function CapabilityGate({ resource, action, scope, children, fallback = null }: { resource: string; action: string; scope?: string; children: ReactNode; fallback?: ReactNode }) {
  return useCapability(resource, action, scope) ? <>{children}</> : <>{fallback}</>
}
