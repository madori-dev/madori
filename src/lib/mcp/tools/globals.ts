import type { McpToolDefinition, McpToolHandler } from '../server'

/**
 * MCP tool definitions for global operations.
 *
 * Requirements: 17.3, 17.10
 */

const listGlobalsDefinition: McpToolDefinition = {
  name: 'list_globals',
  description:
    'List all globals configured in the CMS. Returns the handle, title, and field summary for each global set.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  resource: 'globals',
  action: 'read',
}

const getGlobalDefinition: McpToolDefinition = {
  name: 'get_global',
  description:
    'Get the full data for a specific global set by its handle. Returns all field values stored in the global.',
  inputSchema: {
    type: 'object',
    properties: {
      handle: {
        type: 'string',
        description: 'The global set handle (e.g. "site-settings")',
      },
    },
    required: ['handle'],
  },
  resource: 'globals',
  action: 'read',
  scope: (args) => args.handle as string | undefined,
}

const updateGlobalDefinition: McpToolDefinition = {
  name: 'update_global',
  description:
    'Update field values in a specific global set. Accepts partial data — only the provided fields are updated.',
  inputSchema: {
    type: 'object',
    properties: {
      handle: {
        type: 'string',
        description: 'The global set handle (e.g. "site-settings")',
      },
      data: {
        type: 'object',
        description: 'An object of field handle → value pairs to update',
      },
    },
    required: ['handle', 'data'],
  },
  resource: 'globals',
  action: 'write',
  scope: (args) => args.handle as string | undefined,
}

// Placeholder handlers — will delegate to ContentEngine once wired up
const listGlobalsHandler: McpToolHandler = async () => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({ globals: [] }),
    },
  ],
})

const getGlobalHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        handle: args.handle,
        title: null,
        data: {},
      }),
    },
  ],
})

const updateGlobalHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        handle: args.handle,
        updated: true,
      }),
    },
  ],
})

/**
 * All global tool registrations.
 */
export const globalTools: Array<{
  definition: McpToolDefinition
  handler: McpToolHandler
}> = [
  { definition: listGlobalsDefinition, handler: listGlobalsHandler },
  { definition: getGlobalDefinition, handler: getGlobalHandler },
  { definition: updateGlobalDefinition, handler: updateGlobalHandler },
]
