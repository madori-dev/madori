'use client'

import { FieldConfig } from '@/lib/blueprints/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface FieldComponentProps {
  value: unknown
  onChange: (value: unknown) => void
  field: FieldConfig
  error?: string[]
}

export function NumberField({ value, onChange, field, error }: FieldComponentProps) {
  const id = field.options?.__fieldId as string | undefined
  const describedBy = field.options?.__ariaDescribedBy as string | undefined
  return (
    <div className="flex flex-col gap-1">
      {field.display && (
        <Label htmlFor={id} className="text-foreground">
          {field.display}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
      )}
      <Input
        id={id}
        aria-describedby={describedBy}
        aria-invalid={Boolean(error?.length)}
        type="number"
        value={(value as number) ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        min={field.options?.min as number}
        max={field.options?.max as number}
        step={field.options?.step as number}
        className={`rounded-md border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring ${error && error.length > 0 ? 'border-destructive' : 'border-border'}`}
      />
    </div>
  )
}
