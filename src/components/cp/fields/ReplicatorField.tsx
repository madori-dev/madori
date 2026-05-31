'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { FieldRenderer } from './FieldRenderer'

import type { FieldConfig, FieldDefinition } from '@/lib/blueprints/types'

interface FieldComponentProps {
  value: unknown
  onChange: (value: unknown) => void
  field: FieldConfig
  error?: string[]
}

interface Block {
  _type: string
  [key: string]: unknown
}

interface FieldsetData {
  handle: string
  fields: FieldDefinition[]
}

export function ReplicatorField({ value, onChange, field, error }: FieldComponentProps) {
  const [fieldsets, setFieldsets] = useState<FieldsetData[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedBlocks, setExpandedBlocks] = useState<Set<number>>(new Set())

  const blocks: Block[] = Array.isArray(value) ? value : []
  const configuredSets = (field.options?.sets as string[]) ?? []

  useEffect(() => {
    async function loadFieldsets() {
      if (configuredSets.length === 0) {
        setLoading(false)
        return
      }

      try {
        const results: FieldsetData[] = []
        for (const handle of configuredSets) {
          const res = await fetch(`/api/fieldsets/${handle}`)
          if (res.ok) {
            const json = await res.json()
            const fields = (json.data?.fields ?? []).filter(
              (f: { field?: unknown }) => f.field // exclude import entries
            )
            results.push({ handle, fields })
          }
        }
        setFieldsets(results)
      } catch {
        // Fieldsets failed to load — fallback to raw mode
      } finally {
        setLoading(false)
      }
    }
    loadFieldsets()
  }, [configuredSets.join(',')])

  function addBlock(type: string) {
    const newBlock: Block = { _type: type }
    // Set defaults from fieldset
    const fs = fieldsets.find((f) => f.handle === type)
    if (fs) {
      for (const fieldDef of fs.fields) {
        if (fieldDef.field.default !== undefined) {
          newBlock[fieldDef.handle] = fieldDef.field.default
        }
      }
    }
    const updated = [...blocks, newBlock]
    onChange(updated)
    setExpandedBlocks((prev) => new Set([...prev, updated.length - 1]))
  }

  function removeBlock(index: number) {
    onChange(blocks.filter((_, i) => i !== index))
    setExpandedBlocks((prev) => {
      const next = new Set<number>()
      for (const i of prev) {
        if (i < index) next.add(i)
        else if (i > index) next.add(i - 1)
      }
      return next
    })
  }

  function updateBlock(index: number, fieldHandle: string, fieldValue: unknown) {
    const updated = blocks.map((block, i) =>
      i === index ? { ...block, [fieldHandle]: fieldValue } : block
    )
    onChange(updated)
  }

  function moveBlock(from: number, to: number) {
    const updated = [...blocks]
    const [moved] = updated.splice(from, 1)
    updated.splice(to, 0, moved)
    onChange(updated)
    setExpandedBlocks((prev) => {
      const next = new Set<number>()
      for (const i of prev) {
        if (i === from) next.add(to)
        else if (from < to && i > from && i <= to) next.add(i - 1)
        else if (from > to && i >= to && i < from) next.add(i + 1)
        else next.add(i)
      }
      return next
    })
  }

  function toggleExpanded(index: number) {
    setExpandedBlocks((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  // No sets configured — show a message
  if (configuredSets.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        {field.display && (
          <label className="text-sm font-medium text-foreground">
            {field.display}
            {field.required && <span className="text-destructive ml-0.5">*</span>}
          </label>
        )}
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No fieldsets configured for this replicator.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Edit the blueprint to assign fieldsets as block types.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-1">
        {field.display && (
          <label className="text-sm font-medium text-foreground">{field.display}</label>
        )}
        <div className="h-20 rounded-lg bg-muted animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {field.display && (
        <label className="text-sm font-medium text-foreground">
          {field.display}
          {field.required && <span className="text-destructive ml-0.5">*</span>}
        </label>
      )}

      {/* Block list */}
      {blocks.length > 0 && (
        <div className="space-y-2">
          {blocks.map((block, index) => {
            const isExpanded = expandedBlocks.has(index)
            const fs = fieldsets.find((f) => f.handle === block._type)

            return (
              <Card key={index} className="p-0 overflow-hidden">
                {/* Block header */}
                <div
                  className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b"
                  onClick={() => toggleExpanded(index)}
                >
                  <GripVertical className="size-3.5 text-muted-foreground/50 shrink-0" />
                  {isExpanded ? (
                    <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {block._type}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex-1 truncate">
                    {getBlockPreview(block, fs)}
                  </span>
                  <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    {index > 0 && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => moveBlock(index, index - 1)}
                      >
                        <span className="text-xs">↑</span>
                      </Button>
                    )}
                    {index < blocks.length - 1 && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => moveBlock(index, index + 1)}
                      >
                        <span className="text-xs">↓</span>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeBlock(index)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>

                {/* Block fields */}
                {isExpanded && fs && (
                  <div className="p-4 space-y-4">
                    {fs.fields.map((fieldDef) => (
                      <FieldRenderer
                        key={fieldDef.handle}
                        fieldDefinition={fieldDef}
                        value={block[fieldDef.handle]}
                        onChange={(val) => updateBlock(index, fieldDef.handle, val)}
                      />
                    ))}
                    {fs.fields.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        This fieldset has no fields defined.
                      </p>
                    )}
                  </div>
                )}

                {isExpanded && !fs && (
                  <div className="p-4">
                    <p className="text-xs text-muted-foreground">
                      Fieldset &ldquo;{block._type}&rdquo; not found.
                    </p>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Add block buttons */}
      <div className="flex flex-wrap gap-2">
        {fieldsets.map((fs) => (
          <Button
            key={fs.handle}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addBlock(fs.handle)}
          >
            <Plus className="size-3.5" />
            {fs.handle}
          </Button>
        ))}
      </div>

      {/* Errors */}
      {error && error.length > 0 && (
        <div className="text-xs text-destructive">
          {error.map((msg, i) => (
            <p key={i}>{msg}</p>
          ))}
        </div>
      )}
    </div>
  )
}

/** Get a short preview string from block data */
function getBlockPreview(block: Block, fs: FieldsetData | undefined): string {
  if (!fs) return ''
  // Find first text-like field for preview
  for (const fieldDef of fs.fields) {
    if (['text', 'slug'].includes(fieldDef.field.type)) {
      const val = block[fieldDef.handle]
      if (val && typeof val === 'string') return val
    }
  }
  return ''
}
