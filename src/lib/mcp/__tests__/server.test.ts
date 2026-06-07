import { describe, it, expect, beforeEach } from 'vitest'
import { MadoriMcpServer } from '../server'
import type { McpToolDefinition, McpToolHandler } from '../server'
import type { McpApiKey } from '../auth'
import { McpApiKeyService } from '../api-key-service'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function makeKey(overrides: Partial<McpApiKey> = {}): McpApiKey {
  return {
    id: 'test-key-1',
    keyHash: 'scrypt:fakehash',
    label: 'Test Key',
    permissions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('MadoriMcpServer', () => {
  let server: MadoriMcpServer
  let apiKeyService: McpApiKeyService

  beforeEach(() => {
    const tempDir = mkdtempSync(join(tmpdir(), 'mcp-server-'))
    apiKeyService = new McpApiKeyService(tempDir)
    server = new MadoriMcpServer(apiKeyService)
  })

  describe('tool registry', () => {
    it('starts with no tools registered', () => {
      expect(server.getToolDefinitions()).toEqual([])
    })

    it('registers a single tool', () => {
      const definition: McpToolDefinition = {
        name: 'list_entries',
        description: 'List all entries',
        inputSchema: {
          type: 'object',
          properties: {
            collection: { type: 'string' },
          },
          required: ['collection'],
        },
        resource: 'entries',
        action: 'read',
      }

      server.registerTool(definition, async () => ({
        content: [{ type: 'text', text: '[]' }],
      }))

      expect(server.getToolDefinitions()).toHaveLength(1)
      expect(server.getToolDefinitions()[0].name).toBe('list_entries')
    })

    it('registers multiple tools at once', () => {
      const tools = [
        {
          definition: {
            name: 'list_collections',
            description: 'List collections',
            inputSchema: { type: 'object' as const },
            resource: 'collections' as const,
            action: 'read' as const,
          },
          handler: async () => ({ content: [{ type: 'text', text: '[]' }] }),
        },
        {
          definition: {
            name: 'get_collection',
            description: 'Get a collection',
            inputSchema: {
              type: 'object' as const,
              properties: { handle: { type: 'string' } },
              required: ['handle'],
            },
            resource: 'collections' as const,
            action: 'read' as const,
          },
          handler: async () => ({ content: [{ type: 'text', text: '{}' }] }),
        },
      ]

      server.registerTools(tools)
      expect(server.getToolDefinitions()).toHaveLength(2)
    })
  })

  describe('handleToolCall', () => {
    const toolDef: McpToolDefinition = {
      name: 'list_entries',
      description: 'List entries in a collection',
      inputSchema: {
        type: 'object',
        properties: {
          collection: { type: 'string' },
        },
        required: ['collection'],
      },
      resource: 'entries',
      action: 'read',
      scope: (args) => args.collection as string,
    }

    const handler: McpToolHandler = async (args) => ({
      content: [{ type: 'text', text: JSON.stringify({ entries: [], collection: args.collection }) }],
    })

    beforeEach(() => {
      server.registerTool(toolDef, handler)
    })

    it('returns error for unknown tool', async () => {
      const key = makeKey({
        permissions: [{ resource: 'entries', actions: ['read'] }],
      })

      const result = await server.handleToolCall('nonexistent_tool', {}, key)
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Unknown tool')
    })

    it('denies access when key lacks required permission', async () => {
      const key = makeKey({
        permissions: [{ resource: 'assets', actions: ['read'] }],
      })

      const result = await server.handleToolCall('list_entries', { collection: 'blog' }, key)
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Insufficient permissions')
    })

    it('denies access when key has read but tool needs write', async () => {
      const writeTool: McpToolDefinition = {
        name: 'create_entry',
        description: 'Create an entry',
        inputSchema: { type: 'object', properties: { collection: { type: 'string' } } },
        resource: 'entries',
        action: 'write',
        scope: (args) => args.collection as string,
      }
      server.registerTool(writeTool, async () => ({
        content: [{ type: 'text', text: '{}' }],
      }))

      const key = makeKey({
        permissions: [{ resource: 'entries', actions: ['read'] }],
      })

      const result = await server.handleToolCall('create_entry', { collection: 'blog' }, key)
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Insufficient permissions')
    })

    it('grants access when key has matching permission', async () => {
      const key = makeKey({
        permissions: [{ resource: 'entries', actions: ['read'] }],
      })

      const result = await server.handleToolCall('list_entries', { collection: 'blog' }, key)
      expect(result.isError).toBeUndefined()
      expect(JSON.parse(result.content[0].text)).toEqual({
        entries: [],
        collection: 'blog',
      })
    })

    it('grants access with wildcard permission', async () => {
      const key = makeKey({
        permissions: [{ resource: '*' as any, actions: ['read', 'write'] }],
      })

      const result = await server.handleToolCall('list_entries', { collection: 'blog' }, key)
      expect(result.isError).toBeUndefined()
    })

    it('denies access for revoked key', async () => {
      const key = makeKey({
        revokedAt: '2026-06-01T00:00:00.000Z',
        permissions: [{ resource: 'entries', actions: ['read', 'write'] }],
      })

      const result = await server.handleToolCall('list_entries', { collection: 'blog' }, key)
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Insufficient permissions')
    })

    it('denies access when scope does not match', async () => {
      const key = makeKey({
        permissions: [{ resource: 'entries', actions: ['read'], scope: 'docs' }],
      })

      const result = await server.handleToolCall('list_entries', { collection: 'blog' }, key)
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Insufficient permissions')
    })

    it('grants access when scope matches', async () => {
      const key = makeKey({
        permissions: [{ resource: 'entries', actions: ['read'], scope: 'blog' }],
      })

      const result = await server.handleToolCall('list_entries', { collection: 'blog' }, key)
      expect(result.isError).toBeUndefined()
    })

    it('includes required resource/action/scope in error details', async () => {
      const key = makeKey({
        permissions: [{ resource: 'assets', actions: ['read'] }],
      })

      const result = await server.handleToolCall('list_entries', { collection: 'blog' }, key)
      const error = JSON.parse(result.content[0].text)
      expect(error.required).toEqual({
        resource: 'entries',
        action: 'read',
        scope: 'blog',
      })
    })
  })

  describe('getServer', () => {
    it('returns the underlying MCP SDK Server instance', () => {
      const sdkServer = server.getServer()
      expect(sdkServer).toBeDefined()
    })
  })
})
