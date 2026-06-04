// Properties 9–10: Optimistic Concurrency

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { computeContentHash, verifyContentHash } from '@/lib/content/concurrency'
import { ConflictError } from '@/lib/errors'

/**
 * Validates: Requirements 5.1, 5.4
 *
 * Property 9: Content hash determinism
 * For any file content string, computeContentHash() SHALL produce the same
 * hash value on every invocation, and different content strings SHALL produce
 * different hashes (collision resistance).
 *
 * Property 10: Optimistic concurrency conflict detection
 * For any two distinct file content states (original and modified), submitting
 * the hash of the original content when the file currently contains the modified
 * content SHALL result in a CONFLICT rejection.
 */

// --- Generators ---

/** Arbitrary file content — any unicode string */
const contentArb = fc.string({ minLength: 0, maxLength: 2000 })

/** Two distinct content strings */
const distinctContentPairArb = fc
  .tuple(contentArb, contentArb)
  .filter(([a, b]) => a !== b)

// --- Property Tests ---

describe('Property 9: Content hash determinism', () => {
  it('computeContentHash() produces the same hash on every invocation for the same content', () => {
    fc.assert(
      fc.property(contentArb, (content) => {
        const hash1 = computeContentHash(content)
        const hash2 = computeContentHash(content)
        expect(hash1).toBe(hash2)
      }),
      { numRuns: 100 },
    )
  })

  it('different content strings produce different hashes', () => {
    fc.assert(
      fc.property(distinctContentPairArb, ([contentA, contentB]) => {
        const hashA = computeContentHash(contentA)
        const hashB = computeContentHash(contentB)
        expect(hashA).not.toBe(hashB)
      }),
      { numRuns: 100 },
    )
  })
})

describe('Property 10: Optimistic concurrency conflict detection', () => {
  it('submitting hash of original content when file contains modified content results in CONFLICT', () => {
    fc.assert(
      fc.property(distinctContentPairArb, ([originalContent, modifiedContent]) => {
        const originalHash = computeContentHash(originalContent)

        expect(() => {
          verifyContentHash(originalHash, modifiedContent)
        }).toThrow(ConflictError)
      }),
      { numRuns: 100 },
    )
  })

  it('ConflictError includes both submitted and current hashes', () => {
    fc.assert(
      fc.property(distinctContentPairArb, ([originalContent, modifiedContent]) => {
        const originalHash = computeContentHash(originalContent)
        const expectedCurrentHash = computeContentHash(modifiedContent)

        try {
          verifyContentHash(originalHash, modifiedContent)
          // Should not reach here
          expect.fail('Expected ConflictError to be thrown')
        } catch (err) {
          expect(err).toBeInstanceOf(ConflictError)
          const conflict = err as ConflictError
          expect(conflict.submittedHash).toBe(originalHash)
          expect(conflict.currentHash).toBe(expectedCurrentHash)
        }
      }),
      { numRuns: 100 },
    )
  })
})
