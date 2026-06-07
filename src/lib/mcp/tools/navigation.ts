import type { McpToolDefinition, McpToolHandler } from '../server'

/**
 * MCP tool definitions for navigation operations.
 *
 * Requirements: 17.4, 17.10
 */

const listNavigationsDefinition: McpToolDefinition = {
  name: 'list_navigations',
  description:
    'List all navigation trees configured in the CMS. Returns the handle and title for each navigation.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  resource: 'navigation',
  action: 'read',
}

const getNavigationDefinition: McpToolDefinition = {
  name: 'get_navigation',
  description:
    'Get the full tree structure of a specific navigation by its handle. Returns all nodes with their titles, URLs, and children.',
  inputSchema: {
    type: 'object',
    properties: {
      handle: {
        type: 'string',
        description: 'The navigation handle (e.g. "main", "docs")',
      },
    },
    required: ['handle'],
  },
  resource: 'navigation',
  action: 'read',
  scope: (args) => args.handle as string | undefined,
}

const updateNavigationDefinition: McpToolDefinition = {
  name: 'update_navigation',
  description:
    'Update the tree structure of a specific navigation. Replaces the full tree with the provided nodes.',
  inputSchema: {
    type: 'object',
    properties: {
      handle: {
        type: 'string',
        description: 'The navigation handle (e.g. "main", "docs")',
      },
      tree: {
        type: 'array',
        description:
          'The full navigation tree as an array of nodes, each with title, url, and optional children array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Display title for the nav item' },
            url: { type: 'string', description: 'URL or path for the nav item' },
            children: {
              type: 'array',
              description: 'Nested child navigation nodes',
            },
          },
          required: ['title', 'url'],
        },
      },
    },
    required: ['handle', 'tree'],
  },
  resource: 'navigation',
  action: 'write',
  scope: (args) => args.handle as string | undefined,
}

// Placeholder handlers — will delegate to ContentEngine once wired up
const listNavigationsHandler: McpToolHandler = async () => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({ navigations: [] }),
    },
  ],
})

const getNavigationHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        handle: args.handle,
        title: null,
        tree: [],
      }),
    },
  ],
})

const updateNavigationHandler: McpToolHandler = async (args) => ({
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
 * All navigation tool registrations.
 */
export const navigationTools: Array<{
  definition: McpToolDefinition
  handler: McpToolHandler
}> = [
  { definition: listNavigationsDefinition, handler: listNavigationsHandler },
  { definition: getNavigationDefinition, handler: getNavigationHandler },
  { definition: updateNavigationDefinition, handler: updateNavigationHandler },
]
