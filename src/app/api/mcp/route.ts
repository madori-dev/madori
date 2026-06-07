import { NextRequest } from 'next/server'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { isMcpEnabled } from '@/lib/ai/middleware'
import { McpApiKeyService } from '@/lib/mcp/api-key-service'
import { MadoriMcpServer } from '@/lib/mcp/server'
import { collectionTools } from '@/lib/mcp/tools/collections'
import { entryTools } from '@/lib/mcp/tools/entries'
import { taxonomyTools } from '@/lib/mcp/tools/taxonomies'
import { globalTools } from '@/lib/mcp/tools/globals'
import { navigationTools } from '@/lib/mcp/tools/navigation'
import { assetTools } from '@/lib/mcp/tools/assets'
import { blueprintTools } from '@/lib/mcp/tools/blueprints'
import { fieldsetTools } from '@/lib/mcp/tools/fieldsets'
import { formTools } from '@/lib/mcp/tools/forms'
import { searchTools } from '@/lib/mcp/tools/search'

/**
 * MCP HTTP/SSE transport route handler.
 *
 * GET: SSE connection for server-to-client messages
 * POST: Client-to-server messages (tool calls)
 * DELETE: Session termination
 *
 * Authentication via `Authorization: Bearer mdk_...` header.
 * Returns 404 if MCP is disabled (isMcpEnabled() === false).
 * Returns 401 for invalid or revoked API keys.
 *
 * Requirements: 14.4, 14.5, 14.6, 14.7
 */

const apiKeyService = new McpApiKeyService()

/**
 * Creates and initializes the MCP server with all tools registered.
 */
function createMcpServer(): MadoriMcpServer {
  const server = new MadoriMcpServer(apiKeyService)

  // Register all tool modules
  server.registerTools(collectionTools)
  server.registerTools(entryTools)
  server.registerTools(taxonomyTools)
  server.registerTools(globalTools)
  server.registerTools(navigationTools)
  server.registerTools(assetTools)
  server.registerTools(blueprintTools)
  server.registerTools(fieldsetTools)
  server.registerTools(formTools)
  server.registerTools(searchTools)

  return server
}

/**
 * Extracts and validates the Bearer token from the Authorization header.
 * Returns the validated McpApiKey or null if invalid/missing.
 */
async function authenticateRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const rawKey = authHeader.slice(7)
  if (!rawKey.startsWith('mdk_')) {
    return null
  }

  const apiKey = await apiKeyService.validateKey(rawKey)
  if (!apiKey) {
    return null
  }

  // Reject revoked keys (Req 15.5)
  if (apiKey.revokedAt) {
    return null
  }

  return apiKey
}

/**
 * Handles an MCP request by creating a per-request transport,
 * connecting it to a server instance, and delegating the request.
 */
async function handleMcpRequest(request: NextRequest): Promise<Response> {
  // Check if MCP is enabled (Req 14.5, 14.6)
  if (!isMcpEnabled()) {
    return Response.json({ error: 'MCP not enabled' }, { status: 404 })
  }

  // Authenticate the request (Req 14.7)
  const apiKey = await authenticateRequest(request)
  if (!apiKey) {
    return Response.json({ error: 'Invalid API key' }, { status: 401 })
  }

  // Create a per-request transport and server
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  })

  const mcpServer = createMcpServer()
  const server = mcpServer.getServer()

  // Connect server to transport
  await server.connect(transport)

  // Delegate the request to the transport, passing authInfo.
  // The MadoriMcpServer handler casts extra.authInfo as { apiKey: McpApiKey },
  // so we include apiKey at the top level alongside standard AuthInfo fields.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authInfo: any = {
    token: request.headers.get('authorization')?.slice(7) ?? '',
    clientId: apiKey.id,
    scopes: apiKey.permissions.flatMap((p) =>
      p.actions.map((a) => `${p.resource}:${a}${p.scope ? `:${p.scope}` : ''}`),
    ),
    apiKey,
  }

  const response = await transport.handleRequest(request, { authInfo })

  return response
}

export async function GET(request: NextRequest): Promise<Response> {
  return handleMcpRequest(request)
}

export async function POST(request: NextRequest): Promise<Response> {
  return handleMcpRequest(request)
}

export async function DELETE(request: NextRequest): Promise<Response> {
  return handleMcpRequest(request)
}
