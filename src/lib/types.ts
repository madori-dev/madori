export interface Entry {
  title: string
  slug: string
  status: 'published' | 'draft'
  author?: string
  content: string
  data: Record<string, unknown>
  collection: string
  createdAt: string
  updatedAt: string
  contentHash?: string
}

export interface Collection {
  title: string
  handle: string
  route?: string
  blueprint: string
  sortable?: boolean
  dated?: boolean
  defaultStatus?: 'published' | 'draft'
  icon?: string
  sortDirection?: 'asc' | 'desc'
  template?: string
  layout?: string
  taxonomies?: string[]
  redirects?: { create?: string; '404'?: string }
  blueprints?: string[]
}

export interface Taxonomy {
  handle: string
  title: string
  blueprint?: string
}

export interface Term {
  title: string
  slug: string
  taxonomy: string
  description?: string
  data: Record<string, unknown>
}

export interface Global {
  handle: string
  title?: string
  data: Record<string, unknown>
}

export interface NavigationItem {
  [key: string]: unknown
  children?: NavigationItem[]
}

export interface Navigation {
  handle: string
  items: NavigationItem[]
}

export interface Asset {
  path: string
  filename: string
  extension: string
  size: number
  mimeType: string
  modifiedAt: string
  alt?: string
}

export interface Form {
  handle: string
  display: string
  fields: unknown[]
}

export interface FormSubmission {
  id: string
  form: string
  submittedAt: string
  data: Record<string, unknown>
}

export interface ListOptions {
  sort?: { field: string; direction: 'asc' | 'desc' }
  filter?: Record<string, unknown>
  limit?: number
  offset?: number
  status?: 'published' | 'draft' | 'all'
}
