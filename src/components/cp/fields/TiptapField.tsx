'use client'

import { FieldConfig } from '@/lib/blueprints/types'
import { TipTapEditor } from '@/components/cp/TipTapEditor'

interface FieldComponentProps {
  value: unknown
  onChange: (value: unknown) => void
  field: FieldConfig
  error?: string[]
}

export function TiptapField({ value, onChange, field, error }: FieldComponentProps) {
  // Value can be a JSON object (structured), a JSON string, or a markdown string (legacy)
  const editorValue = typeof value === 'string' || typeof value === 'object' ? value ?? '' : ''

  return (
    <div className="flex flex-col gap-1">
      {field.display && (
        <label className="text-sm font-medium text-foreground">
          {field.display}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <TipTapEditor
        value={editorValue}
        onChange={(json) => onChange(json)}
        placeholder={field.options?.placeholder as string | undefined}
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
