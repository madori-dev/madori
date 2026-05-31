// Property 2: Handle derivation from filename

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { deriveHandle } from '@/lib/definitions/utils'

/**
 * Validates: Requirements 1.4
 *
 * Property: For any valid handle string (alphanumeric + hyphens/underscores)
 * combined with any supported extension (.yaml, .yml, .json), deriveHandle
 * returns the original handle (filename without extension).
 */

// --- Generators ---

/** Arbitrary valid handle: starts with letter, followed by alphanumeric, hyphens, or underscores */
const handleArb = fc
  .stringMatching(/^[a-z][a-z0-9_-]{0,30}$/)
  .filter((s) => s.length > 0)

/** Arbitrary supported file extension */
const extensionArb = fc.constantFrom('.yaml', '.yml', '.json')

// --- Property Tests ---

describe('Property 2: Handle derivation from filename', () => {
  it('deriveHandle strips the extension and returns the original handle', () => {
    fc.assert(
      fc.property(handleArb, extensionArb, (handle, ext) => {
        const filename = `${handle}${ext}`
        const derived = deriveHandle(filename)
        expect(derived).toBe(handle)
      }),
      { numRuns: 100 },
    )
  })

  it('deriveHandle works with filenames containing path separators', () => {
    fc.assert(
      fc.property(handleArb, extensionArb, (handle, ext) => {
        const filename = `some/path/to/${handle}${ext}`
        const derived = deriveHandle(filename)
        expect(derived).toBe(handle)
      }),
      { numRuns: 100 },
    )
  })
})
