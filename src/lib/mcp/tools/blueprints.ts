import type { McpToolDefinition, McpToolHandler } from '../server'

/**
 * MCP tool definitions for blueprint operations.
 *
 * Requirements: 17.6, 17.10
 */

const listBlueprintsDefinition: McpToolDefinition = {
  name: 'list_blueprints',
  description:
    'List all blueprints configured in the CMS. Returns the handle, title, and field count for each blueprint.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  resource: 'blueprints',
  action: 'read',
}

const getBlueprintDefinition: McpToolDefinition = {
  name: 'get_blueprint',
  description:
    'Get the full definition of a specific blueprint by its handle. Returns tabs, sections, and field definitions including field types and configuration.',
  inputSchema: {
    type: 'object',
    properties: {
      handle: {
        type: 'string',
        description: 'The blueprint handle (e.g. "post", "page")',
      },
    },
    required: ['handle'],
  },
  resource: 'blueprints',
  action: 'read',
}

const createBlueprintDefinition: McpToolDefinition = {
  name: 'create_blueprint',
  description:
    'Create a new blueprint with the given handle and definition. The definition should include tabs, sections, and fields following the Madori blueprint schema.',
  inputSchema: {
    type: 'object',
    properties: {
      handle: {
        type: 'string',
        description: 'The handle for the new blueprint (e.g. "article")',
      },
      title: {
        type: 'string',
        description: 'Human-readable title for the blueprint',
      },
      definition: {
        type: 'object',
        description:
          'The blueprint definition object containing tabs, sections, and fields',
      },
    },
    required: ['handle', 'title', 'definition'],
  },
  resource: 'blueprints',
  action: 'write',
}

const updateBlueprintDefinition: McpToolDefinition = {
  name: 'update_blueprint',
  description:
    'Update an existing blueprint by its handle. Accepts a partial or full definition to merge with the existing blueprint.',
  inputSchema: {
    type: 'object',
    properties: {
      handle: {
        type: 'string',
        description: 'The handle of the blueprint to update',
      },
      title: {
        type: 'string',
        description: 'Updated human-readable title for the blueprint',
      },
      definition: {
        type: 'object',
        description:
          'The updated blueprint definition object containing tabs, sections, and fields',
      },
    },
    required: ['handle'],
  },
  resource: 'blueprints',
  action: 'write',
}

const deleteBlueprintDefinition: McpToolDefinition = {
  name: 'delete_blueprint',
  description:
    'Delete a blueprint by its handle. This will remove the blueprint definition file from the filesystem.',
  inputSchema: {
    type: 'object',
    properties: {
      handle: {
        type: 'string',
        description: 'The handle of the blueprint to delete',
      },
    },
    required: ['handle'],
  },
  resource: 'blueprints',
  action: 'write',
}

// Placeholder handlers — will delegate to BlueprintRegistry once wired up
const listBlueprintsHandler: McpToolHandler = async () => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({ blueprints: [] }),
    },
  ],
})

const getBlueprintHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        handle: args.handle,
        title: null,
        tabs: [],
        sections: [],
        fields: [],
      }),
    },
  ],
})

const createBlueprintHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        created: true,
        handle: args.handle,
        title: args.title ?? null,
      }),
    },
  ],
})

const updateBlueprintHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        updated: true,
        handle: args.handle,
      }),
    },
  ],
})

const deleteBlueprintHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        deleted: true,
        handle: args.handle,
      }),
    },
  ],
})

/**
 * All blueprint tool registrations.
 */
export const blueprintTools: Array<{
  definition: McpToolDefinition
  handler: McpToolHandler
}> = [
  { definition: listBlueprintsDefinition, handler: listBlueprintsHandler },
  { definition: getBlueprintDefinition, handler: getBlueprintHandler },
  { definition: createBlueprintDefinition, handler: createBlueprintHandler },
  { definition: updateBlueprintDefinition, handler: updateBlueprintHandler },
  { definition: deleteBlueprintDefinition, handler: deleteBlueprintHandler },
]
