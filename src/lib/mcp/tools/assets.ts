import type { McpToolDefinition, McpToolHandler } from '../server'

/**
 * MCP tool definitions for asset operations.
 *
 * Requirements: 17.5, 17.10
 */

const listAssetsDefinition: McpToolDefinition = {
  name: 'list_assets',
  description:
    'List all assets in the CMS. Returns filename, path, mime type, size, and alt text for each asset. Supports optional filtering by directory or mime type.',
  inputSchema: {
    type: 'object',
    properties: {
      directory: {
        type: 'string',
        description: 'Filter assets by directory path (e.g. "images/blog")',
      },
      mimeType: {
        type: 'string',
        description: 'Filter assets by mime type prefix (e.g. "image/", "application/pdf")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of assets to return',
      },
      offset: {
        type: 'number',
        description: 'Skip this many assets for pagination',
      },
    },
  },
  resource: 'assets',
  action: 'read',
}

const getAssetDefinition: McpToolDefinition = {
  name: 'get_asset',
  description:
    'Get detailed information about a specific asset by its path. Returns filename, directory, mime type, size, dimensions (for images), alt text, and metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The asset path relative to the assets directory (e.g. "images/hero.jpg")',
      },
    },
    required: ['path'],
  },
  resource: 'assets',
  action: 'read',
}

const uploadAssetDefinition: McpToolDefinition = {
  name: 'upload_asset',
  description:
    'Upload a new asset to the CMS. Accepts base64-encoded file content, a target path, and optional metadata. Returns the created asset details.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Target path for the asset relative to the assets directory (e.g. "images/photo.jpg")',
      },
      content: {
        type: 'string',
        description: 'Base64-encoded file content',
      },
      alt: {
        type: 'string',
        description: 'Alt text for the asset (recommended for images)',
      },
    },
    required: ['path', 'content'],
  },
  resource: 'assets',
  action: 'write',
}

const deleteAssetDefinition: McpToolDefinition = {
  name: 'delete_asset',
  description:
    'Delete an asset from the CMS by its path. This permanently removes the file from the filesystem.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The asset path relative to the assets directory (e.g. "images/old-photo.jpg")',
      },
    },
    required: ['path'],
  },
  resource: 'assets',
  action: 'write',
}

const updateAssetMetadataDefinition: McpToolDefinition = {
  name: 'update_asset_metadata',
  description:
    'Update metadata for an existing asset. Supports updating alt text, title, and custom metadata fields without re-uploading the file.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The asset path relative to the assets directory (e.g. "images/hero.jpg")',
      },
      alt: {
        type: 'string',
        description: 'Updated alt text for the asset',
      },
      title: {
        type: 'string',
        description: 'Updated title for the asset',
      },
      metadata: {
        type: 'object',
        description: 'Custom metadata key-value pairs to set on the asset',
      },
    },
    required: ['path'],
  },
  resource: 'assets',
  action: 'write',
}

// Placeholder handlers — will delegate to AssetOperations once wired up
const listAssetsHandler: McpToolHandler = async () => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({ assets: [] }),
    },
  ],
})

const getAssetHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        path: args.path,
        filename: null,
        directory: null,
        mimeType: null,
        size: null,
        alt: null,
        metadata: {},
      }),
    },
  ],
})

const uploadAssetHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        path: args.path,
        created: true,
      }),
    },
  ],
})

const deleteAssetHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        path: args.path,
        deleted: true,
      }),
    },
  ],
})

const updateAssetMetadataHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        path: args.path,
        updated: true,
      }),
    },
  ],
})

/**
 * All asset tool registrations.
 */
export const assetTools: Array<{
  definition: McpToolDefinition
  handler: McpToolHandler
}> = [
  { definition: listAssetsDefinition, handler: listAssetsHandler },
  { definition: getAssetDefinition, handler: getAssetHandler },
  { definition: uploadAssetDefinition, handler: uploadAssetHandler },
  { definition: deleteAssetDefinition, handler: deleteAssetHandler },
  { definition: updateAssetMetadataDefinition, handler: updateAssetMetadataHandler },
]
