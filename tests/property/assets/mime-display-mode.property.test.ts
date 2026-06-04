// Property 9: Asset MIME Type Determines Display Mode

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { getDisplayMode } from '@/lib/content/assets'

/**
 * Validates: Requirements 8.5
 *
 * Property: For any asset with a MIME type, the display mode function SHALL return
 * 'thumbnail' if and only if the MIME type starts with 'image/', and 'icon' otherwise.
 */

// --- Generators ---

/** Arbitrary image MIME subtype (e.g. png, jpeg, svg+xml, webp) */
const imageSubtypeArb = fc.stringMatching(/^[a-z][a-z0-9+.-]{0,30}$/)

/** Arbitrary image MIME type that starts with 'image/' */
const imageMimeArb = imageSubtypeArb.map((sub) => `image/${sub}`)

/** Arbitrary non-image MIME type prefix (application, text, video, audio, font, etc.) */
const nonImagePrefixArb = fc.constantFrom(
  'application',
  'text',
  'video',
  'audio',
  'font',
  'multipart',
  'message',
  'model',
)

/** Arbitrary non-image MIME subtype */
const nonImageSubtypeArb = fc.stringMatching(/^[a-z][a-z0-9+.-]{0,30}$/)

/** Arbitrary non-image MIME type */
const nonImageMimeArb = fc
  .tuple(nonImagePrefixArb, nonImageSubtypeArb)
  .map(([prefix, sub]) => `${prefix}/${sub}`)

/** Arbitrary MIME type string (may not follow strict format, tests robustness) */
const arbitraryStringArb = fc
  .string({ minLength: 0, maxLength: 100 })
  .filter((s) => !s.startsWith('image/'))

// --- Property Tests ---

describe('Property 9: Asset MIME Type Determines Display Mode', () => {
  it('returns thumbnail for any MIME type starting with image/', () => {
    fc.assert(
      fc.property(imageMimeArb, (mime) => {
        expect(getDisplayMode(mime)).toBe('thumbnail')
      }),
      { numRuns: 100 },
    )
  })

  it('returns icon for any non-image MIME type', () => {
    fc.assert(
      fc.property(nonImageMimeArb, (mime) => {
        expect(getDisplayMode(mime)).toBe('icon')
      }),
      { numRuns: 100 },
    )
  })

  it('returns icon for arbitrary strings that do not start with image/', () => {
    fc.assert(
      fc.property(arbitraryStringArb, (mime) => {
        expect(getDisplayMode(mime)).toBe('icon')
      }),
      { numRuns: 100 },
    )
  })
})
