// Feature: auth-adapter-system, Property 10: Plugin registry missing adapter error

import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { PluginRegistry } from '@/lib/auth/registry'
import { NotFoundError } from '@/lib/errors'

/**
 * Validates: Requirements 5.6
 *
 * Property 10: Plugin registry missing adapter error
 * - For any unregistered name, calling resolve throws NotFoundError
 *   with the adapter name and the contract type in the error message.
 */

// --- Setup ---

let registry: PluginRegistry

beforeEach(() => {
  registry = new PluginRegistry()
})

// --- Generators ---

/**
 * Generate arbitrary adapter names that are non-empty, filesystem-safe strings.
 * These names will never be registered, so resolve must always throw.
 */
const adapterNameArb = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,29}$/)
  .filter((name) => name.length >= 1 && !name.endsWith('-'))

// --- Property Tests ---

describe('Property 10: Plugin registry missing adapter error', () => {
  it('resolveDriver throws NotFoundError containing name and contract type for any unregistered name', () => {
    fc.assert(
      fc.property(adapterNameArb, (name) => {
        try {
          registry.resolveDriver(name)
          // Should not reach here
          expect.fail('Expected NotFoundError to be thrown')
        } catch (error) {
          expect(error).toBeInstanceOf(NotFoundError)
          const message = (error as NotFoundError).message
          expect(message).toContain(name)
          expect(message).toContain('AuthDriver')
        }
      }),
      { numRuns: 50 },
    )
  })

  it('resolveStore throws NotFoundError containing name and contract type for any unregistered name', () => {
    fc.assert(
      fc.property(adapterNameArb, (name) => {
        try {
          registry.resolveStore(name)
          expect.fail('Expected NotFoundError to be thrown')
        } catch (error) {
          expect(error).toBeInstanceOf(NotFoundError)
          const message = (error as NotFoundError).message
          expect(message).toContain(name)
          expect(message).toContain('SessionStore')
        }
      }),
      { numRuns: 50 },
    )
  })

  it('resolveProvider throws NotFoundError containing name and contract type for any unregistered name', () => {
    fc.assert(
      fc.property(adapterNameArb, (name) => {
        try {
          registry.resolveProvider(name)
          expect.fail('Expected NotFoundError to be thrown')
        } catch (error) {
          expect(error).toBeInstanceOf(NotFoundError)
          const message = (error as NotFoundError).message
          expect(message).toContain(name)
          expect(message).toContain('UserProvider')
        }
      }),
      { numRuns: 50 },
    )
  })
})
