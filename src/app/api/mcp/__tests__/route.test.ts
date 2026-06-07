import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { McpApiKeyService } from '@/lib/mcp/api-key-service'
import type { McpApiKey } from '@/lib/mcp/auth'

// Mock the middleware to control isMcpEnabled
vi.mock('@/lib/ai/middleware', () => ({
  isMcpEnabled: vi.fn(),
}))

// Mock the api-key-service used by the route
vi.mock('@/lib/mcp/api-key-service', () => {
  const MockService = vi.fn()
  MockService.prototype.validateKey = vi.fn()
  MockService.prototype.createKey = vi.fn()
  MockService.prototype.listKeys = vi.fn()
  MockService.prototype.revokeKey = vi.fn()
  MockService.prototype.recordUsage = vi.fn()
  return { McpApiKeyService: MockService }
})

import { isMcpEnabled } from '@/lib/ai/middleware'
const mockIsMcpEnabled = vi.mocked(isMcpEnabled)

describe('MCP Route Handler', () => {
  let mockValidateKey: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    mockIsMcpEnabled.mockReturnValue(true)
    // Get the mocked instance's validateKey method
    const ServiceClass = vi.mocked(McpApiKeyService)
    mockValidateKey = ServiceClass.prototype.validateKey as ReturnType<typeof vi.fn>
    mockValidateKey.mockResolvedValue(null)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
  })

  it('returns 404 when MCP is disabled', async () => {
    mockIsMcpEnabled.mockReturnValue(false)

    const { GET } = await import('../route')
    const request = new NextRequest('http://localhost:3000/api/mcp', {
      method: 'GET',
      headers: {
        authorization: 'Bearer mdk_testkey123',
      },
    })

    const response = await GET(request)
    expect(response.status).toBe(404)

    const body = await response.json()
    expect(body.error).toBe('MCP not enabled')
  })

  it('returns 401 when no authorization header is present', async () => {
    const { POST } = await import('../route')
    const request = new NextRequest('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    const response = await POST(request)
    expect(response.status).toBe(401)

    const body = await response.json()
    expect(body.error).toBe('Invalid API key')
  })

  it('returns 401 when authorization header has wrong prefix', async () => {
    const { POST } = await import('../route')
    const request = new NextRequest('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: {
        authorization: 'Bearer sk_invalid_key',
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    const response = await POST(request)
    expect(response.status).toBe(401)

    const body = await response.json()
    expect(body.error).toBe('Invalid API key')
  })

  it('returns 401 when API key does not exist', async () => {
    mockValidateKey.mockResolvedValue(null)

    const { POST } = await import('../route')
    const request = new NextRequest('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: {
        authorization: 'Bearer mdk_nonexistentkey123456789012345678901234567890123456789012345',
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    const response = await POST(request)
    expect(response.status).toBe(401)

    const body = await response.json()
    expect(body.error).toBe('Invalid API key')
  })

  it('returns 401 when API key is revoked', async () => {
    const revokedKey: McpApiKey = {
      id: 'test-id',
      keyHash: 'scrypt:abc:def',
      label: 'Test Key',
      permissions: [{ resource: 'entries', actions: ['read'] }],
      createdAt: '2026-01-01T00:00:00.000Z',
      revokedAt: '2026-01-02T00:00:00.000Z',
    }
    mockValidateKey.mockResolvedValue(revokedKey)

    const { POST } = await import('../route')
    const request = new NextRequest('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: {
        authorization: 'Bearer mdk_revokedkey123456789012345678901234567890123456789012345',
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    const response = await POST(request)
    expect(response.status).toBe(401)

    const body = await response.json()
    expect(body.error).toBe('Invalid API key')
  })
})
