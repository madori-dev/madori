import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { TypeGenerator } from '../type-generator.js'
import type { Blueprint, FieldConfig, FieldDefinition } from '@madori/lib/blueprints/types.js'

/**
 * Property 8: JSDoc metadata preservation
 *
 * For any generated interface field whose source blueprint field has a `display`
 * and/or `instructions` property, the generated TypeScript output SHALL contain
 * a JSDoc comment including that metadata. For select/multiselect fields, the
 * JSDoc SHALL include available options.
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.6**
 */

/** Generate a simple alphanumeric string suitable for display/instructions */
const alphanumericStringArb = fc
  .stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{0,30}$/)
  .filter((s) => s.trim().length > 0)

/** Generate a valid field handle (lowercase, alphanumeric, no special chars) */
const handleArb = fc
  .stringMatching(/^[a-z][a-z0-9]{1,15}$/)

/** Generate a valid blueprint handle */
const blueprintHandleArb = fc
  .stringMatching(/^[a-z][a-z0-9-]{1,15}$/)
  .filter((h) => !h.endsWith('-'))

/** Generate a simple option key for select/multiselect */
const optionKeyArb = fc
  .stringMatching(/^[a-z][a-z0-9]{1,10}$/)

describe('TypeGenerator — Property 8: JSDoc metadata preservation', () => {
  const generator = new TypeGenerator()

  it('fields with `display` produce @description in JSDoc', () => {
    fc.assert(
      fc.property(
        blueprintHandleArb,
        handleArb,
        alphanumericStringArb,
        (bpHandle, fieldHandle, displayValue) => {
          const blueprint: Blueprint = {
            handle: bpHandle,
            tabs: {
              main: {
                fields: [{
                  handle: fieldHandle,
                  field: {
                    type: 'text',
                    display: displayValue,
                  },
                }],
              },
            },
          }

          const [result] = generator.generate([blueprint])
          expect(result.content).toContain(`@description ${displayValue}`)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('fields with `instructions` produce instructions text in JSDoc', () => {
    fc.assert(
      fc.property(
        blueprintHandleArb,
        handleArb,
        alphanumericStringArb,
        (bpHandle, fieldHandle, instructionsValue) => {
          const blueprint: Blueprint = {
            handle: bpHandle,
            tabs: {
              main: {
                fields: [{
                  handle: fieldHandle,
                  field: {
                    type: 'text',
                    instructions: instructionsValue,
                  },
                }],
              },
            },
          }

          const [result] = generator.generate([blueprint])
          expect(result.content).toContain(instructionsValue)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('fields with both `display` and `instructions` produce both in JSDoc', () => {
    fc.assert(
      fc.property(
        blueprintHandleArb,
        handleArb,
        alphanumericStringArb,
        alphanumericStringArb,
        (bpHandle, fieldHandle, displayValue, instructionsValue) => {
          const blueprint: Blueprint = {
            handle: bpHandle,
            tabs: {
              main: {
                fields: [{
                  handle: fieldHandle,
                  field: {
                    type: 'text',
                    display: displayValue,
                    instructions: instructionsValue,
                  },
                }],
              },
            },
          }

          const [result] = generator.generate([blueprint])
          expect(result.content).toContain(`@description ${displayValue}`)
          expect(result.content).toContain(instructionsValue)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('select fields with options produce @enum annotation in JSDoc', () => {
    fc.assert(
      fc.property(
        blueprintHandleArb,
        handleArb,
        fc.uniqueArray(optionKeyArb, { minLength: 1, maxLength: 5 }),
        (bpHandle, fieldHandle, optionKeys) => {
          const options: Record<string, unknown> = {}
          for (const key of optionKeys) {
            options[key] = key.charAt(0).toUpperCase() + key.slice(1)
          }

          const blueprint: Blueprint = {
            handle: bpHandle,
            tabs: {
              main: {
                fields: [{
                  handle: fieldHandle,
                  field: {
                    type: 'select',
                    options,
                  },
                }],
              },
            },
          }

          const [result] = generator.generate([blueprint])
          const expectedEnum = `@enum {${optionKeys.join(', ')}}`
          expect(result.content).toContain(expectedEnum)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('multiselect fields with options produce @enum annotation in JSDoc', () => {
    fc.assert(
      fc.property(
        blueprintHandleArb,
        handleArb,
        fc.uniqueArray(optionKeyArb, { minLength: 1, maxLength: 5 }),
        (bpHandle, fieldHandle, optionKeys) => {
          const options: Record<string, unknown> = {}
          for (const key of optionKeys) {
            options[key] = key.charAt(0).toUpperCase() + key.slice(1)
          }

          const blueprint: Blueprint = {
            handle: bpHandle,
            tabs: {
              main: {
                fields: [{
                  handle: fieldHandle,
                  field: {
                    type: 'multiselect',
                    options,
                  },
                }],
              },
            },
          }

          const [result] = generator.generate([blueprint])
          const expectedEnum = `@enum {${optionKeys.join(', ')}}`
          expect(result.content).toContain(expectedEnum)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('each generated interface includes @see referencing source blueprint path', () => {
    fc.assert(
      fc.property(
        blueprintHandleArb,
        (bpHandle) => {
          const blueprint: Blueprint = {
            handle: bpHandle,
            tabs: {
              main: {
                fields: [{
                  handle: 'title',
                  field: { type: 'text' },
                }],
              },
            },
          }

          const [result] = generator.generate([blueprint])
          expect(result.content).toContain(
            `@see resources/blueprints/collections/${bpHandle}.yaml`
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})
