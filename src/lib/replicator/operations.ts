/**
 * Replicator block operations — pure functions for block manipulation.
 * No React dependencies, enabling property-based testing.
 */

export interface Block {
  _type: string
  [key: string]: unknown
}

/**
 * Serialized representation of a block array for persistence.
 * Each entry preserves _type plus all field values, with nested
 * replicator fields recursively flattened.
 */
export interface FlattenedBlock {
  _type: string
  [key: string]: unknown
}

/**
 * Duplicates the block at the given index, inserting the clone immediately after.
 * Returns a new array (does not mutate the original).
 * If the index is out of bounds, returns the original array unchanged.
 */
export function duplicateBlock(blocks: Block[], index: number): Block[] {
  const source = blocks[index]
  if (!source) return blocks
  const clone = structuredClone(source)
  const result = [...blocks]
  result.splice(index + 1, 0, clone)
  return result
}

/**
 * Generates a preview string for a collapsed block.
 * If primaryTextField is provided and the block has a string value at that key,
 * returns "{_type}: {value}". Otherwise returns just the _type.
 */
export function getBlockPreview(block: Block, primaryTextField?: string): string {
  if (primaryTextField && typeof block[primaryTextField] === 'string') {
    return `${block._type}: ${block[primaryTextField]}`
  }
  return block._type
}

/**
 * Recursively checks if a value looks like a nested replicator (array of blocks).
 */
function isBlockArray(value: unknown): value is Block[] {
  if (!Array.isArray(value)) return false
  if (value.length === 0) return false
  return value.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      '_type' in item &&
      typeof (item as Record<string, unknown>)._type === 'string'
  )
}

/**
 * Serializes nested replicator data for persistence.
 * Handles up to 3 levels of nesting by recursively processing
 * any field value that is itself an array of blocks.
 *
 * The output is a plain JSON-serializable array of objects.
 */
export function flattenNestedReplicator(blocks: Block[], depth: number = 0): FlattenedBlock[] {
  if (depth > 3) return blocks as FlattenedBlock[]

  return blocks.map((block) => {
    const flattened: FlattenedBlock = { _type: block._type }

    for (const [key, value] of Object.entries(block)) {
      if (key === '_type') continue

      if (isBlockArray(value)) {
        // Recursively flatten nested replicator fields
        flattened[key] = flattenNestedReplicator(value, depth + 1)
      } else {
        flattened[key] = value
      }
    }

    return flattened
  })
}

/**
 * Deserializes stored data back into Block arrays.
 * Inverse of flattenNestedReplicator — reconstructs Block[] from
 * serialized data. Handles up to 3 levels of nesting.
 *
 * If data is not a valid array, returns an empty array.
 */
export function hydrateNestedReplicator(data: unknown, depth: number = 0): Block[] {
  if (!Array.isArray(data)) return []
  if (depth > 3) return data as Block[]

  return data
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' &&
        item !== null &&
        '_type' in item &&
        typeof (item as Record<string, unknown>)._type === 'string'
    )
    .map((item) => {
      const block: Block = { _type: item._type as string }

      for (const [key, value] of Object.entries(item)) {
        if (key === '_type') continue

        if (Array.isArray(value) && value.length > 0 && isBlockArray(value)) {
          // Recursively hydrate nested replicator fields
          block[key] = hydrateNestedReplicator(value, depth + 1)
        } else {
          block[key] = value
        }
      }

      return block
    })
}
