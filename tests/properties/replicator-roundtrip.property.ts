// Feature: phase-zero-completion, Property 4: Nested Replicator Data Round-Trip

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  flattenNestedReplicator,
  hydrateNestedReplicator,
  type Block,
} from '@/lib/replicator/operations'

/**
 * Validates: Requirements 6.2
 *
 * Property 4: For any valid replicator block structure with nesting up to 3 levels deep,
 * serializing (flattening) and then deserializing (hydrating) SHALL produce a block
 * structure identical to the original.
 */

// --- Generators ---

/**
 * Generate a safe scalar value that won't be confused with a block array.
 * Avoids arrays of objects with _type (those are treated as nested replicators).
 */
const scalarValue: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 4, arbitrary: fc.string({ minLength: 0, maxLength: 50 }) },
  { weight: 3, arbitrary: fc.integer({ min: -100000, max: 100000 }) },
  { weight: 2, arbitrary: fc.boolean() },
  { weight: 1, arbitrary: fc.constant(null) },
  // Plain arrays (not block arrays) — arrays of primitives
  { weight: 2, arbitrary: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 0, maxLength: 5 }) },
  { weight: 1, arbitrary: fc.array(fc.integer(), { minLength: 0, maxLength: 5 }) },
)

/**
 * Generate a valid block type name (simple alphanumeric identifier).
 */
const blockType = fc.stringMatching(/^[a-z][a-z0-9_]{0,14}$/).filter((s) => s.length >= 1)

/**
 * Generate a valid field key (not _type, simple identifier).
 */
const fieldKey = fc
  .stringMatching(/^[a-z][a-z0-9_]{0,9}$/)
  .filter((s) => s.length >= 1 && s !== '_type')

/**
 * Generate a leaf block (no nested replicator fields).
 */
const leafBlock: fc.Arbitrary<Block> = fc
  .tuple(
    blockType,
    fc.array(fc.tuple(fieldKey, scalarValue), { minLength: 0, maxLength: 5 })
  )
  .map(([type, fields]) => {
    const block: Block = { _type: type }
    for (const [key, value] of fields) {
      block[key] = value
    }
    return block
  })

/**
 * Generate a block with nesting at the specified depth.
 * depth=0 means leaf blocks only, depth=1 means blocks can contain nested block arrays, etc.
 */
function blockAtDepth(maxDepth: number): fc.Arbitrary<Block> {
  if (maxDepth <= 0) return leafBlock

  const childBlocks = fc.array(blockAtDepth(maxDepth - 1), { minLength: 1, maxLength: 3 })

  return fc
    .tuple(
      blockType,
      fc.array(fc.tuple(fieldKey, scalarValue), { minLength: 0, maxLength: 3 }),
      // Optionally include nested replicator fields (0-2 nested fields)
      fc.array(fc.tuple(fieldKey, childBlocks), { minLength: 0, maxLength: 2 })
    )
    .map(([type, scalarFields, nestedFields]) => {
      const block: Block = { _type: type }
      const usedKeys = new Set<string>()

      for (const [key, value] of scalarFields) {
        if (!usedKeys.has(key)) {
          block[key] = value
          usedKeys.add(key)
        }
      }

      for (const [key, value] of nestedFields) {
        if (!usedKeys.has(key)) {
          block[key] = value
          usedKeys.add(key)
        }
      }

      return block
    })
}

/**
 * Generate an arbitrary block structure with nesting up to 3 levels.
 */
const nestedBlocksArb: fc.Arbitrary<Block[]> = fc.array(blockAtDepth(3), {
  minLength: 1,
  maxLength: 5,
})

// --- Property Tests ---

describe('Property 4: Nested Replicator Data Round-Trip', () => {
  it('flatten then hydrate produces identical structure for arbitrary nested blocks', () => {
    fc.assert(
      fc.property(nestedBlocksArb, (blocks) => {
        const flattened = flattenNestedReplicator(blocks)
        const hydrated = hydrateNestedReplicator(flattened)

        expect(hydrated).toEqual(blocks)
      }),
      { numRuns: 100 },
    )
  })

  it('round-trip is idempotent (double flatten+hydrate produces same result)', () => {
    fc.assert(
      fc.property(nestedBlocksArb, (blocks) => {
        const flattened1 = flattenNestedReplicator(blocks)
        const hydrated1 = hydrateNestedReplicator(flattened1)
        const flattened2 = flattenNestedReplicator(hydrated1)
        const hydrated2 = hydrateNestedReplicator(flattened2)

        expect(hydrated2).toEqual(hydrated1)
      }),
      { numRuns: 100 },
    )
  })
})
