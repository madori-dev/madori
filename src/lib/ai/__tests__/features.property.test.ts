import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import type { ProviderAdapter, AiResponse, TokenUsage } from '../provider/interface'
import type { TokenTracker } from '../usage/tracker'
import { generateMetaTitle, generateMetaDescription } from '../features/seo'
import { validateBlueprintYaml, generateBlueprint } from '../features/blueprint'
import { VALID_FIELD_TYPES } from '../features/blueprint-schema'
import { getDerivableFields, type FieldValue, type BlueprintField } from '../features/auto-fill'
import { suggestTaxonomyTerms, type TaxonomyTerm } from '../features/taxonomy'
import { processBulk, type BulkEntry, type BulkProgressEvent } from '../features/bulk'
import { stringify } from 'yaml'

/**
 * Helper: creates a mock ProviderAdapter that returns arbitrary text from generateText.
 */
function createMockProvider(textResponse: string): ProviderAdapter {
  return {
    generateText: vi.fn().mockResolvedValue({
      text: textResponse,
      usage: { inputTokens: 10, outputTokens: 5 },
    } satisfies AiResponse),
    streamText: vi.fn(),
    generateWithVision: vi.fn(),
    generateStructured: vi.fn(),
  }
}

/**
 * Helper: creates a mock ProviderAdapter with generateStructured support.
 */
function createStructuredMockProvider<T>(data: T): ProviderAdapter {
  return {
    generateText: vi.fn().mockResolvedValue({
      text: '',
      usage: { inputTokens: 10, outputTokens: 5 },
    }),
    streamText: vi.fn(),
    generateWithVision: vi.fn(),
    generateStructured: vi.fn().mockResolvedValue({
      data,
      usage: { inputTokens: 10, outputTokens: 5 },
    }),
  }
}

/**
 * Property 8: SEO output respects length constraints
 * Meta title ≤ 60 chars, meta description ≤ 160 chars for any input content.
 * **Validates: Requirements 6.1, 6.2**
 */
describe('Property 8: SEO output respects length constraints', () => {
  it('generateMetaTitle always produces ≤ 60 characters', () => {
    fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 500 }),
        fc.string({ minLength: 0, maxLength: 300 }),
        async (content, providerResponse) => {
          const provider = createMockProvider(providerResponse)
          const result = await generateMetaTitle(content, { provider })
          expect(result.text.length).toBeLessThanOrEqual(60)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('generateMetaDescription always produces ≤ 160 characters', () => {
    fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 500 }),
        fc.string({ minLength: 0, maxLength: 500 }),
        async (content, providerResponse) => {
          const provider = createMockProvider(providerResponse)
          const result = await generateMetaDescription(content, { provider })
          expect(result.text.length).toBeLessThanOrEqual(160)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('truncates provider responses that exceed title limit', () => {
    fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 61, maxLength: 300 }),
        async (longResponse) => {
          const provider = createMockProvider(longResponse)
          const result = await generateMetaTitle('test content', { provider })
          expect(result.text.length).toBeLessThanOrEqual(60)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('truncates provider responses that exceed description limit', () => {
    fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 161, maxLength: 500 }),
        async (longResponse) => {
          const provider = createMockProvider(longResponse)
          const result = await generateMetaDescription('test content', { provider })
          expect(result.text.length).toBeLessThanOrEqual(160)
        },
      ),
      { numRuns: 100 },
    )
  })
})

/**
 * Property 9: Generated blueprints contain only valid FieldType values
 * Every field's type SHALL be a member of the FieldType union.
 * **Validates: Requirements 8.1, 8.2**
 */
describe('Property 9: Generated blueprints contain only valid FieldType values', () => {
  const arbFieldType = fc.constantFrom(...VALID_FIELD_TYPES)

  const arbField = fc.record({
    handle: fc.string({ minLength: 1, maxLength: 30 }).map((s) => s.replace(/[^a-z0-9_]/gi, '_').replace(/^_+/, 'f')),
    field: fc.record({
      type: arbFieldType,
      display: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    }),
  })

  const arbSection = fc.record({
    display: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    fields: fc.array(arbField, { minLength: 1, maxLength: 5 }),
  })

  const arbTab = fc.record({
    display: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    sections: fc.option(
      fc.dictionary(
        fc.string({ minLength: 1, maxLength: 20 }).map((s) => s.replace(/[^a-z0-9_]/gi, '_').replace(/^_+/, 's')),
        arbSection,
        { minKeys: 1, maxKeys: 3 },
      ),
      { nil: undefined },
    ),
    fields: fc.array(arbField, { minLength: 0, maxLength: 3 }),
  })

  const arbBlueprint = fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }).map((s) => s.replace(/[^a-z0-9_]/gi, '_').replace(/^_+/, 't')),
    arbTab,
    { minKeys: 1, maxKeys: 3 },
  ).map((tabs) => ({ tabs }))

  it('valid blueprints with valid field types pass validation', () => {
    fc.assert(
      fc.property(arbBlueprint, (blueprint) => {
        const yaml = stringify(blueprint, { indent: 2 })
        const result = validateBlueprintYaml(yaml)
        expect(result.valid).toBe(true)
        expect(result.errors).toBeUndefined()
      }),
      { numRuns: 200 },
    )
  })
})

/**
 * Property 10: Invalid blueprints produce specific validation errors
 * Invalid field types or structural violations return valid: false with descriptive errors.
 * **Validates: Requirements 8.4**
 */
describe('Property 10: Invalid blueprints produce specific validation errors', () => {
  it('blueprints with invalid field types fail validation', () => {
    const invalidFieldType = fc.string({ minLength: 1, maxLength: 30 })
      .filter((s) => !(VALID_FIELD_TYPES as readonly string[]).includes(s))

    fc.assert(
      fc.property(invalidFieldType, (badType) => {
        const blueprint = {
          tabs: {
            main: {
              fields: [
                { handle: 'test_field', field: { type: badType } },
              ],
            },
          },
        }
        const yaml = stringify(blueprint, { indent: 2 })
        const result = validateBlueprintYaml(yaml)
        expect(result.valid).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors!.length).toBeGreaterThan(0)
      }),
      { numRuns: 100 },
    )
  })

  it('blueprints with empty tabs object fail validation', () => {
    const blueprint = { tabs: {} }
    const yaml = stringify(blueprint, { indent: 2 })
    const result = validateBlueprintYaml(yaml)
    expect(result.valid).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors!.length).toBeGreaterThan(0)
  })

  it('blueprints with missing handle on fields fail validation', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_FIELD_TYPES),
        (fieldType) => {
          const blueprint = {
            tabs: {
              main: {
                fields: [
                  { handle: '', field: { type: fieldType } },
                ],
              },
            },
          }
          const yaml = stringify(blueprint, { indent: 2 })
          const result = validateBlueprintYaml(yaml)
          expect(result.valid).toBe(false)
          expect(result.errors).toBeDefined()
        },
      ),
      { numRuns: 50 },
    )
  })

  it('invalid YAML strings fail with parse error', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.includes('{') && !s.includes('}')),
        (invalidYaml) => {
          // Force YAML parse failure with unbalanced braces in flow style
          const brokenYaml = `tabs:\n  main:\n    fields: ${invalidYaml}`
          const result = validateBlueprintYaml(brokenYaml)
          // Either it fails to parse YAML or fails Zod validation
          expect(result.valid).toBe(false)
        },
      ),
      { numRuns: 50 },
    )
  })
})

/**
 * Property 11: Field auto-fill only suggests for derivable field pairs
 * getDerivableFields only returns handles where source fields are actually populated.
 * **Validates: Requirements 9.3**
 */
describe('Property 11: Field auto-fill only suggests for derivable field pairs', () => {
  // Known source handles from the DERIVATION_RULES
  const knownSources = [
    'title', 'name', 'heading', 'body', 'content', 'text', 'description',
    'author', 'author_name', 'price', 'address', 'city', 'state', 'zip',
    'first_name', 'last_name', 'url', 'link',
  ]

  // Handles that don't match any derivation rule source
  const nonSourceHandles = [
    'random_field', 'xyz_handle', 'foo_bar', 'baz_qux', 'widget_count',
  ]

  const arbPopulatedField = (handle: string): fc.Arbitrary<FieldValue> =>
    fc.record({
      handle: fc.constant(handle),
      value: fc.oneof(fc.string({ minLength: 1, maxLength: 100 }), fc.integer()),
      type: fc.constantFrom('text', 'textarea', 'tiptap'),
    })

  const arbEmptyField = (handle: string): fc.Arbitrary<BlueprintField> =>
    fc.record({
      handle: fc.constant(handle),
      type: fc.constantFrom('text', 'textarea', 'slug'),
      display: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    })

  it('returns empty when no populated fields', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom('slug', 'excerpt', 'summary', 'meta_title').chain((h) => arbEmptyField(h)),
          { minLength: 1, maxLength: 5 },
        ),
        (emptyFields) => {
          const result = getDerivableFields([], emptyFields)
          expect(result).toEqual([])
        },
      ),
      { numRuns: 50 },
    )
  })

  it('returns empty when no empty fields', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom(...knownSources).chain((h) => arbPopulatedField(h)),
          { minLength: 1, maxLength: 5 },
        ),
        (populatedFields) => {
          const result = getDerivableFields(populatedFields, [])
          expect(result).toEqual([])
        },
      ),
      { numRuns: 50 },
    )
  })

  it('returns empty when populated fields do not match any derivation rule source', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom(...nonSourceHandles).chain((h) => arbPopulatedField(h)),
          { minLength: 1, maxLength: 3 },
        ),
        fc.array(
          fc.constantFrom('slug', 'excerpt', 'summary', 'meta_title').chain((h) => arbEmptyField(h)),
          { minLength: 1, maxLength: 3 },
        ),
        (populatedFields, emptyFields) => {
          const result = getDerivableFields(populatedFields, emptyFields)
          expect(result).toEqual([])
        },
      ),
      { numRuns: 100 },
    )
  })

  it('only returns handles that exist in emptyFields', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom(...knownSources).chain((h) => arbPopulatedField(h)),
          { minLength: 1, maxLength: 5 },
        ),
        fc.array(
          fc.constantFrom('slug', 'excerpt', 'summary', 'meta_title', 'meta_description', 'og_title', 'seo_title').chain((h) => arbEmptyField(h)),
          { minLength: 1, maxLength: 5 },
        ),
        (populatedFields, emptyFields) => {
          const result = getDerivableFields(populatedFields, emptyFields)
          const emptyHandleSet = new Set(emptyFields.map((f) => f.handle.toLowerCase()))
          for (const field of result) {
            expect(emptyHandleSet.has(field.handle.toLowerCase())).toBe(true)
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})

/**
 * Property 12: Taxonomy suggestions are ordered by relevance score descending
 * Consecutive pairs satisfy score[i] >= score[i+1].
 * **Validates: Requirements 10.2**
 */
describe('Property 12: Taxonomy suggestions are ordered by relevance score descending', () => {
  it('suggestions are always sorted by score descending', () => {
    // Generate random scores for terms
    const arbScores = fc.array(
      fc.record({
        handle: fc.string({ minLength: 1, maxLength: 20 }).map((s) => s.replace(/[^a-z0-9]/gi, '') || 'term'),
        score: fc.double({ min: 0.01, max: 1, noNaN: true }),
      }),
      { minLength: 1, maxLength: 10 },
    )

    fc.assert(
      fc.asyncProperty(arbScores, async (scores) => {
        // Create unique terms
        const uniqueScores = scores.filter((s, i, arr) =>
          arr.findIndex((x) => x.handle === s.handle) === i,
        )

        if (uniqueScores.length === 0) return

        const existingTerms: TaxonomyTerm[] = uniqueScores.map((s) => ({
          handle: s.handle,
          title: s.handle,
        }))

        const mockProvider = createStructuredMockProvider({
          scores: uniqueScores,
        })

        const result = await suggestTaxonomyTerms(
          'test content about various topics',
          existingTerms,
          { provider: mockProvider },
        )

        // Verify descending order
        for (let i = 0; i < result.suggestions.length - 1; i++) {
          expect(result.suggestions[i].score).toBeGreaterThanOrEqual(
            result.suggestions[i + 1].score,
          )
        }
      }),
      { numRuns: 200 },
    )
  })

  it('scores are clamped between 0 and 1', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            handle: fc.constantFrom('tech', 'news', 'sports', 'culture'),
            score: fc.double({ min: -1, max: 2, noNaN: true }),
          }),
          { minLength: 1, maxLength: 4 },
        ),
        async (scores) => {
          const uniqueScores = scores.filter((s, i, arr) =>
            arr.findIndex((x) => x.handle === s.handle) === i,
          )

          const existingTerms: TaxonomyTerm[] = uniqueScores.map((s) => ({
            handle: s.handle,
            title: s.handle,
          }))

          const mockProvider = createStructuredMockProvider({ scores: uniqueScores })

          const result = await suggestTaxonomyTerms(
            'some content',
            existingTerms,
            { provider: mockProvider },
          )

          for (const suggestion of result.suggestions) {
            expect(suggestion.score).toBeGreaterThanOrEqual(0)
            expect(suggestion.score).toBeLessThanOrEqual(1)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

/**
 * Property 13: Bulk processor scope filtering
 * For any set of entries passed to processBulk, all entries are attempted (scope = input list).
 * **Validates: Requirements 11.1**
 */
describe('Property 13: Bulk processor scope filtering', () => {
  it('attempts all entries in the input list', () => {
    const arbEntries = fc.array(
      fc.record({
        id: fc.uuid(),
        collection: fc.constantFrom('blog', 'pages', 'docs'),
        content: fc.string({ minLength: 1, maxLength: 200 }),
      }),
      { minLength: 1, maxLength: 20 },
    )

    fc.assert(
      fc.asyncProperty(arbEntries, async (entries: BulkEntry[]) => {
        const attemptedIds: string[] = []

        const mockProvider: ProviderAdapter = {
          generateText: vi.fn().mockImplementation(async () => {
            return { text: 'generated', usage: { inputTokens: 10, outputTokens: 5 } }
          }),
          streamText: vi.fn(),
          generateWithVision: vi.fn(),
          generateStructured: vi.fn(),
        }

        const mockTracker: TokenTracker = {
          record: vi.fn().mockResolvedValue(undefined),
          checkLimit: vi.fn().mockResolvedValue({ allowed: true, currentTotal: 0 }),
          getUsage: vi.fn().mockResolvedValue([]),
          getAggregated: vi.fn().mockResolvedValue([]),
        }

        const onProgress = vi.fn((event: BulkProgressEvent) => {
          if (event.current) attemptedIds.push(event.current)
        })

        await processBulk('generate-meta-descriptions', entries, {
          provider: mockProvider,
          tracker: mockTracker,
          onProgress,
        })

        // Every entry should have been attempted
        for (const entry of entries) {
          expect(attemptedIds).toContain(entry.id)
        }
      }),
      { numRuns: 100 },
    )
  })
})

/**
 * Property 14: Bulk processor progress events are consistent
 * Final event: completed + errors = total = N.
 * **Validates: Requirements 11.2**
 */
describe('Property 14: Bulk processor progress events are consistent', () => {
  it('final event satisfies completed + errors == total == N', () => {
    const arbEntries = fc.array(
      fc.record({
        id: fc.uuid(),
        collection: fc.constant('blog'),
        content: fc.string({ minLength: 1, maxLength: 100 }),
      }),
      { minLength: 1, maxLength: 20 },
    )

    fc.assert(
      fc.asyncProperty(arbEntries, async (entries: BulkEntry[]) => {
        const N = entries.length

        const mockProvider: ProviderAdapter = {
          generateText: vi.fn().mockResolvedValue({
            text: 'meta desc',
            usage: { inputTokens: 10, outputTokens: 5 },
          }),
          streamText: vi.fn(),
          generateWithVision: vi.fn(),
          generateStructured: vi.fn(),
        }

        const mockTracker: TokenTracker = {
          record: vi.fn().mockResolvedValue(undefined),
          checkLimit: vi.fn().mockResolvedValue({ allowed: true, currentTotal: 0 }),
          getUsage: vi.fn().mockResolvedValue([]),
          getAggregated: vi.fn().mockResolvedValue([]),
        }

        const finalEvent = await processBulk('generate-meta-descriptions', entries, {
          provider: mockProvider,
          tracker: mockTracker,
        })

        expect(finalEvent.total).toBe(N)
        expect(finalEvent.completed + finalEvent.errors).toBe(N)
        expect(finalEvent.type).toBe('complete')
      }),
      { numRuns: 200 },
    )
  })
})

/**
 * Property 15: Bulk processor continues on failures
 * K failures out of N → attempts all N, final errors == K.
 * **Validates: Requirements 11.4**
 */
describe('Property 15: Bulk processor continues on failures', () => {
  it('K failures out of N entries → attempts all N, final errors == K', () => {
    // Generate entries and a set of indices that will fail
    const arbScenario = fc.integer({ min: 2, max: 15 }).chain((n) =>
      fc.record({
        n: fc.constant(n),
        failIndices: fc.uniqueArray(fc.integer({ min: 0, max: n - 1 }), { minLength: 1, maxLength: n }),
      }),
    )

    fc.assert(
      fc.asyncProperty(arbScenario, async ({ n, failIndices }) => {
        const failSet = new Set(failIndices)
        const K = failSet.size

        const entries: BulkEntry[] = Array.from({ length: n }, (_, i) => ({
          id: `entry-${i}`,
          collection: 'blog',
          content: `Content ${i}`,
        }))

        let callIndex = 0
        const mockProvider: ProviderAdapter = {
          generateText: vi.fn().mockImplementation(async () => {
            const idx = callIndex++
            if (failSet.has(idx)) {
              throw new Error(`Simulated failure at index ${idx}`)
            }
            return { text: 'generated', usage: { inputTokens: 10, outputTokens: 5 } }
          }),
          streamText: vi.fn(),
          generateWithVision: vi.fn(),
          generateStructured: vi.fn(),
        }

        const mockTracker: TokenTracker = {
          record: vi.fn().mockResolvedValue(undefined),
          checkLimit: vi.fn().mockResolvedValue({ allowed: true, currentTotal: 0 }),
          getUsage: vi.fn().mockResolvedValue([]),
          getAggregated: vi.fn().mockResolvedValue([]),
        }

        const finalEvent = await processBulk('generate-meta-descriptions', entries, {
          provider: mockProvider,
          tracker: mockTracker,
        })

        // All N entries were attempted
        expect(finalEvent.total).toBe(n)
        // Exactly K errors
        expect(finalEvent.errors).toBe(K)
        // completed = N - K
        expect(finalEvent.completed).toBe(n - K)
        // Still completes (doesn't abort)
        expect(finalEvent.type).toBe('complete')
      }),
      { numRuns: 100 },
    )
  })
})

/**
 * Property 16: Bulk processor halts when spend limit reached
 * Halts at M < N with status 'halted'.
 * **Validates: Requirements 11.5**
 */
describe('Property 16: Bulk processor halts when spend limit reached', () => {
  it('halts at M < N with status halted when limit is reached', () => {
    // Generate N entries and the index M at which the limit is reached
    const arbScenario = fc.integer({ min: 2, max: 20 }).chain((n) =>
      fc.record({
        n: fc.constant(n),
        haltAt: fc.integer({ min: 0, max: n - 1 }),
      }),
    )

    fc.assert(
      fc.asyncProperty(arbScenario, async ({ n, haltAt }) => {
        const entries: BulkEntry[] = Array.from({ length: n }, (_, i) => ({
          id: `entry-${i}`,
          collection: 'blog',
          content: `Content ${i}`,
        }))

        let checkCount = 0
        const mockTracker: TokenTracker = {
          record: vi.fn().mockResolvedValue(undefined),
          checkLimit: vi.fn().mockImplementation(async () => {
            const allowed = checkCount < haltAt
            checkCount++
            return { allowed, currentTotal: checkCount * 100, limit: haltAt * 100 }
          }),
          getUsage: vi.fn().mockResolvedValue([]),
          getAggregated: vi.fn().mockResolvedValue([]),
        }

        const mockProvider: ProviderAdapter = {
          generateText: vi.fn().mockResolvedValue({
            text: 'generated',
            usage: { inputTokens: 10, outputTokens: 5 },
          }),
          streamText: vi.fn(),
          generateWithVision: vi.fn(),
          generateStructured: vi.fn(),
        }

        const finalEvent = await processBulk('generate-meta-descriptions', entries, {
          provider: mockProvider,
          tracker: mockTracker,
        })

        // Should halt before processing all entries
        expect(finalEvent.type).toBe('halted')
        expect(finalEvent.status).toBe('halted')
        expect(finalEvent.completed).toBe(haltAt)
        expect(finalEvent.completed).toBeLessThan(n)
      }),
      { numRuns: 100 },
    )
  })
})
