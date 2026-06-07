import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the raw config import used by middleware
vi.mock('../../../madori.config', () => ({
  default: {},
}))

import { isAiEnabled, isMcpEnabled, isFeatureEnabled } from '@/lib/ai/middleware'

// Get reference to the mocked module so we can change the config per test
const mockConfig = await vi.importMock<{ default: Record<string, unknown> }>('../../../madori.config')

const validAiConfig = {
  provider: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  apiKey: 'sk-test-key-12345',
  model: 'claude-sonnet-4-20250514',
}

describe('AI middleware utilities', () => {
  beforeEach(() => {
    // Reset to empty config before each test
    mockConfig.default = {}
  })

  describe('isAiEnabled', () => {
    it('returns false when ai config block is absent', () => {
      mockConfig.default = {}
      expect(isAiEnabled()).toBe(false)
    })

    it('returns true when ai config block is present and valid', () => {
      mockConfig.default = { ai: validAiConfig }
      expect(isAiEnabled()).toBe(true)
    })

    it('returns false when ai config block is invalid', () => {
      mockConfig.default = { ai: { provider: 'invalid-provider' } }
      expect(isAiEnabled()).toBe(false)
    })

    it('returns true when ai config has features with defaults', () => {
      mockConfig.default = { ai: validAiConfig }
      expect(isAiEnabled()).toBe(true)
    })
  })

  describe('isMcpEnabled', () => {
    it('returns false when mcp config block is absent', () => {
      mockConfig.default = {}
      expect(isMcpEnabled()).toBe(false)
    })

    it('returns false when mcp.enabled is false', () => {
      mockConfig.default = { mcp: { enabled: false } }
      expect(isMcpEnabled()).toBe(false)
    })

    it('returns true when mcp.enabled is true', () => {
      mockConfig.default = { mcp: { enabled: true } }
      expect(isMcpEnabled()).toBe(true)
    })

    it('returns false when mcp config is invalid', () => {
      mockConfig.default = { mcp: { enabled: 'not-a-boolean' } }
      expect(isMcpEnabled()).toBe(false)
    })
  })

  describe('isFeatureEnabled', () => {
    it('returns false when ai config block is absent', () => {
      mockConfig.default = {}
      expect(isFeatureEnabled('editor')).toBe(false)
      expect(isFeatureEnabled('seo')).toBe(false)
      expect(isFeatureEnabled('altText')).toBe(false)
    })

    it('returns true for all features by default when ai block is present', () => {
      mockConfig.default = { ai: validAiConfig }
      expect(isFeatureEnabled('editor')).toBe(true)
      expect(isFeatureEnabled('seo')).toBe(true)
      expect(isFeatureEnabled('altText')).toBe(true)
      expect(isFeatureEnabled('blueprints')).toBe(true)
      expect(isFeatureEnabled('autoFill')).toBe(true)
      expect(isFeatureEnabled('taxonomy')).toBe(true)
      expect(isFeatureEnabled('bulk')).toBe(true)
    })

    it('returns false when a specific feature is disabled', () => {
      mockConfig.default = {
        ai: { ...validAiConfig, features: { editor: false } },
      }
      expect(isFeatureEnabled('editor')).toBe(false)
    })

    it('returns true for other features when one is disabled', () => {
      mockConfig.default = {
        ai: { ...validAiConfig, features: { editor: false } },
      }
      // Other features should still default to true
      expect(isFeatureEnabled('seo')).toBe(true)
      expect(isFeatureEnabled('altText')).toBe(true)
    })

    it('returns false for all features when ai config is invalid', () => {
      mockConfig.default = { ai: { provider: 'bad' } }
      expect(isFeatureEnabled('editor')).toBe(false)
    })
  })
})
