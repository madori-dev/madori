// Unit tests for Optimistic Concurrency
// Validates: Requirements 6.5

import { describe, it, expect } from 'vitest'
import { computeContentHash, verifyContentHash } from '@/lib/content/concurrency'
import { ConflictError } from '@/lib/errors'

describe('computeContentHash', () => {
  it('produces the same hash for identical content on multiple calls', () => {
    const content = '---\ntitle: Hello World\n---\n\nSome content here.'
    const hash1 = computeContentHash(content)
    const hash2 = computeContentHash(content)
    const hash3 = computeContentHash(content)

    expect(hash1).toBe(hash2)
    expect(hash2).toBe(hash3)
  })

  it('produces a valid SHA-256 hex string (64 characters)', () => {
    const hash = computeContentHash('test content')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('produces different hashes for different content', () => {
    const hashA = computeContentHash('content version A')
    const hashB = computeContentHash('content version B')

    expect(hashA).not.toBe(hashB)
  })

  it('produces different hashes for content differing only by whitespace', () => {
    const hashA = computeContentHash('hello world')
    const hashB = computeContentHash('hello  world')

    expect(hashA).not.toBe(hashB)
  })

  it('handles empty string content', () => {
    const hash = computeContentHash('')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    // Empty string should still produce the same hash every time
    expect(hash).toBe(computeContentHash(''))
  })
})

describe('verifyContentHash', () => {
  it('does not throw when submitted hash matches current content', () => {
    const content = '---\ntitle: My Entry\n---\n\nBody text.'
    const hash = computeContentHash(content)

    expect(() => {
      verifyContentHash(hash, content)
    }).not.toThrow()
  })

  it('throws ConflictError when submitted hash does not match current content', () => {
    const originalContent = 'original version'
    const modifiedContent = 'modified version'
    const originalHash = computeContentHash(originalContent)

    expect(() => {
      verifyContentHash(originalHash, modifiedContent)
    }).toThrow(ConflictError)
  })

  it('ConflictError includes submittedHash and currentHash properties', () => {
    const originalContent = 'original'
    const modifiedContent = 'modified'
    const submittedHash = computeContentHash(originalContent)
    const expectedCurrentHash = computeContentHash(modifiedContent)

    try {
      verifyContentHash(submittedHash, modifiedContent)
      expect.fail('Expected ConflictError to be thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError)
      const conflict = err as ConflictError
      expect(conflict.submittedHash).toBe(submittedHash)
      expect(conflict.currentHash).toBe(expectedCurrentHash)
    }
  })

  it('ConflictError has CONFLICT error code', () => {
    const originalContent = 'v1'
    const modifiedContent = 'v2'
    const hash = computeContentHash(originalContent)

    try {
      verifyContentHash(hash, modifiedContent)
      expect.fail('Expected ConflictError to be thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError)
      expect((err as ConflictError).code).toBe('CONFLICT')
    }
  })

  it('does not throw when content is unchanged (hash matches)', () => {
    const content = '---\ntitle: Unchanged\n---\n\nStill the same.'
    const hash = computeContentHash(content)

    // Simulates re-reading the same content before writing
    expect(() => {
      verifyContentHash(hash, content)
    }).not.toThrow()
  })
})
