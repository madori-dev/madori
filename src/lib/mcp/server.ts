import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { McpApiKey, McpAction, McpResourceType } from './auth'
import type { McpApiKeyService } from './api-key-service'
import { McpPermissionChecker } from './permissions'

/**
 * Definition for a tool registered in the MCP server.
 * Each tool maps to a CMS operation with resource+action for permission checks.
 */
export interface McpToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  }
  resource: McpResourceType
  action: McpAction
  scope?: (args: Record<string, unknown>) => string | undefined
}

/**
 * Handler function for executing a tool call.
 */
export type McpToolHandler = (
  args: Record<string, unknown>,
) => Promise<{ content: Array<{ type: string; text: string }> }>

/**
 * A registered tool combining its definition and execution handler.
 */
interface RegisteredTool {
  definition: McpToolDefinition
  handler: McpToolHandler
}

/**
 * The core MCP server for Madori CMS.
 *
 * Implements tool registry, discovery (ListTools), and invocation (CallTool)
 * with permission checking on every tool call.
 *
 * Requirements: 14.1, 14.7
 */
export class MadoriMcpServer {
  private server: Server
  private tools: Map<string, RegisteredTool> = new Map()
  private permissionChecker: McpPermissionChecker

  constructor(
    private readonly apiKeyService: McpApiKeyService,
  ) {
    this.server = new Server(
      {
        name: 'madori-cms',
        version: '0.1.0',
      },
      {
        capabilities: { tools: {} },
      },
    )

    this.permissionChecker = new McpPermissionChecker()
    this.registerHandlers()
  }

  /**
   * Register a tool with the server.
   * Tools are registered by subsequent task implementations (9.2–9.7).
   */
  registerTool(definition: McpToolDefinition, handler: McpToolHandler): void {
    this.tools.set(definition.name, { definition, handler })
  }

  /**
   * Register multiple tools at once.
   */
  registerTools(
    tools: Array<{ definition: McpToolDefinition; handler: McpToolHandler }>,
  ): void {
    for (const tool of tools) {
      this.registerTool(tool.definition, tool.handler)
    }
  }

  /**
   * Get all registered tool definitions (for external inspection/testing).
   */
  getToolDefinitions(): McpToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition)
  }

  /**
   * Get the underlying MCP SDK Server instance.
   * Used by the transport layer (route handler) to connect transports.
   */
  getServer(): Server {
    return this.server
  }

  /**
   * Handle a tool call with permission checking.
   * Exported for testing; normally invoked via the CallTool request handler.
   */
  async handleToolCall(
    toolName: string,
    args: Record<string, unknown>,
    apiKey: McpApiKey,
  ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    const registered = this.tools.get(toolName)
    if (!registered) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
        isError: true,
      }
    }

    const { definition, handler } = registered

    // Determine scope for permission check
    const scope = definition.scope ? definition.scope(args) : undefined

    // Permission check (Req 14.7)
    if (!this.permissionChecker.hasPermission(apiKey, definition.resource, definition.action, scope)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Insufficient permissions',
              required: {
                resource: definition.resource,
                action: definition.action,
                ...(scope ? { scope } : {}),
              },
            }),
          },
        ],
        isError: true,
      }
    }

    // Record usage on the key (best-effort; don't block the tool call)
    try {
      await this.apiKeyService.recordUsage(apiKey.id)
    } catch {
      // Key may not exist in storage during testing or if externally managed
    }

    // Execute the tool handler
    return handler(args)
  }

  /**
   * Set up the ListTools and CallTool request handlers on the SDK server.
   */
  private registerHandlers(): void {
    // ListTools handler — returns all registered tool definitions
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: Array.from(this.tools.values()).map(({ definition }) => ({
        name: definition.name,
        description: definition.description,
        inputSchema: definition.inputSchema,
      })),
    }))

    // CallTool handler — checks permissions then invokes the tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const { name, arguments: args } = request.params

      // The API key is expected to be attached to the request context
      // by the transport layer after authentication.
      // Access it from the extra.authInfo which is set by authenticated transports.
      const authInfo = extra.authInfo as { apiKey: McpApiKey } | undefined

      if (!authInfo?.apiKey) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid API key' }) }],
          isError: true,
        }
      }

      return this.handleToolCall(name, args ?? {}, authInfo.apiKey)
    })
  }
}
