export type CapabilityMap = Record<string, boolean>

interface FeatureAvailability {
  seo: boolean
}

/** Combine role permissions with runtime feature availability. */
export function applyFeatureAvailability(
  capabilities: CapabilityMap,
  features: FeatureAvailability,
): CapabilityMap {
  if (features.seo) return capabilities

  return Object.fromEntries(
    Object.entries(capabilities).map(([capability, allowed]) => [
      capability,
      capability.startsWith('seo:')
        || capability.startsWith('seo-reports:')
        || capability.startsWith('seo-redirects:')
        || capability.startsWith('seo-errors:')
        ? false
        : allowed,
    ])
  )
}
