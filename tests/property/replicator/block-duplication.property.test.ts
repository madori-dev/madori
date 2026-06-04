// Property 5: Block Duplication Preserves Field Values

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { duplicateBlock, type Block } from '@/lib/replicator/operations'

/**
 * Validates: Requirements 6.4
 *
 * Property: For any list of replicator blocks and any valid index within that list,
 * duplicating the block at that index SHALL produce a new list where the element at
 * index+1 has the same _type and the same field values as the element at the original index.
 */

// --- Generators ---

/** Arbitrary block type name */
const blockTypeArb = fc.stringMatching(/^[a-z][a-z0-9_-]{0,20}$/)

/** Arbitrary field value — primitives and simple nested structures */
const fieldValueArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.string(), { maxLength: 5 }),
  fc.array(fc.integer(), { maxLength: 5 }),
)

/** Arbitrary field handle (key name) */
const fieldHandleArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,15}$/)

/** Generator for a single Block with random fields */
const blockArb: fc.Arbitrary<Block> = fc
  .record({
    _type: blockTypeArb,
    fields: fc.dictionary(fieldHandleArb, fieldValueArb, { minKeys: 0, maxKeys: 6 }),
  })
  .map(({ _type, fields }) => ({ _type, ...fields }))

/** Generator for a non-empty list of blocks */
const blockListArb = fc.array(blockArb, { minLength: 1, maxLength: 20 })

/** Generator for a block list paired with a valid index */
const blockListWithIndexArb = blockListArb.chain((blocks) =>
  fc.record({
    blocks: fc.constant(blocks),
    index: fc.integer({ min: 0, max: blocks.length - 1 }),
  }),
)

// --- Property Tests ---

describe('Property 5: Block Duplication Preserves Field Values', () => {
  it('duplicate at index produces element at index+1 with same _type and field values', () => {
    fc.assert(
      fc.property(blockListWithIndexArb, ({ blocks, index }) => {
        const result = duplicateBlock(blocks, index)

        // Result should have exactly one more element
        expect(result).toHaveLength(blocks.length + 1)

        // The element at index+1 should have the same _type as the source
        expect(result[index + 1]._type).toBe(blocks[index]._type)

        // The element at index+1 should have the same field values as the source
        expect(result[index + 1]).toEqual(blocks[index])
      }),
      { numRuns: 100 },
    )
  })

  it('duplicate produces a deep clone (no shared references with source)', () => {
    fc.assert(
      fc.property(blockListWithIndexArb, ({ blocks, index }) => {
        const result = duplicateBlock(blocks, index)

        // The duplicated block should not be the same object reference
        expect(result[index + 1]).not.toBe(result[index])

        // Verify deep independence: mutating the clone should not affect the original
        const clone = result[index + 1]
        const original = result[index]
        for (const key of Object.keys(clone)) {
          if (key === '_type') continue
          const val = clone[key]
          if (Array.isArray(val)) {
            expect(val).not.toBe(original[key])
          }
        }
      }),
      { numRuns: 100 },
    )
  })

  it('duplicate preserves all other blocks in their original positions', () => {
    fc.assert(
      fc.property(blockListWithIndexArb, ({ blocks, index }) => {
        const result = duplicateBlock(blocks, index)

        // Elements before the duplication point should be unchanged
        for (let i = 0; i < index; i++) {
          expect(result[i]).toEqual(blocks[i])
        }

        // The original at the index should still be there
        expect(result[index]).toEqual(blocks[index])

        // Elements after the duplication point should be shifted by 1
        for (let i = index + 1; i < blocks.length; i++) {
          expect(result[i + 1]).toEqual(blocks[i])
        }
      }),
      { numRuns: 100 },
    )
  })
})
