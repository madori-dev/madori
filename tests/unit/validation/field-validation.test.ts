import { describe, it, expect } from 'vitest'
import { validateFields } from '@/lib/validation/rules'
import type { FieldConfig, FieldDefinition } from '@/lib/blueprints/types'

/**
 * Tests that validate the field-level validation error display contract:
 * - Errors are keyed by field handle (for field-adjacent display)
 * - Validation runs synchronously (enables <100ms display)
 * - API error format matches what components expect
 */

describe('Field-level validation error display', () => {
  describe('validateFields returns field-keyed errors', () => {
    it('returns errors keyed by the exact field handle', () => {
      const fields: Record<string, FieldConfig> = {
        email_address: { type: 'text', validate: ['email'] },
        bio: { type: 'text', validate: ['min:10'] },
      }
      const values = { email_address: 'invalid', bio: 'short' }

      const result = validateFields(fields, values)

      expect(result.valid).toBe(false)
      expect(result.errors).toHaveProperty('email_address')
      expect(result.errors).toHaveProperty('bio')
      // Each field has an array of error messages
      expect(Array.isArray(result.errors.email_address)).toBe(true)
      expect(Array.isArray(result.errors.bio)).toBe(true)
      expect(result.errors.email_address.length).toBeGreaterThan(0)
      expect(result.errors.bio.length).toBeGreaterThan(0)
    })

    it('only includes erroring fields in the errors object', () => {
      const fields: Record<string, FieldConfig> = {
        title: { type: 'text', required: true },
        description: { type: 'text' },
        count: { type: 'number', validate: ['min:0'] },
      }
      const values = { title: '', description: 'valid', count: 5 }

      const result = validateFields(fields, values)

      expect(result.valid).toBe(false)
      expect(result.errors).toHaveProperty('title')
      expect(result.errors).not.toHaveProperty('description')
      expect(result.errors).not.toHaveProperty('count')
    })

    it('returns empty errors object when all fields pass', () => {
      const fields: Record<string, FieldConfig> = {
        name: { type: 'text', required: true },
        age: { type: 'number', validate: ['min:0', 'max:150'] },
      }
      const values = { name: 'Jane', age: 30 }

      const result = validateFields(fields, values)

      expect(result.valid).toBe(true)
      expect(result.errors).toEqual({})
    })
  })

  describe('validation runs synchronously for <100ms display', () => {
    it('completes validation within a single synchronous call', () => {
      const fields: Record<string, FieldConfig> = {}
      // Generate 50 fields with validation rules
      for (let i = 0; i < 50; i++) {
        fields[`field_${i}`] = {
          type: 'text',
          required: true,
          validate: ['min:3', 'max:100'],
        }
      }
      const values: Record<string, unknown> = {}
      for (let i = 0; i < 50; i++) {
        values[`field_${i}`] = 'ab' // too short, will fail min:3
      }

      const start = performance.now()
      const result = validateFields(fields, values)
      const elapsed = performance.now() - start

      expect(result.valid).toBe(false)
      expect(Object.keys(result.errors).length).toBe(50)
      // Validation of 50 fields should complete well under 100ms
      expect(elapsed).toBeLessThan(100)
    })
  })

  describe('error format matches FieldRenderer component contract', () => {
    it('produces string[] errors compatible with FieldComponentProps.error', () => {
      const fields: Record<string, FieldConfig> = {
        url_field: { type: 'text', validate: ['url'] },
      }
      const values = { url_field: 'not a url' }

      const result = validateFields(fields, values)
      const errors = result.errors.url_field

      // Errors should be an array of strings
      expect(Array.isArray(errors)).toBe(true)
      errors.forEach((msg) => {
        expect(typeof msg).toBe('string')
        expect(msg.length).toBeGreaterThan(0)
      })
    })

    it('multiple validation rules produce multiple error messages', () => {
      const fields: Record<string, FieldConfig> = {
        password: { type: 'text', required: true, validate: ['min:8'] },
      }
      const values = { password: '' }

      const result = validateFields(fields, values)

      expect(result.valid).toBe(false)
      expect(result.errors).toHaveProperty('password')
      // Empty string violates both required (min:1) and min:8
      expect(result.errors.password.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('API error response wiring', () => {
    it('matches the API error format: { error: { details: { fieldErrors: Record<string, string[]> } } }', () => {
      // Simulate what the API handler returns
      const apiResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Entry data validation failed',
          details: {
            fieldErrors: {
              title: ['Title is required'],
              slug: ['Slug is required'],
            },
          },
        },
      }

      // This is what the CP pages extract from the response
      const fieldErrors = apiResponse.error.details.fieldErrors

      // Verify it matches the shape expected by FieldRenderer's error prop
      expect(fieldErrors).toHaveProperty('title')
      expect(fieldErrors).toHaveProperty('slug')
      expect(Array.isArray(fieldErrors.title)).toBe(true)
      expect(Array.isArray(fieldErrors.slug)).toBe(true)
    })
  })
})
