import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  inferFieldTypeFromValue,
  inferFieldTypeFromSchema,
  type MadoriFieldType,
  type JsonSchemaProperty,
} from '../../../../packages/madori-cli/src/utils/field-type-inference.js'

/**
 * Property-based tests for field type inference.
 * Validates: Requirements 2.2, 2.3, 2.5
 */

const VALID_MADORI_FIELD_TYPES: MadoriFieldType[] = [
  'date',
  'toggle',
  'integer',
  'float',
  'tags',
  'text',
  'textarea',
  'select',
]

// --- Generators ---

/** JSON Schema with a known type */
const knownSchemaTypeArb = fc.constantFrom('string', 'number', 'integer', 'boolean', 'array')

/** JSON Schema property with a known type */
const validJsonSchemaPropertyArb: fc.Arbitrary<JsonSchemaProperty> = knownSchemaTypeArb.chain(
  (type) => {
    switch (type) {
      case 'string':
        return fc.constantFrom<JsonSchemaProperty>(
          { type: 'string' },
          { type: 'string', format: 'date' },
          { type: 'string', format: 'date-time' },
          { type: 'string', format: 'uri' },
        )
      case 'number':
        return fc.constant<JsonSchemaProperty>({ type: 'number' })
      case 'integer':
        return fc.constant<JsonSchemaProperty>({ type: 'integer' })
      case 'boolean':
        return fc.constant<JsonSchemaProperty>({ type: 'boolean' })
      case 'array':
        return fc.constantFrom<JsonSchemaProperty>(
          { type: 'array', items: { type: 'string' } },
          { type: 'array' },
        )
      default:
        return fc.constant<JsonSchemaProperty>({ type: 'string' })
    }
  }
)

/** Complex objects that are not primitives, arrays, strings, or null/undefined */
const complexObjectArb = fc.oneof(
  fc.record({ nested: fc.string() }),
  fc.record({ a: fc.integer(), b: fc.record({ c: fc.boolean() }) }),
  fc.record({}),
)

/** Non-empty string arrays for tags inference */
const nonEmptyStringArrayArb = fc.array(fc.string({ minLength: 1 }), {
  minLength: 1,
  maxLength: 10,
})

/** JSON Schema with a non-empty enum array */
const enumSchemaArb: fc.Arbitrary<JsonSchemaProperty> = fc
  .array(fc.oneof(fc.string(), fc.integer(), fc.boolean()), { minLength: 1, maxLength: 10 })
  .map((enumValues) => ({
    type: 'string' as const,
    enum: enumValues,
  }))

// --- Property Tests ---

describe('Property 4: JSON Schema to blueprint type mapping', () => {
  it('for any valid JSON Schema with a known type, inferFieldTypeFromSchema returns a valid MadoriFieldType', () => {
    /**
     * Validates: Requirements 2.3
     *
     * For any valid JSON Schema property with a known type (string, number,
     * integer, boolean, array), inferFieldTypeFromSchema should always return
     * a valid MadoriFieldType (one of the union members).
     */
    fc.assert(
      fc.property(validJsonSchemaPropertyArb, (schema) => {
        const result = inferFieldTypeFromSchema(schema)
        expect(VALID_MADORI_FIELD_TYPES).toContain(result.type)
        expect(['high', 'low']).toContain(result.confidence)
      }),
      { numRuns: 200 },
    )
  })
})

describe('Property 5: Unknown field types default to text', () => {
  it('for any complex object, inferFieldTypeFromValue returns { type: "text", confidence: "low" }', () => {
    /**
     * Validates: Requirements 2.5
     *
     * For any complex object (nested object, etc.) passed to inferFieldTypeFromValue,
     * the result should be { type: 'text', confidence: 'low' }.
     */
    fc.assert(
      fc.property(complexObjectArb, (value) => {
        const result = inferFieldTypeFromValue(value)
        expect(result.type).toBe('text')
        expect(result.confidence).toBe('low')
      }),
      { numRuns: 200 },
    )
  })
})

describe('Booleans always map to toggle', () => {
  it('for any boolean value, inferFieldTypeFromValue returns { type: "toggle", confidence: "high" }', () => {
    /**
     * Validates: Requirements 2.2
     *
     * For any boolean value, inferFieldTypeFromValue returns
     * { type: 'toggle', confidence: 'high' }.
     */
    fc.assert(
      fc.property(fc.boolean(), (value) => {
        const result = inferFieldTypeFromValue(value)
        expect(result.type).toBe('toggle')
        expect(result.confidence).toBe('high')
      }),
      { numRuns: 200 },
    )
  })
})

describe('Numbers map to integer or float', () => {
  it('for any number, inferFieldTypeFromValue returns integer or float with high confidence', () => {
    /**
     * Validates: Requirements 2.2
     *
     * For any number value, inferFieldTypeFromValue returns either 'integer'
     * (if integer) or 'float' (if not), always with 'high' confidence.
     */
    const finiteNumberArb = fc.oneof(
      fc.integer(),
      fc.double({ noNaN: true, noDefaultInfinity: true }),
    )

    fc.assert(
      fc.property(finiteNumberArb, (value) => {
        const result = inferFieldTypeFromValue(value)
        if (Number.isInteger(value)) {
          expect(result.type).toBe('integer')
        } else {
          expect(result.type).toBe('float')
        }
        expect(result.confidence).toBe('high')
      }),
      { numRuns: 200 },
    )
  })
})

describe('Arrays of strings map to tags', () => {
  it('for any non-empty array of strings, inferFieldTypeFromValue returns { type: "tags", confidence: "high" }', () => {
    /**
     * Validates: Requirements 2.2
     *
     * For any non-empty array of strings, inferFieldTypeFromValue returns
     * { type: 'tags', confidence: 'high' }.
     */
    fc.assert(
      fc.property(nonEmptyStringArrayArb, (value) => {
        const result = inferFieldTypeFromValue(value)
        expect(result.type).toBe('tags')
        expect(result.confidence).toBe('high')
      }),
      { numRuns: 200 },
    )
  })
})

describe('Enum schemas always map to select', () => {
  it('for any JSON Schema with a non-empty enum array, inferFieldTypeFromSchema returns { type: "select", confidence: "high" }', () => {
    /**
     * Validates: Requirements 2.3
     *
     * For any JSON Schema with a non-empty enum array, inferFieldTypeFromSchema
     * returns { type: 'select', confidence: 'high' }.
     */
    fc.assert(
      fc.property(enumSchemaArb, (schema) => {
        const result = inferFieldTypeFromSchema(schema)
        expect(result.type).toBe('select')
        expect(result.confidence).toBe('high')
      }),
      { numRuns: 200 },
    )
  })
})
