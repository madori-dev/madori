import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock dependencies
vi.mock('@/lib/ai/middleware', () => ({
  isFeatureEnabled: vi.fn(),
}))

vi.mock('@/lib/ai/schema', () => ({
  getAiConfig: vi.fn(),
}))

vi.mock('@/lib/ai/provider/factory', () => ({
  createProviderAdapter: vi.fn(),
}))

vi.mock('@/lib/ai/features/alt-text', () => ({
  generateAltText: vi.fn(),
}))

const mockCheckLimit = vi.fn().mockResolvedValue({ allowed: true, currentTotal: 0 })
const mockRecord = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/ai/usage/file-tracker', () => {
  return {
    FileTokenTracker: class {
      checkLimit = mockCheckLimit
      record = mockRecord
    },
  }
})

import { POST } from '@/app/api/ai/alt-text/route'
import { isFeatureEnabled } from '@/lib/ai/middleware'
import { getAiConfig } from '@/lib/ai/schema'
import { createProviderAdapter } from '@/lib/ai/provider/factory'
import { generateAltText } from '@/lib/ai/features/alt-text'

const mockIsFeatureEnabled = vi.mocked(isFeatureEnabled)
const mockGetAiConfig = vi.mocked(getAiConfig)
const mockCreateProviderAdapter = vi.mocked(createProviderAdapter)
const mockGenerateAltText = vi.mocked(generateAltText)

const validConfig = {
  provider: 'anthropic' as const,
  baseUrl: 'https://api.anthropic.com',
  apiKey: 'sk-test-key',
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
}

describe('POST /api/ai/alt-text', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsFeatureEnabled.mockReturnValue(true)
    mockGetAiConfig.mockResolvedValue(validConfig)
    mockCreateProviderAdapter.mockReturnValue({} as ReturnType<typeof createProviderAdapter>)
    mockGenerateAltText.mockResolvedValue({
      altText: 'A cat sitting on a windowsill',
      usage: { inputTokens: 100, outputTokens: 15 },
    })
    mockCheckLimit.mockResolvedValue({ allowed: true, currentTotal: 0 })
    mockRecord.mockResolvedValue(undefined)
  })

  function makeMultipartRequest(imageData?: Uint8Array) {
    const formData = new FormData()
    if (imageData) {
      const blob = new Blob([imageData], { type: 'image/png' })
      formData.append('image', blob, 'test.png')
    }
    return new NextRequest('http://localhost:3000/api/ai/alt-text', {
      method: 'POST',
      body: formData,
    })
  }

  function makeJsonRequest(body: Record<string, unknown>) {
    return new NextRequest('http://localhost:3000/api/ai/alt-text', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('returns 404 when altText feature is disabled', async () => {
    mockIsFeatureEnabled.mockReturnValue(false)

    const request = makeMultipartRequest(new Uint8Array([1, 2, 3]))
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Feature disabled')
  })

  it('returns 404 when AI config is absent', async () => {
    mockGetAiConfig.mockResolvedValue(undefined)

    const request = makeMultipartRequest(new Uint8Array([1, 2, 3]))
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('AI not configured')
  })

  it('returns 429 when spend limit is reached', async () => {
    mockCheckLimit.mockResolvedValueOnce({ allowed: false, currentTotal: 5000, limit: 5000 })

    const request = makeMultipartRequest(new Uint8Array([1, 2, 3]))
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(429)
    expect(data.error).toBe('Spend limit reached')
    expect(data.currentTotal).toBe(5000)
    expect(data.limit).toBe(5000)
  })

  it('returns alt text from multipart/form-data upload', async () => {
    const request = makeMultipartRequest(new Uint8Array([137, 80, 78, 71]))
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.altText).toBe('A cat sitting on a windowsill')
    expect(data.usage).toEqual({ inputTokens: 100, outputTokens: 15 })
    expect(mockGenerateAltText).toHaveBeenCalledOnce()
  })

  it('returns 400 when multipart form is missing image field', async () => {
    const formData = new FormData()
    formData.append('name', 'not-an-image')
    const request = new NextRequest('http://localhost:3000/api/ai/alt-text', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Validation failed')
    expect(data.fields.image).toBeDefined()
  })

  it('returns 400 when JSON body is missing imagePath', async () => {
    const request = makeJsonRequest({})
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Validation failed')
    expect(data.fields.imagePath).toBeDefined()
  })

  it('returns 400 when content-type is unsupported', async () => {
    const request = new NextRequest('http://localhost:3000/api/ai/alt-text', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hello',
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Validation failed')
    expect(data.fields.contentType).toBeDefined()
  })

  it('returns 422 when vision is not supported by provider', async () => {
    mockGenerateAltText.mockRejectedValue(
      new Error('Vision is not supported by the current provider configuration.'),
    )

    const request = makeMultipartRequest(new Uint8Array([1, 2, 3]))
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(422)
    expect(data.error).toBe('Vision not supported by current provider')
  })

  it('returns 502 on generic provider error', async () => {
    mockGenerateAltText.mockRejectedValue(new Error('Connection timeout'))

    const request = makeMultipartRequest(new Uint8Array([1, 2, 3]))
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(502)
    expect(data.error).toContain('Failed to generate alt text')
  })

  it('records usage after successful generation', async () => {
    const request = makeMultipartRequest(new Uint8Array([1, 2, 3]))
    await POST(request)

    expect(mockRecord).toHaveBeenCalledWith({
      operation: 'alt-text',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 100,
      outputTokens: 15,
    })
  })
})
