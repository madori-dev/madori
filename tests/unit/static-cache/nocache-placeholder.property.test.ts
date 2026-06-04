import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'

/**
 * Property 18: NoCache placeholder generation
 * Validates: Requirements 9.2, 9.3
 *
 * For any section identifier, when a cached page is served, the NoCache component
 * SHALL output a `<div>` element with `data-nocache-section` set to that identifier
 * and `data-nocache-endpoint` pointing to `/_nocache/{section}`.
 */

// Mock next/headers to control the `x-madori-cached` header value
vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))

import { headers } from 'next/headers'
import { NoCache } from '@/components/no-cache'

const mockedHeaders = vi.mocked(headers)

// Helper to render an async server component to its return value
async function renderNoCache(section: string, children: React.ReactNode) {
  return NoCache({ section, children })
}

describe('Property 18: NoCache placeholder generation', () => {
  // Arbitrary for section identifiers: alphanumeric strings (non-empty)
  const sectionId = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,30}$/)

  /**
   * **Validates: Requirements 9.2, 9.3**
   *
   * When serving from cache, the placeholder div has data-nocache-section
   * set to the section identifier.
   */
  it('placeholder contains data-nocache-section matching the section identifier', async () => {
    await fc.assert(
      fc.asyncProperty(sectionId, async (section) => {
        mockedHeaders.mockResolvedValue(
          new Headers({ 'x-madori-cached': '1' }) as any
        )

        const result = await renderNoCache(section, null)

        // Result should be a React element representing a div
        expect(result).not.toBeNull()
        const element = result as any
        expect(element.type).toBe('div')
        expect(element.props['data-nocache-section']).toBe(section)
      }),
      { numRuns: 200 }
    )
  })

  /**
   * **Validates: Requirements 9.2, 9.3**
   *
   * When serving from cache, the placeholder div has data-nocache-endpoint
   * pointing to `/_nocache/{section}`.
   */
  it('placeholder contains data-nocache-endpoint pointing to /_nocache/{section}', async () => {
    await fc.assert(
      fc.asyncProperty(sectionId, async (section) => {
        mockedHeaders.mockResolvedValue(
          new Headers({ 'x-madori-cached': '1' }) as any
        )

        const result = await renderNoCache(section, null)

        const element = result as any
        expect(element.type).toBe('div')
        expect(element.props['data-nocache-endpoint']).toBe(
          `/_nocache/${section}`
        )
      }),
      { numRuns: 200 }
    )
  })

  /**
   * **Validates: Requirements 9.2, 9.3**
   *
   * When NOT serving from cache, the component renders children directly
   * (no placeholder div).
   */
  it('renders children when not serving from cache', async () => {
    await fc.assert(
      fc.asyncProperty(sectionId, async (section) => {
        mockedHeaders.mockResolvedValue(new Headers() as any)

        const children = 'dynamic content'
        const result = await renderNoCache(section, children)

        // Should be a React fragment wrapping the children
        const element = result as any
        // When not cached, it returns <>{children}</> which is a fragment
        // The element type should not be 'div'
        if (element && element.type === 'div') {
          expect(element.props['data-nocache-section']).toBeUndefined()
        }
        // The children should be present in the result
        expect(element.props.children).toBe(children)
      }),
      { numRuns: 200 }
    )
  })
})
