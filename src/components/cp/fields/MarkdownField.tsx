'use client'

import { FieldConfig } from '@/lib/blueprints/types'

interface FieldComponentProps {
  value: unknown
  onChange: (value: unknown) => void
  field: FieldConfig
  error?: string[]
}

export function MarkdownField({ value, onChange, field, error }: FieldComponentProps) {
  return (
    <div className="flex flex-col gap-1">
      {field.display && (
        <label className="text-sm font-medium text-foreground">
          {field.display}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <textarea
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        rows={10}
        placeholder="Write markdown content..."
        className="rounded-md border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring resize-y"
      />
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
