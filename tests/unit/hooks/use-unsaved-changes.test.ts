import { describe, it, expect } from 'vitest'

/**
 * Tests for the unsaved changes detection logic.
 * The hook itself requires a React/DOM environment, so we test
 * the core serialization and comparison logic independently.
 */

// Extract the serialization logic used by the hook
function serialize(values: Record<string, unknown>): string {
  try {
    return JSON.stringify(values, (_key, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const sorted: Record<string, unknown> = {}
        for (const k of Object.keys(value).sort()) {
          sorted[k] = (value as Record<string, unknown>)[k]
        }
        return sorted
      }
      return value
    })
  } catch {
    return ''
  }
}

function isDirty(current: Record<string, unknown>, saved: Record<string, unknown>): boolean {
  return serialize(current) !== serialize(saved)
}

describe('unsaved changes detection logic', () => {
  it('detects no changes when values are identical', () => {
    const data = { title: 'Hello', slug: 'hello', status: 'draft' }
    expect(isDirty(data, data)).toBe(false)
  })

  it('detects no changes for equivalent objects', () => {
    const saved = { title: 'Hello', slug: 'hello', status: 'draft' }
    const current = { title: 'Hello', slug: 'hello', status: 'draft' }
    expect(isDirty(current, saved)).toBe(false)
  })

  it('detects changes when a field value differs', () => {
    const saved = { title: 'Hello', slug: 'hello', status: 'draft' }
    const current = { title: 'Updated', slug: 'hello', status: 'draft' }
    expect(isDirty(current, saved)).toBe(true)
  })

  it('detects changes when a field is added', () => {
    const saved = { title: 'Hello', slug: 'hello' }
    const current = { title: 'Hello', slug: 'hello', content: 'new content' }
    expect(isDirty(current, saved)).toBe(true)
  })

  it('detects changes for nested objects', () => {
    const saved = { title: 'Hello', data: { blocks: [{ _type: 'text', body: 'hi' }] } }
    const current = { title: 'Hello', data: { blocks: [{ _type: 'text', body: 'updated' }] } }
    expect(isDirty(current, saved)).toBe(true)
  })

  it('detects no changes for identical nested objects', () => {
    const saved = { title: 'Hello', data: { blocks: [{ _type: 'text', body: 'hi' }] } }
    const current = { title: 'Hello', data: { blocks: [{ _type: 'text', body: 'hi' }] } }
    expect(isDirty(current, saved)).toBe(false)
  })

  it('handles empty objects', () => {
    expect(isDirty({}, {})).toBe(false)
  })

  it('is order-independent for top-level keys', () => {
    const saved = { a: '1', b: '2', c: '3' }
    const current = { c: '3', a: '1', b: '2' }
    expect(isDirty(current, saved)).toBe(false)
  })

  it('handles null and undefined field values', () => {
    const saved = { title: 'Hello', content: null }
    const current = { title: 'Hello', content: null }
    expect(isDirty(current, saved)).toBe(false)
  })

  it('detects change from null to a value', () => {
    const saved = { title: 'Hello', content: null }
    const current = { title: 'Hello', content: 'something' }
    expect(isDirty(current, saved)).toBe(true)
  })

  it('handles circular references gracefully by returning empty string', () => {
    const obj: Record<string, unknown> = { title: 'Hello' }
    obj.self = obj
    // Both serialize to empty string, so isDirty returns false
    expect(serialize(obj)).toBe('')
  })
})
