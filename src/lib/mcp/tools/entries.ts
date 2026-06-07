import type { McpToolDefinition, McpToolHandler } from '../server'

/**
 * MCP tool definitions for entry operations.
 *
 * Requirements: 17.1, 17.10
 */

const listEntriesDefinition: McpToolDefinition = {
  name: 'list_entries',
  description:
    'List all entries in a collection. Returns title, slug, status, and metadata for each entry.',
  inputSchema: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description: 'The collection handle (e.g. "blog", "pages")',
      },
      status: {
        type: 'string',
        enum: ['published', 'draft', 'all'],
        description: 'Filter by publication status. Defaults to "all".',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of entries to return',
      },
      offset: {
        type: 'number',
        description: 'Number of entries to skip for pagination',
      },
    },
    required: ['collection'],
  },
  resource: 'entries',
  action: 'read',
  scope: (args) => args.collection as string | undefined,
}

const getEntryDefinition: McpToolDefinition = {
  name: 'get_entry',
  description:
    'Get a single entry by its slug within a collection. Returns all field values, metadata, and content body.',
  inputSchema: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description: 'The collection handle',
      },
      slug: {
        type: 'string',
        description: 'The entry slug',
      },
    },
    required: ['collection', 'slug'],
  },
  resource: 'entries',
  action: 'read',
  scope: (args) => args.collection as string | undefined,
}

const createEntryDefinition: McpToolDefinition = {
  name: 'create_entry',
  description:
    'Create a new entry in a collection. Provide field values matching the collection blueprint. Returns the created entry with its generated slug.',
  inputSchema: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description: 'The collection handle to create the entry in',
      },
      title: {
        type: 'string',
        description: 'The entry title',
      },
      slug: {
        type: 'string',
        description:
          'Optional custom slug. If omitted, generated from the title.',
      },
      content: {
        type: 'string',
        description: 'The main content body (Markdown)',
      },
      fields: {
        type: 'object',
        description:
          'Additional field values as key-value pairs matching the blueprint',
      },
      status: {
        type: 'string',
        enum: ['published', 'draft'],
        description: 'Publication status. Defaults to "draft".',
      },
    },
    required: ['collection', 'title'],
  },
  resource: 'entries',
  action: 'write',
  scope: (args) => args.collection as string | undefined,
}

const updateEntryDefinition: McpToolDefinition = {
  name: 'update_entry',
  description:
    'Update an existing entry in a collection. Only provided fields are updated; omitted fields remain unchanged.',
  inputSchema: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description: 'The collection handle',
      },
      slug: {
        type: 'string',
        description: 'The slug of the entry to update',
      },
      title: {
        type: 'string',
        description: 'Updated title',
      },
      content: {
        type: 'string',
        description: 'Updated content body (Markdown)',
      },
      fields: {
        type: 'object',
        description: 'Updated field values as key-value pairs',
      },
      status: {
        type: 'string',
        enum: ['published', 'draft'],
        description: 'Updated publication status',
      },
    },
    required: ['collection', 'slug'],
  },
  resource: 'entries',
  action: 'write',
  scope: (args) => args.collection as string | undefined,
}

const deleteEntryDefinition: McpToolDefinition = {
  name: 'delete_entry',
  description:
    'Delete an entry from a collection. This action is permanent and cannot be undone.',
  inputSchema: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description: 'The collection handle',
      },
      slug: {
        type: 'string',
        description: 'The slug of the entry to delete',
      },
    },
    required: ['collection', 'slug'],
  },
  resource: 'entries',
  action: 'write',
  scope: (args) => args.collection as string | undefined,
}

const publishEntryDefinition: McpToolDefinition = {
  name: 'publish_entry',
  description:
    'Publish a draft entry, making it publicly visible. Equivalent to setting status to "published".',
  inputSchema: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description: 'The collection handle',
      },
      slug: {
        type: 'string',
        description: 'The slug of the entry to publish',
      },
    },
    required: ['collection', 'slug'],
  },
  resource: 'entries',
  action: 'write',
  scope: (args) => args.collection as string | undefined,
}

// Placeholder handlers — will delegate to ContentEngine once wired up
const listEntriesHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({ collection: args.collection, entries: [] }),
    },
  ],
})

const getEntryHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        collection: args.collection,
        slug: args.slug,
        title: null,
        content: null,
        fields: {},
        status: null,
      }),
    },
  ],
})

const createEntryHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        created: true,
        collection: args.collection,
        slug: args.slug ?? null,
        title: args.title,
      }),
    },
  ],
})

const updateEntryHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        updated: true,
        collection: args.collection,
        slug: args.slug,
      }),
    },
  ],
})

const deleteEntryHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        deleted: true,
        collection: args.collection,
        slug: args.slug,
      }),
    },
  ],
})

const publishEntryHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        published: true,
        collection: args.collection,
        slug: args.slug,
      }),
    },
  ],
})

/**
 * All entry tool registrations.
 */
export const entryTools: Array<{
  definition: McpToolDefinition
  handler: McpToolHandler
}> = [
  { definition: listEntriesDefinition, handler: listEntriesHandler },
  { definition: getEntryDefinition, handler: getEntryHandler },
  { definition: createEntryDefinition, handler: createEntryHandler },
  { definition: updateEntryDefinition, handler: updateEntryHandler },
  { definition: deleteEntryDefinition, handler: deleteEntryHandler },
  { definition: publishEntryDefinition, handler: publishEntryHandler },
]
