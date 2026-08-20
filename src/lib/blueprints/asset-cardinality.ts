/** Asset cardinality derives from max_files; omitted keeps legacy scalar assets. */
export interface AssetCardinality {
  min?: number
  max: number
  multiple: boolean
  valid: boolean
}

function parseCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

export function getAssetCardinality(options?: Record<string, unknown>): AssetCardinality {
  const hasMin = options?.min_files !== undefined
  const hasMax = options?.max_files !== undefined
  const min = parseCount(options?.min_files)
  const configuredMax = parseCount(options?.max_files)
  const max = configuredMax ?? 1
  const multiple = max === 0 || max > 1
  const validValues = (!hasMin || min !== undefined) && (!hasMax || configuredMax !== undefined)
  const validBounds = !(multiple && max > 0 && min !== undefined && min > max)
    && !(!multiple && min !== undefined && min > 1)
  return { min, max, multiple, valid: validValues && validBounds }
}
