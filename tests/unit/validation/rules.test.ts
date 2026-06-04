import { describe, it, expect, vi } from 'vitest'
import {
  isRuleApplicable,
  buildFieldSchema,
  validateFields,
  parseRule,
} from '@/lib/validation/rules'
import type { FieldConfig } from '@/lib/blueprints/types'

describe('parseRule', () => {
  it('parses a simple rule name', () => {
    expect(parseRule('required')).toEqual(['required', undefined])
  })

  it('parses a rule with parameter', () => {
    expect(parseRule('max:60')).toEqual(['max', '60'])
  })

  it('parses a regex rule preserving colons in param', () => {
    expect(parseRule('regex:^https?://')).toEqual(['regex', '^https?://'])
  })

  it('parses numeric_range with comma-separated params', () => {
    expect(parseRule('numeric_range:1,100')).toEqual(['numeric_range', '1,100'])
  })
})

describe('isRuleApplicable', () => {
  it('required is applicable to all field types', () => {
    expect(isRuleApplicable('required', 'text')).toBe(true)
    expect(isRuleApplicable('required', 'number')).toBe(true)
    expect(isRuleApplicable('required', 'toggle')).toBe(true)
    expect(isRuleApplicable('required', 'select')).toBe(true)
  })

  it('min/max apply to text-like fields', () => {
    expect(isRuleApplicable('min', 'text')).toBe(true)
    expect(isRuleApplicable('max', 'markdown')).toBe(true)
    expect(isRuleApplicable('max', 'tiptap')).toBe(true)
    expect(isRuleApplicable('min', 'code')).toBe(true)
  })

  it('regex/url/email apply to text-like fields', () => {
    expect(isRuleApplicable('regex', 'text')).toBe(true)
    expect(isRuleApplicable('url', 'text')).toBe(true)
    expect(isRuleApplicable('email', 'text')).toBe(true)
  })

  it('min/max/numeric_range apply to number fields', () => {
    expect(isRuleApplicable('min', 'number')).toBe(true)
    expect(isRuleApplicable('max', 'number')).toBe(true)
    expect(isRuleApplicable('numeric_range', 'number')).toBe(true)
  })

  it('text rules do not apply to number fields', () => {
    expect(isRuleApplicable('regex', 'number')).toBe(false)
    expect(isRuleApplicable('url', 'number')).toBe(false)
    expect(isRuleApplicable('email', 'number')).toBe(false)
  })

  it('non-text/non-number fields only support required', () => {
    expect(isRuleApplicable('min', 'toggle')).toBe(false)
    expect(isRuleApplicable('max', 'select')).toBe(false)
    expect(isRuleApplicable('regex', 'asset')).toBe(false)
  })
})

describe('buildFieldSchema', () => {
  it('validates required text field rejects empty string', () => {
    const field: FieldConfig = { type: 'text', required: true }
    const schema = buildFieldSchema(field)
    expect(schema.safeParse('').success).toBe(false)
    expect(schema.safeParse('hello').success).toBe(true)
  })

  it('validates optional text field accepts undefined', () => {
    const field: FieldConfig = { type: 'text' }
    const schema = buildFieldSchema(field)
    expect(schema.safeParse(undefined).success).toBe(true)
    expect(schema.safeParse('hello').success).toBe(true)
  })

  it('enforces max length on text fields', () => {
    const field: FieldConfig = { type: 'text', validate: ['max:5'] }
    const schema = buildFieldSchema(field)
    expect(schema.safeParse('hi').success).toBe(true)
    expect(schema.safeParse('toolong').success).toBe(false)
  })

  it('enforces min length on text fields', () => {
    const field: FieldConfig = { type: 'text', validate: ['min:3'] }
    const schema = buildFieldSchema(field)
    expect(schema.safeParse('hi').success).toBe(false)
    expect(schema.safeParse('hey').success).toBe(true)
  })

  it('enforces email rule', () => {
    const field: FieldConfig = { type: 'text', validate: ['email'] }
    const schema = buildFieldSchema(field)
    expect(schema.safeParse('not-an-email').success).toBe(false)
    expect(schema.safeParse('user@example.com').success).toBe(true)
  })

  it('enforces url rule', () => {
    const field: FieldConfig = { type: 'text', validate: ['url'] }
    const schema = buildFieldSchema(field)
    expect(schema.safeParse('not-a-url').success).toBe(false)
    expect(schema.safeParse('https://example.com').success).toBe(true)
  })

  it('enforces regex rule', () => {
    const field: FieldConfig = { type: 'text', validate: ['regex:^[a-z]+$'] }
    const schema = buildFieldSchema(field)
    expect(schema.safeParse('hello').success).toBe(true)
    expect(schema.safeParse('Hello123').success).toBe(false)
  })

  it('enforces numeric min/max', () => {
    const field: FieldConfig = { type: 'number', validate: ['min:5', 'max:10'] }
    const schema = buildFieldSchema(field)
    expect(schema.safeParse(3).success).toBe(false)
    expect(schema.safeParse(7).success).toBe(true)
    expect(schema.safeParse(12).success).toBe(false)
  })

  it('enforces numeric_range', () => {
    const field: FieldConfig = { type: 'number', validate: ['numeric_range:1,100'] }
    const schema = buildFieldSchema(field)
    expect(schema.safeParse(0).success).toBe(false)
    expect(schema.safeParse(50).success).toBe(true)
    expect(schema.safeParse(101).success).toBe(false)
  })

  it('ignores incompatible rules and logs console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // 'email' rule is not applicable to 'number' fields
    const field: FieldConfig = { type: 'number', validate: ['email'] }
    const schema = buildFieldSchema(field)

    // Should still produce a valid schema (incompatible rule is skipped)
    expect(schema.safeParse(42).success).toBe(true)

    // Should have warned about the incompatible rule
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('email')
    )
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('number')
    )

    warnSpy.mockRestore()
  })

  it('ignores multiple incompatible rules and warns for each', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // 'url' and 'regex' are not applicable to 'toggle' fields
    const field: FieldConfig = { type: 'toggle', validate: ['url', 'regex:^test$'] }
    const schema = buildFieldSchema(field)

    // Schema still works — incompatible rules are ignored
    expect(schema.safeParse(true).success).toBe(true)

    // Should have warned twice
    expect(warnSpy).toHaveBeenCalledTimes(2)

    warnSpy.mockRestore()
  })

  it('applies compatible rules even when mixed with incompatible ones', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // 'required' is universal, 'email' is not applicable to 'number'
    const field: FieldConfig = { type: 'number', required: true, validate: ['min:5', 'email'] }
    const schema = buildFieldSchema(field)

    // min:5 should still be enforced
    expect(schema.safeParse(3).success).toBe(false)
    expect(schema.safeParse(7).success).toBe(true)

    // email was skipped with warning
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('email')
    )

    warnSpy.mockRestore()
  })
})

describe('validateFields', () => {
  it('returns valid when all fields pass', () => {
    const fields: Record<string, FieldConfig> = {
      title: { type: 'text', required: true },
      count: { type: 'number', validate: ['min:0'] },
    }
    const values = { title: 'Hello', count: 5 }
    const result = validateFields(fields, values)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual({})
  })

  it('returns errors keyed by field handle', () => {
    const fields: Record<string, FieldConfig> = {
      title: { type: 'text', required: true },
      email: { type: 'text', validate: ['email'] },
    }
    const values = { title: '', email: 'bad' }
    const result = validateFields(fields, values)
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveProperty('title')
    expect(result.errors).toHaveProperty('email')
  })

  it('does not return errors for fields that pass', () => {
    const fields: Record<string, FieldConfig> = {
      title: { type: 'text', required: true },
      body: { type: 'markdown' },
    }
    const values = { title: 'Hello', body: undefined }
    const result = validateFields(fields, values)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual({})
  })
})
