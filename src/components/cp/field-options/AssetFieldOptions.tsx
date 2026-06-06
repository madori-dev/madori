'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface FieldOptionsProps {
  options: Record<string, unknown>
  onChange: (options: Record<string, unknown>) => void
}

export function AssetFieldOptions({ options, onChange }: FieldOptionsProps) {
  const maxFiles = options.max_files != null ? String(options.max_files) : ''
  const minFiles = options.min_files != null ? String(options.min_files) : ''

  function handleMaxFilesChange(value: string) {
    const parsed = value === '' ? undefined : parseInt(value, 10)
    onChange({
      ...options,
      max_files: parsed != null && !isNaN(parsed) ? parsed : undefined,
    })
  }

  function handleMinFilesChange(value: string) {
    const parsed = value === '' ? undefined : parseInt(value, 10)
    onChange({
      ...options,
      min_files: parsed != null && !isNaN(parsed) ? parsed : undefined,
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="asset-min-files" className="text-xs font-medium">
          Minimum Files
        </Label>
        <Input
          id="asset-min-files"
          type="number"
          min={0}
          value={minFiles}
          onChange={(e) => handleMinFilesChange(e.target.value)}
          placeholder="No minimum"
          className="h-8 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Minimum number of files required.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="asset-max-files" className="text-xs font-medium">
          Maximum Files
        </Label>
        <Input
          id="asset-max-files"
          type="number"
          min={0}
          value={maxFiles}
          onChange={(e) => handleMaxFilesChange(e.target.value)}
          placeholder="No limit"
          className="h-8 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Maximum number of files allowed. Leave empty for unlimited.
        </p>
      </div>
    </div>
  )
}
