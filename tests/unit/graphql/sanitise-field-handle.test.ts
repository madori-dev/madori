import { describe, it, expect } from 'vitest'
import { sanitiseFieldHandle, isValidGraphQLIdentifier } from '@/lib/graphql/sanitise-field-handle'

describe('sanitiseFieldHandle', () => {
  describe('valid handles pass through unchanged', () => {
    it('passes simple lowercase handles', () => {
      expect(sanitiseFieldHandle('title')).toBe('title')
    })

    it('passes handles with underscores', () => {
      expect(sanitiseFieldHandle('meta_description')).toBe('meta_description')
    })

    it('passes handles starting with underscore', () => {
      expect(sanitiseFieldHandle('_private')).toBe('_private')
    })

    it('passes handles with mixed case', () => {
      expect(sanitiseFieldHandle('myField')).toBe('myField')
    })

    it('passes handles with numbers', () => {
      expect(sanitiseFieldHandle('field1')).toBe('field1')
    })
  })

  describe('invalid characters are replaced', () => {
    it('replaces hyphens with underscores', () => {
      expect(sanitiseFieldHandle('my-field')).toBe('my_field')
    })

    it('replaces dots with underscores', () => {
      expect(sanitiseFieldHandle('meta.title')).toBe('meta_title')
    })

    it('replaces spaces with underscores', () => {
      expect(sanitiseFieldHandle('my field')).toBe('my_field')
    })

    it('replaces multiple invalid chars', () => {
      expect(sanitiseFieldHandle('my-field.name')).toBe('my_field_name')
    })

    it('replaces special characters', () => {
      expect(sanitiseFieldHandle('field@name!')).toBe('field_name')
    })
  })

  describe('leading digits are handled', () => {
    it('prefixes with underscore when starts with digit', () => {
      expect(sanitiseFieldHandle('1field')).toBe('_1field')
    })

    it('prefixes with underscore for all-numeric handle', () => {
      expect(sanitiseFieldHandle('123')).toBe('_123')
    })

    it('handles digit after invalid char removal', () => {
      expect(sanitiseFieldHandle('99bottles')).toBe('_99bottles')
    })
  })

  describe('reserved GraphQL names are prefixed', () => {
    it('prefixes __typename', () => {
      expect(sanitiseFieldHandle('__typename')).toBe('field_typename')
    })

    it('prefixes __type', () => {
      expect(sanitiseFieldHandle('__type')).toBe('field_type')
    })

    it('prefixes __schema', () => {
      expect(sanitiseFieldHandle('__schema')).toBe('field_schema')
    })
  })

  describe('consecutive underscores are collapsed', () => {
    it('collapses multiple underscores', () => {
      expect(sanitiseFieldHandle('my__field')).toBe('my_field')
    })

    it('collapses underscores from replaced chars', () => {
      expect(sanitiseFieldHandle('my--field')).toBe('my_field')
    })
  })

  describe('edge cases', () => {
    it('returns fallback for empty string', () => {
      expect(sanitiseFieldHandle('')).toBe('_field')
    })

    it('returns fallback for whitespace-only string', () => {
      expect(sanitiseFieldHandle('   ')).toBe('_field')
    })

    it('returns fallback for all-invalid characters', () => {
      expect(sanitiseFieldHandle('---')).toBe('_field')
    })

    it('trims trailing underscores', () => {
      expect(sanitiseFieldHandle('field_')).toBe('field')
    })

    it('trims trailing underscores from replaced chars', () => {
      expect(sanitiseFieldHandle('field-')).toBe('field')
    })
  })
})

describe('isValidGraphQLIdentifier', () => {
  it('accepts valid identifiers', () => {
    expect(isValidGraphQLIdentifier('title')).toBe(true)
    expect(isValidGraphQLIdentifier('_private')).toBe(true)
    expect(isValidGraphQLIdentifier('myField1')).toBe(true)
    expect(isValidGraphQLIdentifier('A')).toBe(true)
  })

  it('rejects invalid identifiers', () => {
    expect(isValidGraphQLIdentifier('1field')).toBe(false)
    expect(isValidGraphQLIdentifier('my-field')).toBe(false)
    expect(isValidGraphQLIdentifier('')).toBe(false)
    expect(isValidGraphQLIdentifier('my field')).toBe(false)
  })
})
