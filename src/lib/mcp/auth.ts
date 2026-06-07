export interface McpApiKey {
  id: string
  keyHash: string
  label: string
  permissions: McpPermission[]
  createdAt: string
  lastUsedAt?: string
  revokedAt?: string
}

export interface McpPermission {
  resource: McpResourceType
  actions: McpAction[]
  scope?: string
}

export type McpResourceType =
  | 'collections'
  | 'entries'
  | 'taxonomies'
  | 'terms'
  | 'globals'
  | 'navigation'
  | 'assets'
  | 'blueprints'
  | 'fieldsets'
  | 'forms'

export type McpAction = 'read' | 'write'
