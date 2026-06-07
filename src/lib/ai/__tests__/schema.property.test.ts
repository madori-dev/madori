import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { z } from 'zod'
import { AiConfigSchema, McpConfigSchema } from '../schema'

/**
 * Property 1: AI config validation accepts valid configs and rejects invalid ones
 * **Validates: Requirements 1.1, 1.6, 1.7**
 */
describe('Property 1: AI config validation', () => {
  // Arbitraries for valid config parts
  const validProvider = fc.constantFrom('anthropic' as const, 'openai-compatible' as const)
  const validUrl = fc.webUrl()
  const validApiKey = fc.string({ minLength: 1, maxLength: 200 })
  const validModel = fc.string({ minLength: 1, maxLength: 100 })
  const validPeriod = fc.constantFrom('daily' as const, 'weekly' as const, 'monthly' as const)

  const validSpendLimit = fc.record({
    maxTokens: fc.integer({ min: 1, max: 1_000_000 }),
    period: validPeriod,
  })

  const validFeatures = fc.record({
    editor: fc.boolean(),
    seo: fc.boolean(),
    altText: fc.boolean(),
    blueprints: fc.boolean(),
    autoFill: fc.boolean(),
    taxonomy: fc.boolean(),
    bulk: fc.boolean(),
  })

  const validAiConfig = fc.record({
    provider: validProvider,
    baseUrl: validUrl,
    apiKey: validApiKey,
    model: validModel,
    spendLimit: fc.option(validSpendLimit, { nil: undefined }),
    features: fc.option(validFeatures, { nil: undefined }),
  })

  it('accepts any valid config', () => {
    fc.assert(
      fc.property(validAiConfig, (config) => {
        const result = AiConfigSchema.safeParse(config)
        expect(result.success).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it('rejects configs with invalid provider values', () => {
    const invalidProvider = fc.string({ minLength: 1, maxLength: 50 })
      .filter((s) => s !== 'anthropic' && s !== 'openai-compatible')

    fc.assert(
      fc.property(
        invalidProvider,
        validUrl,
        validApiKey,
        validModel,
        (provider, baseUrl, apiKey, model) => {
          const result = AiConfigSchema.safeParse({ provider, baseUrl, apiKey, model })
          expect(result.success).toBe(false)
          if (!result.success) {
            const paths = result.error.issues.map((i) => i.path.join('.'))
            expect(paths).toContain('provider')
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('rejects configs with invalid URLs', () => {
    // Generate strings that Zod's .url() rejects — filter using the same validator
    const zodUrlCheck = z.string().url()
    const invalidUrl = fc.string({ minLength: 1, maxLength: 50 })
      .filter((s) => !zodUrlCheck.safeParse(s).success)

    fc.assert(
      fc.property(
        validProvider,
        invalidUrl,
        validApiKey,
        validModel,
        (provider, baseUrl, apiKey, model) => {
          const result = AiConfigSchema.safeParse({ provider, baseUrl, apiKey, model })
          expect(result.success).toBe(false)
          if (!result.success) {
            const paths = result.error.issues.map((i) => i.path.join('.'))
            expect(paths).toContain('baseUrl')
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('rejects configs with empty apiKey', () => {
    fc.assert(
      fc.property(
        validProvider,
        validUrl,
        validModel,
        (provider, baseUrl, model) => {
          const result = AiConfigSchema.safeParse({ provider, baseUrl, apiKey: '', model })
          expect(result.success).toBe(false)
          if (!result.success) {
            const paths = result.error.issues.map((i) => i.path.join('.'))
            expect(paths).toContain('apiKey')
          }
        },
      ),
      { numRuns: 50 },
    )
  })

  it('rejects configs with empty model', () => {
    fc.assert(
      fc.property(
        validProvider,
        validUrl,
        validApiKey,
        (provider, baseUrl, apiKey) => {
          const result = AiConfigSchema.safeParse({ provider, baseUrl, apiKey, model: '' })
          expect(result.success).toBe(false)
          if (!result.success) {
            const paths = result.error.issues.map((i) => i.path.join('.'))
            expect(paths).toContain('model')
          }
        },
      ),
      { numRuns: 50 },
    )
  })

  it('defaults all features to true when features not specified', () => {
    fc.assert(
      fc.property(
        validProvider,
        validUrl,
        validApiKey,
        validModel,
        (provider, baseUrl, apiKey, model) => {
          const result = AiConfigSchema.safeParse({ provider, baseUrl, apiKey, model })
          expect(result.success).toBe(true)
          if (result.success) {
            expect(result.data.features.editor).toBe(true)
            expect(result.data.features.seo).toBe(true)
            expect(result.data.features.altText).toBe(true)
            expect(result.data.features.blueprints).toBe(true)
            expect(result.data.features.autoFill).toBe(true)
            expect(result.data.features.taxonomy).toBe(true)
            expect(result.data.features.bulk).toBe(true)
          }
        },
      ),
      { numRuns: 50 },
    )
  })

  it('rejects spendLimit with non-positive maxTokens', () => {
    const nonPositiveTokens = fc.integer({ min: -1_000_000, max: 0 })

    fc.assert(
      fc.property(
        validProvider,
        validUrl,
        validApiKey,
        validModel,
        nonPositiveTokens,
        validPeriod,
        (provider, baseUrl, apiKey, model, maxTokens, period) => {
          const result = AiConfigSchema.safeParse({
            provider,
            baseUrl,
            apiKey,
            model,
            spendLimit: { maxTokens, period },
          })
          expect(result.success).toBe(false)
          if (!result.success) {
            const paths = result.error.issues.map((i) => i.path.join('.'))
            expect(paths.some((p) => p.startsWith('spendLimit'))).toBe(true)
          }
        },
      ),
      { numRuns: 50 },
    )
  })

  it('rejects spendLimit with invalid period enum', () => {
    const invalidPeriod = fc.string({ minLength: 1, maxLength: 30 })
      .filter((s) => s !== 'daily' && s !== 'weekly' && s !== 'monthly')

    fc.assert(
      fc.property(
        validProvider,
        validUrl,
        validApiKey,
        validModel,
        fc.integer({ min: 1, max: 1_000_000 }),
        invalidPeriod,
        (provider, baseUrl, apiKey, model, maxTokens, period) => {
          const result = AiConfigSchema.safeParse({
            provider,
            baseUrl,
            apiKey,
            model,
            spendLimit: { maxTokens, period },
          })
          expect(result.success).toBe(false)
          if (!result.success) {
            const paths = result.error.issues.map((i) => i.path.join('.'))
            expect(paths.some((p) => p.startsWith('spendLimit'))).toBe(true)
          }
        },
      ),
      { numRuns: 50 },
    )
  })

  it('McpConfigSchema defaults enabled to false and path to /api/mcp', () => {
    const result = McpConfigSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.enabled).toBe(false)
      expect(result.data.path).toBe('/api/mcp')
    }
  })
})
