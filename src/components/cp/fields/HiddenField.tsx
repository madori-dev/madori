'use client'

import { FieldConfig } from '@/lib/blueprints/types'

interface FieldComponentProps {
  value: unknown
  onChange: (value: unknown) => void
  field: FieldConfig
  error?: string[]
}

export function HiddenField({ value, onChange, field }: FieldComponentProps) {
  return (
    <input
      type="hidden"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      name={field.display}
    />
  )
}
