'use client'

import { FieldConfig } from '@/lib/blueprints/types'

interface FieldComponentProps {
  value: unknown
  onChange: (value: unknown) => void
  field: FieldConfig
  error?: string[]
}

export function SlugField({ value, onChange, field, error }: FieldComponentProps) {
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
        placeholder="url-friendly-slug"
        className="rounded-md border border-border px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <p className="text-xs text-muted-foreground">
        URL-friendly identifier. Use lowercase letters, numbers, and hyphens.
      </p>
      {error && error.length > 0 && (
        <div className="text-xs text-red-600">
          {error.map((msg, i) => (
            <p key={i}>{msg}</p>
          ))}
        </div>
      )}
    </div>
  )
}
