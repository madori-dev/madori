'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import {
  Save,
  Plus,
  Trash2,
  GripVertical,
  ArrowLeft,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ListSkeleton } from '@/components/cp/ListSkeleton'
import { FieldConfigSheet } from '@/components/cp/FieldConfigSheet'
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
  FieldDefinition,
} from '@/lib/blueprints/types'

function makeEmptyField(): FieldDefinition {
  return { handle: '', field: { type: 'text' } }
}

export default function BlueprintEditorPage() {
  const params = useParams()
  const type = params.type as BlueprintType
  const handle = params.handle as string

  const [blueprint, setBlueprint] = useState<Blueprint | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Field Config Sheet state
  const [selectedField, setSelectedField] = useState<FieldDefinition | null>(null)
  const [selectedFieldTab, setSelectedFieldTab] = useState<string | null>(null)
  const [selectedFieldIndex, setSelectedFieldIndex] = useState<number | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

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

  const openFieldSheet = useCallback((tabKey: string, index: number, field: FieldDefinition) => {
    setSelectedField(field)
    setSelectedFieldTab(tabKey)
    setSelectedFieldIndex(index)
    setSheetOpen(true)
  }, [])

  const handleSheetSave = useCallback((updatedField: FieldDefinition) => {
    if (selectedFieldTab != null && selectedFieldIndex != null) {
      updateField(selectedFieldTab, selectedFieldIndex, updatedField)
    }
    setSheetOpen(false)
    setSelectedField(null)
    setSelectedFieldTab(null)
    setSelectedFieldIndex(null)
  }, [selectedFieldTab, selectedFieldIndex, updateField])

  const handleSheetOpenChange = useCallback((open: boolean) => {
    setSheetOpen(open)
    if (!open) {
      setSelectedField(null)
      setSelectedFieldTab(null)
      setSelectedFieldIndex(null)
    }
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
            onFieldClick={(index, field) => openFieldSheet(tabKey, index, field)}
            onUpdateDisplay={(display) => updateTabDisplay(tabKey, display)}
            onAddField={() => addField(tabKey)}
            onRemoveField={(i) => removeField(tabKey, i)}
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

      {/* Field Config Sheet */}
      <FieldConfigSheet
        open={sheetOpen}
        onOpenChange={handleSheetOpenChange}
        field={selectedField}
        onSave={handleSheetSave}
      />
    </div>
  )
}

// --- Tab Editor ---

function TabEditor({
  tabKey,
  tab,
  canDelete,
  onFieldClick,
  onUpdateDisplay,
  onAddField,
  onRemoveField,
  onMoveField,
  onRemoveTab,
}: {
  tabKey: string
  tab: BlueprintTab
  canDelete: boolean
  onFieldClick: (index: number, field: FieldDefinition) => void
  onUpdateDisplay: (display: string) => void
  onAddField: () => void
  onRemoveField: (index: number) => void
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
          tab.fields.map((field, index) => (
            <FieldRow
              key={`${tabKey}-${index}`}
              field={field}
              index={index}
              totalFields={tab.fields.length}
              onClick={() => onFieldClick(index, field)}
              onRemove={() => onRemoveField(index)}
              onMoveUp={index > 0 ? () => onMoveField(index, index - 1) : undefined}
              onMoveDown={index < tab.fields.length - 1 ? () => onMoveField(index, index + 1) : undefined}
            />
          ))
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
  onClick,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  field: FieldDefinition
  index: number
  totalFields: number
  onClick: () => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  return (
    <div className="group">
      <div
        className="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onClick}
      >
        <GripVertical className="size-3.5 text-muted-foreground/50 shrink-0" />
        <span className="text-sm font-medium min-w-0 truncate flex-1">
          {field.handle || <span className="italic text-muted-foreground">unnamed</span>}
        </span>
        {field.field.display && (
          <span className="text-xs text-muted-foreground truncate max-w-32">
            {field.field.display}
          </span>
        )}
        <Badge variant="secondary" className="text-xs shrink-0">
          {field.field.type}
        </Badge>
        {field.field.required && (
          <Badge variant="outline" className="text-xs shrink-0">
            required
          </Badge>
        )}
        {onMoveUp && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); onMoveUp() }}
          >
            <span className="text-xs">↑</span>
          </Button>
        )}
        {onMoveDown && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); onMoveDown() }}
          >
            <span className="text-xs">↓</span>
          </Button>
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
    </div>
  )
}
