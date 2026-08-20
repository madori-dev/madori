'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface FieldOptionsProps {
  options: Record<string, unknown>
  onChange: (options: Record<string, unknown>) => void
}

export function AssetFieldOptions({ options, onChange }: FieldOptionsProps) {
  // Blank max_files is legacy single-asset behavior, so show that effective default.
  const maxFiles = options.max_files != null ? String(options.max_files) : '1'
  const minFiles = options.min_files != null ? String(options.min_files) : ''
  const effectiveMax = options.max_files == null ? 1 : Number(options.max_files)
  const isSingle = effectiveMax === 1

  function handleMaxFilesChange(value: string) {
    const parsed = value === '' ? undefined : parseInt(value, 10)
    const max = parsed != null && !isNaN(parsed) ? parsed : undefined
    onChange({
      ...options,
      max_files: max,
      // A scalar asset cannot meaningfully require more than one file.
      min_files: (max ?? 1) === 1 && Number(options.min_files) > 1 ? undefined : options.min_files,
    })
  }

  function handleMinFilesChange(value: string) {
    const parsed = value === '' ? undefined : parseInt(value, 10)
    if (isSingle && parsed !== undefined && parsed > 1) return
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
          max={isSingle ? 1 : undefined}
          placeholder={isSingle ? '0 or 1' : 'No minimum'}
          className="h-8 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          {isSingle ? 'Single assets may require at most one file.' : 'Minimum number of files required.'}
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
          placeholder="1"
          className="h-8 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Omitted means one asset (legacy-compatible). Set 0 for unlimited, or 2+ for multiple assets.
        </p>
      </div>
    </div>
  )
}
