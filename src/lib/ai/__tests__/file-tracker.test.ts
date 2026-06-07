import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { rm, readFile } from 'node:fs/promises'
import path from 'node:path'
import { FileTokenTracker } from '../usage/file-tracker'
import type { UsageRecord } from '../usage/tracker'

const TEST_STORAGE = path.resolve(process.cwd(), 'storage/ai-test-tracker')

// Mock getAiConfig to control spend limit behavior
vi.mock('@/lib/ai/schema', () => ({
  getAiConfig: vi.fn(),
}))

import { getAiConfig } from '@/lib/ai/schema'
const mockGetAiConfig = vi.mocked(getAiConfig)

describe('FileTokenTracker', () => {
  let tracker: FileTokenTracker

  beforeEach(() => {
    tracker = new FileTokenTracker({ storagePath: TEST_STORAGE })
    mockGetAiConfig.mockResolvedValue(undefined)
  })

  afterEach(async () => {
    await rm(TEST_STORAGE, { recursive: true, force: true })
  })

  describe('record()', () => {
    it('creates storage directory and file on first write', async () => {
      await tracker.record({
        operation: 'editor.generate',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 100,
        outputTokens: 200,
      })

      const content = await readFile(path.join(TEST_STORAGE, 'usage.json'), 'utf-8')
      const records = JSON.parse(content)
      expect(records).toHaveLength(1)
      expect(records[0].operation).toBe('editor.generate')
      expect(records[0].model).toBe('claude-sonnet-4-20250514')
      expect(records[0].inputTokens).toBe(100)
      expect(records[0].outputTokens).toBe(200)
      expect(records[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('appends multiple records', async () => {
      await tracker.record({ operation: 'seo.title', model: 'gpt-4', inputTokens: 50, outputTokens: 30 })
      await tracker.record({ operation: 'alt-text', model: 'gpt-4', inputTokens: 200, outputTokens: 50 })

      const records = await tracker.getUsage()
      expect(records).toHaveLength(2)
    })
  })

  describe('checkLimit()', () => {
    it('returns allowed: true when no limit configured', async () => {
      mockGetAiConfig.mockResolvedValue(undefined)
      const result = await tracker.checkLimit()
      expect(result.allowed).toBe(true)
      expect(result.currentTotal).toBe(0)
      expect(result.limit).toBeUndefined()
    })

    it('returns allowed: true when under limit', async () => {
      mockGetAiConfig.mockResolvedValue({
        provider: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-test',
        model: 'claude-sonnet-4-20250514',
        spendLimit: { maxTokens: 10000, period: 'daily' },
        features: { editor: true, seo: true, altText: true, blueprints: true, autoFill: true, taxonomy: true, bulk: true },
      })

      await tracker.record({ operation: 'editor.generate', model: 'claude-sonnet-4-20250514', inputTokens: 100, outputTokens: 200 })

      const result = await tracker.checkLimit()
      expect(result.allowed).toBe(true)
      expect(result.currentTotal).toBe(300)
      expect(result.limit).toBe(10000)
    })

    it('returns allowed: false when at or over limit', async () => {
      mockGetAiConfig.mockResolvedValue({
        provider: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-test',
        model: 'claude-sonnet-4-20250514',
        spendLimit: { maxTokens: 500, period: 'daily' },
        features: { editor: true, seo: true, altText: true, blueprints: true, autoFill: true, taxonomy: true, bulk: true },
      })

      await tracker.record({ operation: 'editor.generate', model: 'claude-sonnet-4-20250514', inputTokens: 300, outputTokens: 300 })

      const result = await tracker.checkLimit()
      expect(result.allowed).toBe(false)
      expect(result.currentTotal).toBe(600)
      expect(result.limit).toBe(500)
    })
  })

  describe('getUsage()', () => {
    beforeEach(async () => {
      // Seed records with known timestamps by writing directly
      const records: UsageRecord[] = [
        { timestamp: '2025-01-15T10:00:00.000Z', operation: 'editor.generate', model: 'claude-sonnet-4-20250514', inputTokens: 100, outputTokens: 200 },
        { timestamp: '2025-01-16T10:00:00.000Z', operation: 'seo.title', model: 'claude-sonnet-4-20250514', inputTokens: 50, outputTokens: 30 },
        { timestamp: '2025-01-17T10:00:00.000Z', operation: 'alt-text', model: 'gpt-4', inputTokens: 200, outputTokens: 50 },
      ]
      const { mkdir, writeFile } = await import('node:fs/promises')
      await mkdir(TEST_STORAGE, { recursive: true })
      await writeFile(path.join(TEST_STORAGE, 'usage.json'), JSON.stringify(records), 'utf-8')
    })

    it('returns all records with no options', async () => {
      const records = await tracker.getUsage()
      expect(records).toHaveLength(3)
    })

    it('filters by date range', async () => {
      const records = await tracker.getUsage({
        from: '2025-01-16T00:00:00.000Z',
        to: '2025-01-16T23:59:59.999Z',
      })
      expect(records).toHaveLength(1)
      expect(records[0].operation).toBe('seo.title')
    })

    it('filters by operation type', async () => {
      const records = await tracker.getUsage({ operation: 'alt-text' })
      expect(records).toHaveLength(1)
      expect(records[0].model).toBe('gpt-4')
    })
  })

  describe('getAggregated()', () => {
    beforeEach(async () => {
      const records: UsageRecord[] = [
        { timestamp: '2025-01-15T10:00:00.000Z', operation: 'editor.generate', model: 'claude-sonnet-4-20250514', inputTokens: 100, outputTokens: 200 },
        { timestamp: '2025-01-15T11:00:00.000Z', operation: 'editor.generate', model: 'claude-sonnet-4-20250514', inputTokens: 150, outputTokens: 250 },
        { timestamp: '2025-01-16T10:00:00.000Z', operation: 'seo.title', model: 'claude-sonnet-4-20250514', inputTokens: 50, outputTokens: 30 },
      ]
      const { mkdir, writeFile } = await import('node:fs/promises')
      await mkdir(TEST_STORAGE, { recursive: true })
      await writeFile(path.join(TEST_STORAGE, 'usage.json'), JSON.stringify(records), 'utf-8')
    })

    it('groups by operation', async () => {
      const result = await tracker.getAggregated('operation')
      expect(result).toHaveLength(2)

      const editorGroup = result.find((r) => r.key === 'editor.generate')
      expect(editorGroup).toBeDefined()
      expect(editorGroup!.totalInputTokens).toBe(250)
      expect(editorGroup!.totalOutputTokens).toBe(450)
      expect(editorGroup!.requestCount).toBe(2)

      const seoGroup = result.find((r) => r.key === 'seo.title')
      expect(seoGroup).toBeDefined()
      expect(seoGroup!.totalInputTokens).toBe(50)
      expect(seoGroup!.totalOutputTokens).toBe(30)
      expect(seoGroup!.requestCount).toBe(1)
    })

    it('groups by date', async () => {
      const result = await tracker.getAggregated('date')
      expect(result).toHaveLength(2)

      const jan15 = result.find((r) => r.key === '2025-01-15')
      expect(jan15).toBeDefined()
      expect(jan15!.totalInputTokens).toBe(250)
      expect(jan15!.totalOutputTokens).toBe(450)
      expect(jan15!.requestCount).toBe(2)
    })

    it('groups by both operation and date', async () => {
      const result = await tracker.getAggregated('both')
      expect(result).toHaveLength(2)

      const editorJan15 = result.find((r) => r.key === 'editor.generate|2025-01-15')
      expect(editorJan15).toBeDefined()
      expect(editorJan15!.requestCount).toBe(2)

      const seoJan16 = result.find((r) => r.key === 'seo.title|2025-01-16')
      expect(seoJan16).toBeDefined()
      expect(seoJan16!.requestCount).toBe(1)
    })
  })
})
