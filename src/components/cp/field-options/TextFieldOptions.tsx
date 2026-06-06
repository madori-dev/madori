'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface FieldOptionsProps {
  options: Record<string, unknown>
  onChange: (options: Record<string, unknown>) => void
}

export function TextFieldOptions({ options, onChange }: FieldOptionsProps) {
  return (
    <div className="space-y-4">
      {/* Character Limit */}
      <div className="space-y-1.5">
        <Label htmlFor="opt-character-limit" className="text-xs font-medium">
          Character Limit
        </Label>
        <Input
          id="opt-character-limit"
          type="number"
          min={0}
          value={options.character_limit != null ? String(options.character_limit) : ''}
          onChange={(e) =>
            onChange({
              ...options,
              character_limit: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          placeholder="No limit"
          className="h-8 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Maximum number of characters allowed.
        </p>
      </div>

      {/* Input Type */}
      <div className="space-y-1.5">
        <Label htmlFor="opt-input-type" className="text-xs font-medium">
          Input Type
        </Label>
        <Input
          id="opt-input-type"
          value={(options.input_type as string) ?? ''}
          onChange={(e) =>
            onChange({ ...options, input_type: e.target.value || undefined })
          }
          placeholder="text"
          className="h-8 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          HTML input type hint (e.g. email, url, tel).
        </p>
      </div>

      {/* Prepend */}
      <div className="space-y-1.5">
        <Label htmlFor="opt-prepend" className="text-xs font-medium">
          Prepend
        </Label>
        <Input
          id="opt-prepend"
          value={(options.prepend as string) ?? ''}
          onChange={(e) =>
            onChange({ ...options, prepend: e.target.value || undefined })
          }
          placeholder="e.g. https://"
          className="h-8 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Text shown before the input field.
        </p>
      </div>

      {/* Append */}
      <div className="space-y-1.5">
        <Label htmlFor="opt-append" className="text-xs font-medium">
          Append
        </Label>
        <Input
          id="opt-append"
          value={(options.append as string) ?? ''}
          onChange={(e) =>
            onChange({ ...options, append: e.target.value || undefined })
          }
          placeholder="e.g. .com"
          className="h-8 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Text shown after the input field.
        </p>
      </div>
    </div>
  )
}
