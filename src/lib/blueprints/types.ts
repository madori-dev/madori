export type FieldType =
  | 'text'
  | 'slug'
  | 'markdown'
  | 'tiptap'
  | 'number'
  | 'toggle'
  | 'select'
  | 'multiselect'
  | 'date'
  | 'asset'
  | 'entries'
  | 'taxonomy'
  | 'replicator'
  | 'grid'
  | 'yaml'
  | 'code'
  | 'hidden'

export type ValidationRule = string

export interface VisibilityCondition {
  field: string
  operator: 'equals' | 'not_equals' | 'contains' | 'empty' | 'not_empty'
  value?: unknown
}

export interface FieldConfig {
  type: FieldType
  display?: string
  required?: boolean
  default?: unknown
  validate?: ValidationRule[]
  options?: Record<string, unknown>
  visibility?: VisibilityCondition
}

export interface FieldDefinition {
  handle: string
  field: FieldConfig
}

export interface BlueprintSection {
  display?: string
  fields: FieldDefinition[]
}

export interface BlueprintTab {
  display?: string
  sections?: Record<string, BlueprintSection>
  fields: FieldDefinition[]
}

export interface Blueprint {
  handle: string
  tabs: Record<string, BlueprintTab>
}

export type BlueprintType = 'collections' | 'taxonomies' | 'globals' | 'forms'
