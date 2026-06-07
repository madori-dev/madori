'use client'

import { ReplicatorField } from './ReplicatorField'

import type { FieldConfig } from '@/lib/blueprints/types'

interface FieldComponentProps {
  value: unknown
  onChange: (value: unknown) => void
  field: FieldConfig
  error?: string[]
}

/**
 * Blocks field type — a page-building field that automatically includes
 * all fieldsets marked with `is_block: true`.
 *
 * No configuration needed. Just add `{ type: 'blocks' }` to a blueprint
 * and all block fieldsets become available.
 */
export function BlocksField({ value, onChange, field, error }: FieldComponentProps) {
  // Delegate to ReplicatorField with no explicit sets —
  // it will auto-load all is_block fieldsets
  const syntheticField: FieldConfig = {
    ...field,
    type: 'replicator',
    options: {
      ...field.options,
      // No sets — ReplicatorField auto-loads all is_block fieldsets
    },
  }

  return (
    <ReplicatorField
      value={value}
      onChange={onChange}
      field={syntheticField}
      error={error}
    />
  )
}
