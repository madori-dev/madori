'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import {
  Save,
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ListSkeleton } from '@/components/cp/ListSkeleton'
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

import type {
  Blueprint,
  BlueprintTab,
  BlueprintType,
  FieldConfig,
  FieldDefinition,
  FieldType,
} from '@/lib/blueprints/types'

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

function makeEmptyField(): FieldDefinition {
  return { handle: '', field: { type: 'text' } }
}

export default function BlueprintEditorPage() {
  const params = useParams()
  const router = useRouter()
  const type = params.type as BlueprintType
  const handle = params.handle as string

  const [blueprint, setBlueprint] = useState<Blueprint | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/blueprints/${type}/${handle}`)
        if (res.ok) {
          const json = await res.json()
          setBlueprint(json.data)
        } else if (res.status === 404) {
          // New blueprint
          setBlueprint({ handle, tabs: { main: { fields: [] } } })
        } else {
          throw new Error(`Failed to load blueprint: ${res.status}`)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [type, handle])

  const save = useCallback(async () => {
    if (!blueprint) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/blueprints/${type}/${handle}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(blueprint),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error?.message ?? 'Save failed')
      }
      toast.success('Blueprint saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
      toast.error('Failed to save blueprint')
    } finally {
      setSaving(false)
    }
  }, [blueprint, type, handle])

  const addTab = useCallback(() => {
    if (!blueprint) return
    const tabKey = `tab_${Object.keys(blueprint.tabs).length + 1}`
    setBlueprint({
      ...blueprint,
      tabs: { ...blueprint.tabs, [tabKey]: { fields: [] } },
    })
  }, [blueprint])

  const removeTab = useCallback((tabKey: string) => {
    if (!blueprint) return
    const { [tabKey]: _, ...rest } = blueprint.tabs
    setBlueprint({ ...blueprint, tabs: rest })
  }, [blueprint])

  const updateTabDisplay = useCallback((tabKey: string, display: string) => {
    if (!blueprint) return
    setBlueprint({
      ...blueprint,
      tabs: {
        ...blueprint.tabs,
        [tabKey]: { ...blueprint.tabs[tabKey], display: display || undefined },
      },
    })
  }, [blueprint])

  const addField = useCallback((tabKey: string) => {
    if (!blueprint) return
    const tab = blueprint.tabs[tabKey]
    setBlueprint({
      ...blueprint,
      tabs: {
        ...blueprint.tabs,
        [tabKey]: { ...tab, fields: [...tab.fields, makeEmptyField()] },
      },
    })
  }, [blueprint])

  const removeField = useCallback((tabKey: string, fieldIndex: number) => {
    if (!blueprint) return
    const tab = blueprint.tabs[tabKey]
    setBlueprint({
      ...blueprint,
      tabs: {
        ...blueprint.tabs,
        [tabKey]: {
          ...tab,
          fields: tab.fields.filter((_, i) => i !== fieldIndex),
        },
      },
    })
  }, [blueprint])

  const updateField = useCallback((tabKey: string, fieldIndex: number, updated: FieldDefinition) => {
    if (!blueprint) return
    const tab = blueprint.tabs[tabKey]
    const fields = [...tab.fields]
    fields[fieldIndex] = updated
    setBlueprint({
      ...blueprint,
      tabs: {
        ...blueprint.tabs,
        [tabKey]: { ...tab, fields },
      },
    })
  }, [blueprint])

  const moveField = useCallback((tabKey: string, from: number, to: number) => {
    if (!blueprint) return
    const tab = blueprint.tabs[tabKey]
    const fields = [...tab.fields]
    const [moved] = fields.splice(from, 1)
    fields.splice(to, 0, moved)
    setBlueprint({
      ...blueprint,
      tabs: {
        ...blueprint.tabs,
        [tabKey]: { ...tab, fields },
      },
    })
  }, [blueprint])

  const toggleFieldExpanded = useCallback((id: string) => {
    setExpandedFields((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  if (loading) {
    return <ListSkeleton rows={4} />
  }

  if (!blueprint) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-sm text-destructive">{error ?? 'Blueprint not found'}</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" nativeButton={false} render={<Link href="/cp/blueprints" />}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">{handle}</h1>
              <Badge variant="secondary" className="text-xs">{type}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Edit field definitions for this blueprint.
            </p>
          </div>
        </div>
        <Button onClick={save} disabled={saving}>
          <Save className="size-4" />
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="mt-6 space-y-6">
        {Object.entries(blueprint.tabs).map(([tabKey, tab]) => (
          <TabEditor
            key={tabKey}
            tabKey={tabKey}
            tab={tab}
            canDelete={Object.keys(blueprint.tabs).length > 1}
            expandedFields={expandedFields}
            onToggleField={toggleFieldExpanded}
            onUpdateDisplay={(display) => updateTabDisplay(tabKey, display)}
            onAddField={() => addField(tabKey)}
            onRemoveField={(i) => removeField(tabKey, i)}
            onUpdateField={(i, f) => updateField(tabKey, i, f)}
            onMoveField={(from, to) => moveField(tabKey, from, to)}
            onRemoveTab={() => removeTab(tabKey)}
          />
        ))}
      </div>

      <div className="mt-4">
        <Button variant="outline" onClick={addTab}>
          <Plus className="size-4" />
          Add Tab
        </Button>
      </div>
    </div>
  )
}

// --- Tab Editor ---

function TabEditor({
  tabKey,
  tab,
  canDelete,
  expandedFields,
  onToggleField,
  onUpdateDisplay,
  onAddField,
  onRemoveField,
  onUpdateField,
  onMoveField,
  onRemoveTab,
}: {
  tabKey: string
  tab: BlueprintTab
  canDelete: boolean
  expandedFields: Set<string>
  onToggleField: (id: string) => void
  onUpdateDisplay: (display: string) => void
  onAddField: () => void
  onRemoveField: (index: number) => void
  onUpdateField: (index: number, field: FieldDefinition) => void
  onMoveField: (from: number, to: number) => void
  onRemoveTab: () => void
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-3">
          <Input
            value={tab.display ?? ''}
            onChange={(e) => onUpdateDisplay(e.target.value)}
            placeholder={tabKey}
            className="h-7 w-40 text-sm font-medium"
          />
          <span className="text-xs text-muted-foreground">{tabKey}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-xs" onClick={onAddField}>
            <Plus className="size-3.5" />
          </Button>
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="ghost" size="icon-xs" />}>
                <Trash2 className="size-3.5 text-destructive" />
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove tab?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the &ldquo;{tab.display || tabKey}&rdquo; tab and all its fields. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={onRemoveTab}>
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="divide-y">
        {tab.fields.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">No fields yet.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={onAddField}>
              <Plus className="size-3.5" />
              Add Field
            </Button>
          </div>
        ) : (
          tab.fields.map((field, index) => {
            const fieldId = `${tabKey}-${index}`
            const isExpanded = expandedFields.has(fieldId)

            return (
              <FieldRow
                key={fieldId}
                field={field}
                index={index}
                totalFields={tab.fields.length}
                isExpanded={isExpanded}
                onToggle={() => onToggleField(fieldId)}
                onUpdate={(f) => onUpdateField(index, f)}
                onRemove={() => onRemoveField(index)}
                onMoveUp={index > 0 ? () => onMoveField(index, index - 1) : undefined}
                onMoveDown={index < tab.fields.length - 1 ? () => onMoveField(index, index + 1) : undefined}
              />
            )
          })
        )}
      </div>
    </Card>
  )
}

// --- Field Row ---

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
  const updateHandle = (handle: string) => {
    onUpdate({ ...field, handle })
  }

  const updateFieldConfig = (config: Partial<FieldConfig>) => {
    onUpdate({ ...field, field: { ...field.field, ...config } })
  }

  return (
    <div className="group">
      {/* Collapsed row */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <GripVertical className="size-3.5 text-muted-foreground/50 shrink-0" />
        {isExpanded ? (
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="text-sm font-medium min-w-0 truncate flex-1">
          {field.handle || <span className="italic text-muted-foreground">unnamed</span>}
        </span>
        <Badge variant="secondary" className="text-xs shrink-0">
          {field.field.type}
        </Badge>
        {field.field.required && (
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
                This will remove the &ldquo;{field.handle || 'unnamed'}&rdquo; field from this tab. This action cannot be undone.
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

      {/* Expanded config */}
      {isExpanded && (
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
                <label className="flex items-center gap-2 cursor-pointer">
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

          {/* Replicator sets (fieldsets) */}
          {field.field.type === 'replicator' && (
            <ReplicatorSetsEditor
              sets={(field.field.options?.sets as string[]) ?? []}
              onChange={(sets) => updateFieldConfig({ options: { ...field.field.options, sets } })}
            />
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

// --- Replicator Sets Editor ---

function ReplicatorSetsEditor({
  sets,
  onChange,
}: {
  sets: string[]
  onChange: (sets: string[]) => void
}) {
  const [fieldsets, setFieldsets] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchFieldsets() {
      try {
        const res = await fetch('/api/fieldsets')
        if (res.ok) {
          const json = await res.json()
          setFieldsets((json.data ?? []).map((f: { handle: string }) => f.handle))
        }
      } catch {
        // fallback: try listing from known path
      } finally {
        setLoading(false)
      }
    }
    fetchFieldsets()
  }, [])

  function toggleSet(handle: string) {
    if (sets.includes(handle)) {
      onChange(sets.filter((s) => s !== handle))
    } else {
      onChange([...sets, handle])
    }
  }

  if (loading) {
    return (
      <div className="mt-4 space-y-1.5">
        <Label className="text-xs">Sets (Fieldsets)</Label>
        <div className="h-8 rounded bg-muted animate-pulse" />
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-1.5">
      <Label className="text-xs">Sets (Fieldsets)</Label>
      <p className="text-xs text-muted-foreground">
        Select which fieldsets are available as block types in this replicator.
      </p>
      {fieldsets.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          No fieldsets found. Add YAML files to <code className="text-[11px]">resources/fieldsets/</code>.
        </p>
      ) : (
        <div className="rounded-lg border divide-y mt-1">
          {fieldsets.map((handle) => (
            <button
              key={handle}
              type="button"
              onClick={() => toggleSet(handle)}
              className={`flex items-center justify-between w-full px-3 py-2 text-left text-sm transition-colors ${
                sets.includes(handle) ? 'bg-accent' : 'hover:bg-accent/50'
              }`}
            >
              <span className="font-medium">{handle}</span>
              {sets.includes(handle) && (
                <Badge variant="secondary" className="text-xs">selected</Badge>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
