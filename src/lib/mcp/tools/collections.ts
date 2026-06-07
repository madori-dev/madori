import type { McpToolDefinition, McpToolHandler } from '../server'

/**
 * MCP tool definitions for collection operations.
 *
 * Requirements: 17.1, 17.10
 */

const listCollectionsDefinition: McpToolDefinition = {
  name: 'list_collections',
  description:
    'List all collections configured in the CMS. Returns the handle, title, and entry count for each collection.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  resource: 'collections',
  action: 'read',
}

const getCollectionDefinition: McpToolDefinition = {
  name: 'get_collection',
  description:
    'Get detailed information about a specific collection by its handle. Returns the collection configuration including title, blueprint, route, and sort settings.',
  inputSchema: {
    type: 'object',
    properties: {
      handle: {
        type: 'string',
        description: 'The collection handle (e.g. "blog", "pages")',
      },
    },
    required: ['handle'],
  },
  resource: 'collections',
  action: 'read',
  scope: (args) => args.handle as string | undefined,
}

// Placeholder handlers — will delegate to ContentEngine once wired up
const listCollectionsHandler: McpToolHandler = async () => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({ collections: [] }),
    },
  ],
})

const getCollectionHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        handle: args.handle,
        title: null,
        blueprint: null,
        route: null,
        entries: [],
      }),
    },
  ],
})

/**
 * All collection tool registrations.
 */
export const collectionTools: Array<{
  definition: McpToolDefinition
  handler: McpToolHandler
}> = [
  { definition: listCollectionsDefinition, handler: listCollectionsHandler },
  { definition: getCollectionDefinition, handler: getCollectionHandler },
]
