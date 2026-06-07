import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock dependencies before importing routes
vi.mock('@/lib/ai/middleware', () => ({
  isAiEnabled: vi.fn(),
}))

vi.mock('@/lib/ai/schema', () => ({
  getAiConfig: vi.fn(),
}))

const mockCheckLimit = vi.fn()
const mockGetUsage = vi.fn()
const mockGetAggregated = vi.fn()

vi.mock('@/lib/ai/usage/file-tracker', () => ({
  FileTokenTracker: class {
    checkLimit = mockCheckLimit
    getUsage = mockGetUsage
    getAggregated = mockGetAggregated
  },
}))

import { GET as configGET } from '@/app/api/ai/config/route'
import { GET as usageGET } from '@/app/api/ai/usage/route'
import { isAiEnabled } from '@/lib/ai/middleware'
import { getAiConfig } from '@/lib/ai/schema'

describe('GET /api/ai/config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 404 when AI is not enabled', async () => {
    vi.mocked(isAiEnabled).mockReturnValue(false)

    const res = await configGET()
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.error).toBe('AI not configured')
  })

  it('returns 404 when getAiConfig returns undefined', async () => {
    vi.mocked(isAiEnabled).mockReturnValue(true)
    vi.mocked(getAiConfig).mockResolvedValue(undefined)

    const res = await configGET()
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.error).toBe('AI not configured')
  })

  it('returns sanitized config with masked API key', async () => {
    vi.mocked(isAiEnabled).mockReturnValue(true)
    vi.mocked(getAiConfig).mockResolvedValue({
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'sk-ant-1234567890abcdef',
      model: 'claude-sonnet-4-20250514',
      features: {
        editor: true,
        seo: true,
        altText: true,
        blueprints: true,
        autoFill: true,
        taxonomy: true,
        bulk: true,
      },
      spendLimit: { maxTokens: 100000, period: 'monthly' as const },
    })

    const res = await configGET()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.provider).toBe('anthropic')
    expect(json.baseUrl).toBe('https://api.anthropic.com')
    expect(json.model).toBe('claude-sonnet-4-20250514')
    // API key should be masked — first 4 + •••• + last 4
    expect(json.apiKey).toBe('sk-a••••cdef')
    expect(json.apiKey).not.toContain('1234567890')
    expect(json.features.editor).toBe(true)
    expect(json.spendLimit).toEqual({ maxTokens: 100000, period: 'monthly' })
  })

  it('returns null spendLimit when not configured', async () => {
    vi.mocked(isAiEnabled).mockReturnValue(true)
    vi.mocked(getAiConfig).mockResolvedValue({
      provider: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'ollama-key-12345678',
      model: 'llama3',
      features: {
        editor: true,
        seo: true,
        altText: true,
        blueprints: true,
        autoFill: true,
        taxonomy: true,
        bulk: true,
      },
    })

    const res = await configGET()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.spendLimit).toBeNull()
  })
})

describe('GET /api/ai/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckLimit.mockResolvedValue({ allowed: true, currentTotal: 500 })
    mockGetUsage.mockResolvedValue([])
    mockGetAggregated.mockResolvedValue([])
  })

  it('returns 404 when AI is not enabled', async () => {
    vi.mocked(isAiEnabled).mockReturnValue(false)

    const req = new NextRequest('http://localhost/api/ai/usage')
    const res = await usageGET(req)
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.error).toBe('AI not configured')
  })

  it('returns raw usage records when no groupBy specified', async () => {
    vi.mocked(isAiEnabled).mockReturnValue(true)
    const records = [
      { timestamp: '2025-01-01T00:00:00.000Z', operation: 'editor.generate', model: 'claude-sonnet-4-20250514', inputTokens: 100, outputTokens: 200 },
    ]
    mockGetUsage.mockResolvedValue(records)

    const req = new NextRequest('http://localhost/api/ai/usage')
    const res = await usageGET(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data).toEqual(records)
    expect(json.limit).toEqual({ allowed: true, currentTotal: 500 })
    expect(mockGetUsage).toHaveBeenCalledWith({ from: undefined, to: undefined, operation: undefined })
  })

  it('returns aggregated data when groupBy is specified', async () => {
    vi.mocked(isAiEnabled).mockReturnValue(true)
    const aggregated = [
      { key: 'editor.generate', totalInputTokens: 500, totalOutputTokens: 1000, requestCount: 5 },
    ]
    mockGetAggregated.mockResolvedValue(aggregated)

    const req = new NextRequest('http://localhost/api/ai/usage?groupBy=operation')
    const res = await usageGET(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data).toEqual(aggregated)
    expect(json.limit).toEqual({ allowed: true, currentTotal: 500 })
    expect(mockGetAggregated).toHaveBeenCalledWith('operation')
  })

  it('passes from, to, and operation filters to getUsage', async () => {
    vi.mocked(isAiEnabled).mockReturnValue(true)
    mockGetUsage.mockResolvedValue([])

    const req = new NextRequest(
      'http://localhost/api/ai/usage?from=2025-01-01&to=2025-01-31&operation=seo.title'
    )
    const res = await usageGET(req)

    expect(res.status).toBe(200)
    expect(mockGetUsage).toHaveBeenCalledWith({
      from: '2025-01-01',
      to: '2025-01-31',
      operation: 'seo.title',
    })
  })

  it('supports groupBy=date', async () => {
    vi.mocked(isAiEnabled).mockReturnValue(true)
    mockGetAggregated.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/ai/usage?groupBy=date')
    await usageGET(req)

    expect(mockGetAggregated).toHaveBeenCalledWith('date')
  })

  it('supports groupBy=both', async () => {
    vi.mocked(isAiEnabled).mockReturnValue(true)
    mockGetAggregated.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/ai/usage?groupBy=both')
    await usageGET(req)

    expect(mockGetAggregated).toHaveBeenCalledWith('both')
  })
})
