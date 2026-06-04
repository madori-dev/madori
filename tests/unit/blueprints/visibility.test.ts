import { describe, it, expect } from 'vitest'
import { evaluateCondition, filterPayloadByVisibility } from '@/lib/blueprints/visibility'
import type { VisibilityCondition } from '@/lib/blueprints/types'

describe('evaluateCondition', () => {
  describe('equals operator', () => {
    it('returns true when field value matches condition value', () => {
      const condition: VisibilityCondition = { field: 'status', operator: 'equals', value: 'active' }
      expect(evaluateCondition(condition, { status: 'active' })).toBe(true)
    })

    it('returns false when field value does not match', () => {
      const condition: VisibilityCondition = { field: 'status', operator: 'equals', value: 'active' }
      expect(evaluateCondition(condition, { status: 'inactive' })).toBe(false)
    })

    it('returns false when field is missing', () => {
      const condition: VisibilityCondition = { field: 'status', operator: 'equals', value: 'active' }
      expect(evaluateCondition(condition, {})).toBe(false)
    })
  })

  describe('not_equals operator', () => {
    it('returns true when field value differs from condition value', () => {
      const condition: VisibilityCondition = { field: 'type', operator: 'not_equals', value: 'hidden' }
      expect(evaluateCondition(condition, { type: 'visible' })).toBe(true)
    })

    it('returns false when field value matches condition value', () => {
      const condition: VisibilityCondition = { field: 'type', operator: 'not_equals', value: 'hidden' }
      expect(evaluateCondition(condition, { type: 'hidden' })).toBe(false)
    })

    it('returns true when field is missing (undefined !== value)', () => {
      const condition: VisibilityCondition = { field: 'type', operator: 'not_equals', value: 'hidden' }
      expect(evaluateCondition(condition, {})).toBe(true)
    })
  })

  describe('contains operator', () => {
    it('returns true when string field contains the value', () => {
      const condition: VisibilityCondition = { field: 'tags', operator: 'contains', value: 'featured' }
      expect(evaluateCondition(condition, { tags: 'featured,popular' })).toBe(true)
    })

    it('returns false when string field does not contain the value', () => {
      const condition: VisibilityCondition = { field: 'tags', operator: 'contains', value: 'featured' }
      expect(evaluateCondition(condition, { tags: 'popular,trending' })).toBe(false)
    })

    it('returns false when field is not a string', () => {
      const condition: VisibilityCondition = { field: 'count', operator: 'contains', value: '5' }
      expect(evaluateCondition(condition, { count: 5 })).toBe(false)
    })

    it('returns false when field is missing', () => {
      const condition: VisibilityCondition = { field: 'tags', operator: 'contains', value: 'x' }
      expect(evaluateCondition(condition, {})).toBe(false)
    })
  })

  describe('empty operator', () => {
    it('returns true when field is undefined', () => {
      const condition: VisibilityCondition = { field: 'name', operator: 'empty' }
      expect(evaluateCondition(condition, {})).toBe(true)
    })

    it('returns true when field is null', () => {
      const condition: VisibilityCondition = { field: 'name', operator: 'empty' }
      expect(evaluateCondition(condition, { name: null })).toBe(true)
    })

    it('returns true when field is empty string', () => {
      const condition: VisibilityCondition = { field: 'name', operator: 'empty' }
      expect(evaluateCondition(condition, { name: '' })).toBe(true)
    })

    it('returns false when field has a value', () => {
      const condition: VisibilityCondition = { field: 'name', operator: 'empty' }
      expect(evaluateCondition(condition, { name: 'hello' })).toBe(false)
    })
  })

  describe('not_empty operator', () => {
    it('returns true when field has a non-empty value', () => {
      const condition: VisibilityCondition = { field: 'title', operator: 'not_empty' }
      expect(evaluateCondition(condition, { title: 'Hello' })).toBe(true)
    })

    it('returns false when field is undefined', () => {
      const condition: VisibilityCondition = { field: 'title', operator: 'not_empty' }
      expect(evaluateCondition(condition, {})).toBe(false)
    })

    it('returns false when field is null', () => {
      const condition: VisibilityCondition = { field: 'title', operator: 'not_empty' }
      expect(evaluateCondition(condition, { title: null })).toBe(false)
    })

    it('returns false when field is empty string', () => {
      const condition: VisibilityCondition = { field: 'title', operator: 'not_empty' }
      expect(evaluateCondition(condition, { title: '' })).toBe(false)
    })
  })
})

describe('filterPayloadByVisibility', () => {
  it('includes fields without visibility conditions', () => {
    const fields = [{ handle: 'title' }, { handle: 'body' }]
    const values = { title: 'Hello', body: 'World' }

    expect(filterPayloadByVisibility(fields, values)).toEqual({ title: 'Hello', body: 'World' })
  })

  it('excludes fields whose visibility condition is false', () => {
    const fields = [
      { handle: 'title' },
      { handle: 'subtitle', visibility: { field: 'has_subtitle', operator: 'equals' as const, value: true } },
    ]
    const values = { title: 'Hello', subtitle: 'Sub', has_subtitle: false }

    expect(filterPayloadByVisibility(fields, values)).toEqual({ title: 'Hello' })
  })

  it('includes fields whose visibility condition is true', () => {
    const fields = [
      { handle: 'title' },
      { handle: 'subtitle', visibility: { field: 'has_subtitle', operator: 'equals' as const, value: true } },
    ]
    const values = { title: 'Hello', subtitle: 'Sub', has_subtitle: true }

    expect(filterPayloadByVisibility(fields, values)).toEqual({ title: 'Hello', subtitle: 'Sub' })
  })

  it('does not include fields that have no value in the form state', () => {
    const fields = [{ handle: 'title' }, { handle: 'missing' }]
    const values = { title: 'Hello' }

    expect(filterPayloadByVisibility(fields, values)).toEqual({ title: 'Hello' })
  })

  it('handles mixed visible and hidden fields', () => {
    const fields = [
      { handle: 'name' },
      { handle: 'email', visibility: { field: 'name', operator: 'not_empty' as const } },
      { handle: 'phone', visibility: { field: 'name', operator: 'empty' as const } },
    ]
    const values = { name: 'Alice', email: 'a@b.com', phone: '555-1234' }

    const result = filterPayloadByVisibility(fields, values)
    expect(result).toEqual({ name: 'Alice', email: 'a@b.com' })
  })
})
