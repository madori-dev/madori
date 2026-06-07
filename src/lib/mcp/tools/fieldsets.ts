import type { McpToolDefinition, McpToolHandler } from '../server'

/**
 * MCP tool definitions for fieldset operations.
 *
 * Requirements: 17.7, 17.10
 */

const listFieldsetsDefinition: McpToolDefinition = {
  name: 'list_fieldsets',
  description:
    'List all fieldsets configured in the CMS. Returns the handle, title, and field count for each fieldset.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  resource: 'fieldsets',
  action: 'read',
}

const getFieldsetDefinition: McpToolDefinition = {
  name: 'get_fieldset',
  description:
    'Get the full definition of a specific fieldset by its handle. Returns the fieldset configuration including all field definitions and their types.',
  inputSchema: {
    type: 'object',
    properties: {
      handle: {
        type: 'string',
        description: 'The fieldset handle (e.g. "seo", "social_media")',
      },
    },
    required: ['handle'],
  },
  resource: 'fieldsets',
  action: 'read',
}

// Placeholder handlers — will delegate to ContentEngine once wired up
const listFieldsetsHandler: McpToolHandler = async () => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({ fieldsets: [] }),
    },
  ],
})

const getFieldsetHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        handle: args.handle,
        title: null,
        fields: [],
      }),
    },
  ],
})

/**
 * All fieldset tool registrations.
 */
export const fieldsetTools: Array<{
  definition: McpToolDefinition
  handler: McpToolHandler
}> = [
  { definition: listFieldsetsDefinition, handler: listFieldsetsHandler },
  { definition: getFieldsetDefinition, handler: getFieldsetHandler },
]
