'use client'

import { FieldConfig } from '@/lib/blueprints/types'

interface FieldComponentProps {
  value: unknown
  onChange: (value: unknown) => void
  field: FieldConfig
  error?: string[]
}

export function TaxonomyField({ value, onChange, field, error }: FieldComponentProps) {
  return (
    <div className="flex flex-col gap-1">
      {field.display && (
        <label className="text-sm font-medium text-foreground">
          {field.display}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <input
        type="text"
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="term-1, term-2"
        className={`rounded-md border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring ${error && error.length > 0 ? 'border-destructive' : 'border-border'}`}
      />
      <p className="text-xs text-muted-foreground">
        Enter taxonomy terms separated by commas (picker coming soon)
      </p>
    </div>
  )
}
