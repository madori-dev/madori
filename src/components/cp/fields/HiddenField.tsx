'use client'

import { FieldConfig } from '@/lib/blueprints/types'

interface FieldComponentProps {
  value: unknown
  onChange: (value: unknown) => void
  field: FieldConfig
  error?: string[]
}

export function HiddenField({ value, onChange, field, error }: FieldComponentProps) {
  return (
    <>
      <input
        type="hidden"
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        name={field.display}
      />
      {error && error.length > 0 && (
        <div className="text-xs text-red-600">
          {error.map((msg, i) => (
            <p key={i}>{msg}</p>
          ))}
        </div>
      )}
    </>
  )
}
