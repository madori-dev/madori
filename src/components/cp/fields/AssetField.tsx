'use client'

import { useState, useCallback } from 'react'
import { ImageIcon, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { FieldConfig } from '@/lib/blueprints/types'
import { AssetPickerModal } from '@/components/cp/AssetPickerModal'
import { Button } from '@/components/ui/button'
import {
  validateUploadFile,
  DEFAULT_UPLOAD_CONSTRAINTS,
} from '@/lib/content/upload-constraints'

interface FieldComponentProps {
  value: unknown
  onChange: (value: unknown) => void
  field: FieldConfig
  error?: string[]
}

function isImagePath(path: string) {
  return /\.(jpe?g|png|gif|webp|svg|avif)$/i.test(path)
}

export function AssetField({ value, onChange, field, error }: FieldComponentProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dragging, setDragging] = useState(false)

  const maxFiles = (field.options?.max_files as number | undefined) ?? 0
  const isSingle = maxFiles === 1

  // Normalise value to always work with an array internally
  const values: string[] = isSingle
    ? value ? [value as string] : []
    : Array.isArray(value) ? (value as string[]) : value ? [value as string] : []

  const canAddMore = maxFiles === 0 || values.length < maxFiles

  const addAsset = useCallback(
    (url: string) => {
      if (isSingle) {
        onChange(url)
      } else {
        const next = [...values, url]
        onChange(next)
      }
    },
    [isSingle, values, onChange]
  )

  const removeAsset = useCallback(
    (index: number) => {
      if (isSingle) {
        onChange(null)
      } else {
        const next = values.filter((_, i) => i !== index)
        onChange(next.length ? next : null)
      }
    },
    [isSingle, values, onChange]
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const droppedFiles = Array.from(e.dataTransfer.files)
      if (!droppedFiles.length) return

      // Respect max_files limit
      const allowed = maxFiles === 0
        ? droppedFiles
        : droppedFiles.slice(0, Math.max(0, maxFiles - values.length))

      if (!allowed.length) return

      // Client-side validation: check file size/type constraints before uploading
      const validFiles: File[] = []
      for (const file of allowed) {
        const validationError = validateUploadFile(
          { name: file.name, size: file.size, type: file.type },
          DEFAULT_UPLOAD_CONSTRAINTS
        )
        if (validationError) {
          toast.error(validationError.message)
        } else {
          validFiles.push(file)
        }
      }

      if (!validFiles.length) return

      if (isSingle || validFiles.length === 1) {
        const formData = new FormData()
        formData.append('file', validFiles[0])
        try {
          const res = await fetch('/api/assets/upload', { method: 'POST', body: formData })
          if (res.ok) {
            const json = await res.json()
            if (json.data) addAsset(`/assets/${json.data.path}`)
          } else {
            const json = await res.json().catch(() => null)
            const msg = json?.error?.message ?? `Upload failed: ${res.status}`
            toast.error(msg)
          }
        } catch {
          toast.error('Network error during upload')
        }
      } else {
        const formData = new FormData()
        for (const file of validFiles) formData.append('files', file)
        try {
          const res = await fetch('/api/assets/upload-multiple', { method: 'POST', body: formData })
          if (res.ok) {
            const json = await res.json()
            const uploaded = json.data as { path: string }[]
            if (uploaded?.length) {
              const next = [...values, ...uploaded.map((a) => `/assets/${a.path}`)]
              onChange(isSingle ? next[0] : next)
            }
          } else {
            const json = await res.json().catch(() => null)
            const msg = json?.error?.message ?? `Upload failed: ${res.status}`
            toast.error(msg)
          }
        } catch {
          toast.error('Network error during upload')
        }
      }
    },
    [addAsset, isSingle, maxFiles, onChange, values]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
  }, [])

  return (
    <div className="flex flex-col gap-1">
      {field.display && (
        <label className="text-sm font-medium text-foreground">
          {field.display}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      {/* Selected assets */}
      {values.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {values.map((asset, index) => (
            <div
              key={`${asset}-${index}`}
              className="relative group flex items-center gap-3 rounded-md border border-border px-3 py-2"
            >
              {isImagePath(asset) ? (
                <img
                  src={asset}
                  alt={field.display ?? 'Selected asset'}
                  className="h-8 w-8 rounded object-cover shrink-0"
                />
              ) : (
                <ImageIcon className="h-5 w-5 text-muted-foreground shrink-0" />
              )}
              <span className="text-sm text-foreground truncate flex-1">
                {asset.split('/').pop()}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {isSingle && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setPickerOpen(true)}
                    className="cursor-pointer h-7 px-2 text-xs"
                  >
                    Replace
                  </Button>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => removeAsset(index)}
                  className="cursor-pointer h-7 w-7 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone / add button — shown when more files can be added */}
      {canAddMore && (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`flex items-center gap-3 rounded-md border border-dashed px-3 py-2 text-sm transition-colors cursor-pointer ${
            dragging
              ? 'border-primary bg-primary/5 text-foreground'
              : 'border-border text-muted-foreground hover:border-primary hover:text-foreground'
          }`}
        >
          <Upload className="h-4 w-4 shrink-0" />
          <span>
            {dragging
              ? 'Drop to upload'
              : values.length === 0
                ? 'Choose or drop a file'
                : 'Add another file'}
          </span>
        </button>
      )}

      {/* Limit hint for multi-file */}
      {maxFiles > 1 && (
        <p className="text-xs text-muted-foreground">
          {values.length}/{maxFiles} files
        </p>
      )}

      <AssetPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(url) => {
          if (isSingle) {
            onChange(url)
          } else {
            addAsset(url)
          }
          setPickerOpen(false)
        }}
      />
    </div>
  )
}
