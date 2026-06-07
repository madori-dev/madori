import type { McpToolDefinition, McpToolHandler } from '../server'

/**
 * MCP tool definitions for taxonomy and term operations.
 *
 * Requirements: 17.2, 17.10
 */

export const listTaxonomies: McpToolDefinition = {
  name: 'list_taxonomies',
  description:
    'List all taxonomies defined in the CMS. Returns the handle, title, and term count for each taxonomy.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  resource: 'taxonomies',
  action: 'read',
}

export const getTaxonomy: McpToolDefinition = {
  name: 'get_taxonomy',
  description:
    'Get a single taxonomy by handle. Returns the full taxonomy configuration including title, handle, and associated collections.',
  inputSchema: {
    type: 'object',
    properties: {
      handle: {
        type: 'string',
        description: 'The taxonomy handle (e.g. "tags", "categories")',
      },
    },
    required: ['handle'],
  },
  resource: 'taxonomies',
  action: 'read',
  scope: (args) => args.handle as string | undefined,
}

export const listTerms: McpToolDefinition = {
  name: 'list_terms',
  description:
    'List all terms in a taxonomy. Returns the title, slug, and metadata for each term.',
  inputSchema: {
    type: 'object',
    properties: {
      taxonomy: {
        type: 'string',
        description: 'The taxonomy handle to list terms from',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of terms to return',
      },
      offset: {
        type: 'number',
        description: 'Number of terms to skip for pagination',
      },
    },
    required: ['taxonomy'],
  },
  resource: 'terms',
  action: 'read',
  scope: (args) => args.taxonomy as string | undefined,
}

export const getTerm: McpToolDefinition = {
  name: 'get_term',
  description:
    'Get a single term by slug within a taxonomy. Returns full term data including title, slug, content, and any custom fields.',
  inputSchema: {
    type: 'object',
    properties: {
      taxonomy: {
        type: 'string',
        description: 'The taxonomy handle the term belongs to',
      },
      slug: {
        type: 'string',
        description: 'The term slug',
      },
    },
    required: ['taxonomy', 'slug'],
  },
  resource: 'terms',
  action: 'read',
  scope: (args) => args.taxonomy as string | undefined,
}

export const createTerm: McpToolDefinition = {
  name: 'create_term',
  description:
    'Create a new term in a taxonomy. Provide at minimum a title; slug will be auto-generated if not provided.',
  inputSchema: {
    type: 'object',
    properties: {
      taxonomy: {
        type: 'string',
        description: 'The taxonomy handle to create the term in',
      },
      title: {
        type: 'string',
        description: 'The term title',
      },
      slug: {
        type: 'string',
        description: 'Optional URL-safe slug (auto-generated from title if omitted)',
      },
      content: {
        type: 'string',
        description: 'Optional term content/description (markdown)',
      },
      data: {
        type: 'object',
        description: 'Optional additional field data defined by the taxonomy blueprint',
      },
    },
    required: ['taxonomy', 'title'],
  },
  resource: 'terms',
  action: 'write',
  scope: (args) => args.taxonomy as string | undefined,
}

export const updateTerm: McpToolDefinition = {
  name: 'update_term',
  description:
    'Update an existing term in a taxonomy. Only provided fields will be updated.',
  inputSchema: {
    type: 'object',
    properties: {
      taxonomy: {
        type: 'string',
        description: 'The taxonomy handle the term belongs to',
      },
      slug: {
        type: 'string',
        description: 'The slug of the term to update',
      },
      title: {
        type: 'string',
        description: 'New title for the term',
      },
      content: {
        type: 'string',
        description: 'New content/description for the term (markdown)',
      },
      data: {
        type: 'object',
        description: 'Updated field data defined by the taxonomy blueprint',
      },
    },
    required: ['taxonomy', 'slug'],
  },
  resource: 'terms',
  action: 'write',
  scope: (args) => args.taxonomy as string | undefined,
}

export const deleteTerm: McpToolDefinition = {
  name: 'delete_term',
  description:
    'Delete a term from a taxonomy. This will also remove the term from any entries that reference it.',
  inputSchema: {
    type: 'object',
    properties: {
      taxonomy: {
        type: 'string',
        description: 'The taxonomy handle the term belongs to',
      },
      slug: {
        type: 'string',
        description: 'The slug of the term to delete',
      },
    },
    required: ['taxonomy', 'slug'],
  },
  resource: 'terms',
  action: 'write',
  scope: (args) => args.taxonomy as string | undefined,
}

// --- Placeholder handlers (ContentEngine integration comes later) ---

export const listTaxonomiesHandler: McpToolHandler = async () => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        taxonomies: [],
        total: 0,
      }),
    },
  ],
})

export const getTaxonomyHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        handle: args.handle,
        title: '',
        terms: [],
      }),
    },
  ],
})

export const listTermsHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        taxonomy: args.taxonomy,
        terms: [],
        total: 0,
      }),
    },
  ],
})

export const getTermHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        taxonomy: args.taxonomy,
        slug: args.slug,
        title: '',
        content: '',
        data: {},
      }),
    },
  ],
})

export const createTermHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        taxonomy: args.taxonomy,
        slug: args.slug ?? '',
        title: args.title,
        created: true,
      }),
    },
  ],
})

export const updateTermHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        taxonomy: args.taxonomy,
        slug: args.slug,
        updated: true,
      }),
    },
  ],
})

export const deleteTermHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        taxonomy: args.taxonomy,
        slug: args.slug,
        deleted: true,
      }),
    },
  ],
})

/**
 * All taxonomy and term tool definitions with their handlers.
 * Register these with MadoriMcpServer via `registerTools()`.
 */
export const taxonomyTools: Array<{
  definition: McpToolDefinition
  handler: McpToolHandler
}> = [
  { definition: listTaxonomies, handler: listTaxonomiesHandler },
  { definition: getTaxonomy, handler: getTaxonomyHandler },
  { definition: listTerms, handler: listTermsHandler },
  { definition: getTerm, handler: getTermHandler },
  { definition: createTerm, handler: createTermHandler },
  { definition: updateTerm, handler: updateTermHandler },
  { definition: deleteTerm, handler: deleteTermHandler },
]
