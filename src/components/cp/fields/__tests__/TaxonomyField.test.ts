import { describe, it, expect } from 'vitest'
import { parseTerms, enforceMaxItems } from '../TaxonomyField'

describe('TaxonomyField helpers', () => {
  describe('parseTerms', () => {
    it('parses comma-separated string into trimmed terms', () => {
      expect(parseTerms('foo, bar, baz')).toEqual(['foo', 'bar', 'baz'])
    })

    it('filters out empty entries from trailing commas', () => {
      expect(parseTerms('foo, bar,')).toEqual(['foo', 'bar'])
    })

    it('handles array input', () => {
      expect(parseTerms(['alpha', 'beta'])).toEqual(['alpha', 'beta'])
    })

    it('returns empty array for undefined/null', () => {
      expect(parseTerms(undefined)).toEqual([])
      expect(parseTerms(null)).toEqual([])
    })

    it('returns empty array for empty string', () => {
      expect(parseTerms('')).toEqual([])
    })
  })

  describe('enforceMaxItems', () => {
    it('truncates terms to maxItems when exceeded', () => {
      expect(enforceMaxItems(['a', 'b', 'c', 'd'], 2)).toEqual(['a', 'b'])
    })

    it('returns all terms when under limit', () => {
      expect(enforceMaxItems(['a', 'b'], 5)).toEqual(['a', 'b'])
    })

    it('returns all terms when exactly at limit', () => {
      expect(enforceMaxItems(['a', 'b', 'c'], 3)).toEqual(['a', 'b', 'c'])
    })

    it('returns all terms when maxItems is 0 (unlimited)', () => {
      expect(enforceMaxItems(['a', 'b', 'c', 'd'], 0)).toEqual(['a', 'b', 'c', 'd'])
    })

    it('returns all terms when maxItems is undefined (unlimited)', () => {
      expect(enforceMaxItems(['a', 'b', 'c'], undefined)).toEqual(['a', 'b', 'c'])
    })

    it('handles maxItems of 1', () => {
      expect(enforceMaxItems(['a', 'b', 'c'], 1)).toEqual(['a'])
    })
  })
})
