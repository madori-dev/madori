'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import {
  Save,
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { ErrorAlert } from '@/components/cp/ErrorAlert'
import { ListSkeleton } from '@/components/cp/ListSkeleton'

import type { FieldConfig, FieldDefinition, FieldType } from '@/lib/blueprints/types'

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'slug', label: 'Slug' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'tiptap', label: 'Rich Text (Tiptap)' },
  { value: 'number', label: 'Number' },
  { value: 'toggle', label: 'Toggle' },
  { value: 'select', label: 'Select' },
  { value: 'multiselect', label: 'Multi-select' },
  { value: 'date', label: 'Date' },
  { value: 'asset', label: 'Asset' },
  { value: 'entries', label: 'Entries' },
  { value: 'taxonomy', label: 'Taxonomy' },
  { value: 'replicator', label: 'Replicator' },
  { value: 'grid', label: 'Grid' },
  { value: 'yaml', label: 'YAML' },
  { value: 'code', label: 'Code' },
  { value: 'hidden', label: 'Hidden' },
]

export default function FieldsetEditorPage() {
  const params = useParams()
  const handle = params.handle as string

  const [fields, setFields] = useState<FieldDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/fieldsets/${handle}`)
        if (res.ok) {
          const json = await res.json()
          setFields(json.data?.fields ?? [])
        } else if (res.status === 404) {
          setFields([])
        } else {
          setError(`Failed to load fieldset: ${res.status}`)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load fieldset')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [handle])

  const saveFieldset = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/fieldsets/${handle}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message || `Failed to save: ${res.status}`)
      }
      toast.success('Fieldset saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save fieldset')
      toast.error('Failed to save fieldset')
    } finally {
      setSaving(false)
    }
  }, [handle, fields])

  function addField() {
    setFields([...fields, { handle: '', field: { type: 'text' } }])
  }

  function removeField(index: number) {
    setFields(fields.filter((_, i) => i !== index))
  }

  function updateField(index: number, updated: FieldDefinition) {
    const next = [...fields]
    next[index] = updated
    setFields(next)
  }

  function moveField(from: number, to: number) {
    const next = [...fields]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setFields(next)
  }

  function toggleExpanded(id: string) {
    setExpandedFields((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) return <ListSkeleton rows={4} />

  return (
    <div className="max-w-4xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/cp/fieldsets" />}>
              Fieldsets
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{handle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{handle}</h1>
        <Button onClick={saveFieldset} disabled={saving}>
          <Save className="size-4" />
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {error && <ErrorAlert message={error} />}

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
          <span className="text-sm font-medium">Fields</span>
          <Button variant="ghost" size="icon-xs" onClick={addField}>
            <Plus className="size-3.5" />
          </Button>
        </div>

        <div className="divide-y">
          {fields.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">No fields yet.</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={addField}>
                <Plus className="size-3.5" />
                Add Field
              </Button>
            </div>
          ) : (
            fields.map((field, index) => {
              const fieldId = `field-${index}`
              const isExpanded = expandedFields.has(fieldId)

              return (
                <FieldRow
                  key={fieldId}
                  field={field}
                  index={index}
                  totalFields={fields.length}
                  isExpanded={isExpanded}
                  onToggle={() => toggleExpanded(fieldId)}
                  onUpdate={(f) => updateField(index, f)}
                  onRemove={() => removeField(index)}
                  onMoveUp={index > 0 ? () => moveField(index, index - 1) : undefined}
                  onMoveDown={index < fields.length - 1 ? () => moveField(index, index + 1) : undefined}
                />
              )
            })
          )}
        </div>
      </Card>
    </div>
  )
}

function FieldRow({
  field,
  index,
  totalFields,
  isExpanded,
  onToggle,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  field: FieldDefinition
  index: number
  totalFields: number
  isExpanded: boolean
  onToggle: () => void
  onUpdate: (f: FieldDefinition) => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  function updateHandle(handle: string) {
    onUpdate({ ...field, handle })
  }

  function updateFieldConfig(config: Partial<FieldConfig>) {
    onUpdate({ ...field, field: { ...field.field, ...config } })
  }

  return (
    <div className="group">
      <div
        className="flex items-center gap-2 px-4 py-2.5 hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <GripVertical className="size-3.5 text-muted-foreground/50 shrink-0" />
        {isExpanded ? (
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="text-sm font-medium min-w-0 truncate flex-1">
          {field.handle || (field as unknown as { import?: string }).import || <span className="italic text-muted-foreground">unnamed</span>}
        </span>
        {field.field ? (
          <Badge variant="secondary" className="text-xs shrink-0">
            {field.field.type}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs shrink-0">
            import
          </Badge>
        )}
        {field.field?.required && (
          <Badge variant="outline" className="text-xs shrink-0">
            required
          </Badge>
        )}
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              />
            }
          >
            <Trash2 className="size-3 text-destructive" />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove field?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the &ldquo;{field.handle || 'unnamed'}&rdquo; field from this fieldset. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onRemove}>
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {isExpanded && field.field && (
        <div className="border-t bg-muted/10 px-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Handle</Label>
              <Input
                value={field.handle}
                onChange={(e) => updateHandle(e.target.value)}
                placeholder="field_handle"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Display Name</Label>
              <Input
                value={field.field.display ?? ''}
                onChange={(e) => updateFieldConfig({ display: e.target.value || undefined })}
                placeholder="Field Label"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <select
                value={field.field.type}
                onChange={(e) => updateFieldConfig({ type: e.target.value as FieldType })}
                className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {FIELD_TYPES.map((ft) => (
                  <option key={ft.value} value={ft.value}>
                    {ft.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Required</Label>
              <div className="flex h-8 items-center">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={field.field.required ?? false}
                    onChange={(e) => updateFieldConfig({ required: e.target.checked || undefined })}
                    className="size-4 rounded border-input"
                  />
                  <span className="text-sm text-muted-foreground">This field is required</span>
                </label>
              </div>
            </div>
          </div>

          {/* Select/multiselect options */}
          {(field.field.type === 'select' || field.field.type === 'multiselect') && (
            <div className="mt-4 space-y-1.5">
              <Label className="text-xs">Options (one per line)</Label>
              <textarea
                value={
                  Array.isArray(field.field.options?.options)
                    ? (field.field.options.options as string[]).join('\n')
                    : ''
                }
                onChange={(e) => {
                  const options = e.target.value.split('\n').filter(Boolean)
                  updateFieldConfig({ options: { options } })
                }}
                placeholder="option_1&#10;option_2&#10;option_3"
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}

          {/* Asset max_files */}
          {field.field.type === 'asset' && (
            <div className="mt-4 space-y-1.5">
              <Label className="text-xs">Max Files</Label>
              <Input
                type="number"
                min={0}
                value={(field.field.options?.max_files as number) ?? 0}
                onChange={(e) => {
                  const max_files = parseInt(e.target.value, 10) || 0
                  updateFieldConfig({ options: { ...field.field.options, max_files } })
                }}
                placeholder="0 = unlimited"
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                1 = single file, &gt;1 = multi (up to limit), 0 = unlimited
              </p>
            </div>
          )}

          {/* Validation rules */}
          <div className="mt-4 space-y-1.5">
            <Label className="text-xs">Validation Rules (one per line)</Label>
            <textarea
              value={(field.field.validate ?? []).join('\n')}
              onChange={(e) => {
                const validate = e.target.value.split('\n').filter(Boolean)
                updateFieldConfig({ validate: validate.length > 0 ? validate : undefined })
              }}
              placeholder="max:255&#10;min:1"
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Move buttons */}
          <div className="mt-3 flex items-center gap-2">
            {onMoveUp && (
              <Button variant="ghost" size="xs" onClick={onMoveUp}>
                ↑ Move Up
              </Button>
            )}
            {onMoveDown && (
              <Button variant="ghost" size="xs" onClick={onMoveDown}>
                ↓ Move Down
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
