// Property 6: Block Preview Contains Type and Primary Text

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { getBlockPreview } from '@/lib/replicator/operations'

/**
 * Validates: Requirements 6.5
 *
 * Property: For any replicator block with a _type field and a primary text
 * field value, the generated preview string SHALL contain both the block type
 * name and the primary text field value.
 */

// --- Generators ---

/** Arbitrary non-empty block type name */
const blockTypeArb = fc
  .stringMatching(/^[a-z][a-z0-9_-]{0,20}$/)
  .filter((s) => s.length > 0)

/** Arbitrary non-empty primary text value */
const primaryTextArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0)

/** Arbitrary field handle name for the primary text field */
const fieldHandleArb = fc
  .stringMatching(/^[a-z][a-z0-9_]{0,15}$/)
  .filter((s) => s.length > 0 && s !== '_type')

// --- Property Tests ---

describe('Property 6: Block Preview Contains Type and Primary Text', () => {
  it('preview contains both block type and primary text value when primary text field exists', () => {
    fc.assert(
      fc.property(blockTypeArb, fieldHandleArb, primaryTextArb, (blockType, fieldHandle, textValue) => {
        const block = { _type: blockType, [fieldHandle]: textValue }
        const preview = getBlockPreview(block, fieldHandle)

        expect(preview).toContain(blockType)
        expect(preview).toContain(textValue)
      }),
      { numRuns: 100 },
    )
  })

  it('preview contains block type when no primary text field is specified', () => {
    fc.assert(
      fc.property(blockTypeArb, (blockType) => {
        const block = { _type: blockType }
        const preview = getBlockPreview(block)

        expect(preview).toContain(blockType)
      }),
      { numRuns: 100 },
    )
  })

  it('preview contains block type when primary text field does not exist on block', () => {
    fc.assert(
      fc.property(blockTypeArb, fieldHandleArb, (blockType, fieldHandle) => {
        const block = { _type: blockType }
        const preview = getBlockPreview(block, fieldHandle)

        expect(preview).toContain(blockType)
      }),
      { numRuns: 100 },
    )
  })
})
