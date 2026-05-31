'use client'

import { FieldConfig, FieldDefinition, FieldType } from '@/lib/blueprints/types'
import { TextField } from './TextField'
import { SlugField } from './SlugField'
import { MarkdownField } from './MarkdownField'
import { TiptapField } from './TiptapField'
import { NumberField } from './NumberField'
import { ToggleField } from './ToggleField'
import { SelectField } from './SelectField'
import { MultiselectField } from './MultiselectField'
import { DateField } from './DateField'
import { AssetField } from './AssetField'
import { EntriesField } from './EntriesField'
import { TaxonomyField } from './TaxonomyField'
import { ReplicatorField } from './ReplicatorField'
import { GridField } from './GridField'
import { YamlField } from './YamlField'
import { CodeField } from './CodeField'
import { HiddenField } from './HiddenField'

export interface FieldComponentProps {
  value: unknown
  onChange: (value: unknown) => void
  field: FieldConfig
  error?: string[]
}

type FieldComponent = React.ComponentType<FieldComponentProps>

const fieldComponentMap: Record<FieldType, FieldComponent> = {
  text: TextField,
  slug: SlugField,
  markdown: MarkdownField,
  tiptap: TiptapField,
  number: NumberField,
  toggle: ToggleField,
  select: SelectField,
  multiselect: MultiselectField,
  date: DateField,
  asset: AssetField,
  entries: EntriesField,
  taxonomy: TaxonomyField,
  replicator: ReplicatorField,
  grid: GridField,
  yaml: YamlField,
  code: CodeField,
  hidden: HiddenField,
}

interface FieldRendererProps {
  fieldDefinition: FieldDefinition
  value: unknown
  onChange: (value: unknown) => void
  error?: string[]
}

export function FieldRenderer({ fieldDefinition, value, onChange, error }: FieldRendererProps) {
  const Component = fieldComponentMap[fieldDefinition.field.type]

  if (!Component) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Unknown field type: <code>{fieldDefinition.field.type}</code>
      </div>
    )
  }

  // Derive display label from handle if not explicitly set
  const field = { ...fieldDefinition.field }
  if (!field.display) {
    field.display = fieldDefinition.handle
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }

  return (
    <Component
      value={value}
      onChange={onChange}
      field={field}
      error={error}
    />
  )
}
