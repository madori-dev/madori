'use client'

import { FieldConfig } from '@/lib/blueprints/types'

interface FieldComponentProps {
  value: unknown
  onChange: (value: unknown) => void
  field: FieldConfig
  error?: string[]
}

export function MultiselectField({ value, onChange, field, error }: FieldComponentProps) {
  const options = (field.options?.options ?? field.options?.choices ?? []) as string[]
  const selected = Array.isArray(value) ? (value as string[]) : []

  function handleToggle(opt: string) {
    if (selected.includes(opt)) {
      onChange(selected.filter((v) => v !== opt))
    } else {
      onChange([...selected, opt])
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {field.display && (
        <label className="text-sm font-medium text-foreground">
          {field.display}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="flex flex-col gap-1.5 rounded-md border border-border px-3 py-2">
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={() => handleToggle(opt)}
              className="rounded border-border text-blue-600 focus:ring-ring"
            />
            {opt}
          </label>
        ))}
        {options.length === 0 && (
          <p className="text-xs text-muted-foreground">No options configured</p>
        )}
      </div>
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
