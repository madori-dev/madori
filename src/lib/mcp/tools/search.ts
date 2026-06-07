import type { McpToolDefinition, McpToolHandler } from '../server'

/**
 * MCP tool definitions for content search operations.
 *
 * Requirements: 17.9, 17.10
 */

const searchContentDefinition: McpToolDefinition = {
  name: 'search_content',
  description:
    'Search across all content entries in the CMS. Performs full-text search on titles, slugs, and body content. Returns matching entries with relevance scores.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query string',
      },
      collection: {
        type: 'string',
        description: 'Optional collection handle to restrict search scope',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 20)',
      },
    },
    required: ['query'],
  },
  resource: 'entries',
  action: 'read',
}

// Placeholder handler — will delegate to ContentEngine search once wired up
const searchContentHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        query: args.query,
        results: [],
        total: 0,
      }),
    },
  ],
})

/**
 * All search tool registrations.
 */
export const searchTools: Array<{
  definition: McpToolDefinition
  handler: McpToolHandler
}> = [
  { definition: searchContentDefinition, handler: searchContentHandler },
]
