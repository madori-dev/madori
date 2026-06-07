// Property 18: Disabled feature flags cause 404 on associated routes

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'

/**
 * Validates: Requirements 13.2, 13.4
 *
 * Properties:
 * 1. For any valid AiConfig with a feature flag set to false, `isFeatureEnabled` returns false for that feature
 * 2. For any valid AiConfig with all features defaulted (not specified), all `isFeatureEnabled` calls return true
 * 3. When ai config block is absent (undefined), `isFeatureEnabled` returns false for ALL features
 * 4. When ai config is invalid (wrong provider, missing fields), `isFeatureEnabled` returns false for all features
 * 5. For any combination of feature flags, only explicitly-disabled features return false
 */

// All feature keys in the AiFeatures schema
const ALL_FEATURES = ['editor', 'seo', 'altText', 'blueprints', 'autoFill', 'taxonomy', 'bulk'] as const
type FeatureKey = (typeof ALL_FEATURES)[number]

// --- Generators ---

/** Arbitrary valid provider */
const validProviderArb = fc.constantFrom('anthropic' as const, 'openai-compatible' as const)

/** Arbitrary valid base URL */
const validBaseUrlArb = fc.constantFrom('https://api.anthropic.com', 'https://api.openai.com/v1', 'http://localhost:11434')

/** Arbitrary non-empty string for apiKey and model */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0)

/** Arbitrary feature key */
const featureKeyArb = fc.constantFrom(...ALL_FEATURES)

/** Arbitrary feature flags object (all booleans) */
const featureFlagsArb = fc.record({
  editor: fc.boolean(),
  seo: fc.boolean(),
  altText: fc.boolean(),
  blueprints: fc.boolean(),
  autoFill: fc.boolean(),
  taxonomy: fc.boolean(),
  bulk: fc.boolean(),
})

/** Generator for a valid AI config with explicit feature flags */
const validAiConfigWithFeaturesArb = fc.record({
  provider: validProviderArb,
  baseUrl: validBaseUrlArb,
  apiKey: nonEmptyStringArb,
  model: nonEmptyStringArb,
  features: featureFlagsArb,
})

/** Generator for a valid AI config WITHOUT explicit features (defaults apply) */
const validAiConfigDefaultFeaturesArb = fc.record({
  provider: validProviderArb,
  baseUrl: validBaseUrlArb,
  apiKey: nonEmptyStringArb,
  model: nonEmptyStringArb,
})

/** Generator for invalid provider values */
const invalidProviderArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s !== 'anthropic' && s !== 'openai-compatible')

// --- Mocking ---

// We mock the madori.config module to control what rawConfig returns
vi.mock('../../../madori.config', () => ({
  default: {},
}))

// Import after mock setup
import * as middleware from '@/lib/ai/middleware'

// Get access to the mocked module so we can change its value between tests
import rawConfigModule from '../../../madori.config'

function setRawConfig(value: Record<string, unknown>) {
  // Override the default export value
  ;(rawConfigModule as Record<string, unknown>).default = undefined
  Object.keys(rawConfigModule as Record<string, unknown>).forEach((key) => {
    delete (rawConfigModule as Record<string, unknown>)[key]
  })
  Object.assign(rawConfigModule, value)
}

// --- Property Tests ---

describe('Property 18: Disabled feature flags cause 404 on associated routes', () => {
  beforeEach(() => {
    // Reset to empty config
    setRawConfig({})
  })

  it('for any valid AiConfig with a feature flag set to false, isFeatureEnabled returns false for that feature', () => {
    fc.assert(
      fc.property(validAiConfigWithFeaturesArb, featureKeyArb, (config, feature) => {
        // Only test when the feature is explicitly false
        fc.pre(config.features[feature] === false)

        setRawConfig({ ai: config })
        expect(middleware.isFeatureEnabled(feature)).toBe(false)
      }),
      { numRuns: 200 },
    )
  })

  it('for any valid AiConfig with all features defaulted, all isFeatureEnabled calls return true', () => {
    fc.assert(
      fc.property(validAiConfigDefaultFeaturesArb, featureKeyArb, (config, feature) => {
        setRawConfig({ ai: config })
        expect(middleware.isFeatureEnabled(feature)).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it('when ai config block is absent, isFeatureEnabled returns false for ALL features', () => {
    fc.assert(
      fc.property(featureKeyArb, (feature) => {
        setRawConfig({})
        expect(middleware.isFeatureEnabled(feature)).toBe(false)
      }),
      { numRuns: 50 },
    )
  })

  it('when ai config is invalid (wrong provider), isFeatureEnabled returns false for all features', () => {
    fc.assert(
      fc.property(invalidProviderArb, featureKeyArb, (badProvider, feature) => {
        setRawConfig({
          ai: {
            provider: badProvider,
            baseUrl: 'https://api.example.com',
            apiKey: 'test-key',
            model: 'test-model',
            features: {
              editor: true,
              seo: true,
              altText: true,
              blueprints: true,
              autoFill: true,
              taxonomy: true,
              bulk: true,
            },
          },
        })
        expect(middleware.isFeatureEnabled(feature)).toBe(false)
      }),
      { numRuns: 200 },
    )
  })

  it('for any combination of feature flags, only explicitly-disabled features return false', () => {
    fc.assert(
      fc.property(validAiConfigWithFeaturesArb, (config) => {
        setRawConfig({ ai: config })

        for (const feature of ALL_FEATURES) {
          const result = middleware.isFeatureEnabled(feature)
          if (config.features[feature] === true) {
            expect(result).toBe(true)
          } else {
            expect(result).toBe(false)
          }
        }
      }),
      { numRuns: 200 },
    )
  })

  it('isAiEnabled returns true only when ai config block is present and valid', () => {
    fc.assert(
      fc.property(validAiConfigDefaultFeaturesArb, (config) => {
        setRawConfig({ ai: config })
        expect(middleware.isAiEnabled()).toBe(true)
      }),
      { numRuns: 100 },
    )
  })

  it('isAiEnabled returns false when ai config block is absent', () => {
    setRawConfig({})
    expect(middleware.isAiEnabled()).toBe(false)
  })

  it('isAiEnabled returns false when ai config is invalid', () => {
    fc.assert(
      fc.property(invalidProviderArb, (badProvider) => {
        setRawConfig({
          ai: {
            provider: badProvider,
            baseUrl: 'https://api.example.com',
            apiKey: 'test-key',
            model: 'test-model',
          },
        })
        expect(middleware.isAiEnabled()).toBe(false)
      }),
      { numRuns: 100 },
    )
  })
})
