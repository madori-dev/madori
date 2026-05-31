'use client'

import { useEffect, useState } from 'react'
import { FileCode2, Plus, Check } from 'lucide-react'

import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface BlueprintPickerProps {
  /** The blueprint type to list (collections, taxonomies, globals, forms) */
  type: string
  /** Currently selected blueprint handle */
  value: string
  /** Callback when selection changes */
  onChange: (handle: string) => void
  /** Whether "Create new" was selected (parent should generate a blueprint on submit) */
  onCreateNew?: (creating: boolean) => void
  /** Optional label override */
  label?: string
}

interface BlueprintOption {
  handle: string
  fieldCount: number
  tabCount: number
}

export function BlueprintPicker({
  type,
  value,
  onChange,
  onCreateNew,
  label = 'Blueprint',
}: BlueprintPickerProps) {
  const [options, setOptions] = useState<BlueprintOption[]>([])
  const [loading, setLoading] = useState(true)
  const [createNew, setCreateNew] = useState(!value)

  useEffect(() => {
    async function fetchBlueprints() {
      try {
        const res = await fetch(`/api/blueprints/${type}`)
        if (res.ok) {
          const json = await res.json()
          const blueprints = (json.data ?? []).map((bp: { handle: string; tabs: Record<string, { fields: unknown[] }> }) => {
            const tabCount = Object.keys(bp.tabs).length
            const fieldCount = Object.values(bp.tabs).reduce(
              (acc, tab) => acc + (tab.fields?.length ?? 0),
              0
            )
            return { handle: bp.handle, tabCount, fieldCount }
          })
          setOptions(blueprints)
          // If no value selected and no blueprints exist, default to create new
          if (!value && blueprints.length === 0) {
            setCreateNew(true)
            onCreateNew?.(true)
          }
        }
      } catch {
        // Silently fail — picker will show empty state
      } finally {
        setLoading(false)
      }
    }
    fetchBlueprints()
  }, [type])

  function handleSelect(handle: string) {
    setCreateNew(false)
    onCreateNew?.(false)
    onChange(handle)
  }

  function handleCreateNew() {
    setCreateNew(true)
    onCreateNew?.(true)
    onChange('')
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="h-10 rounded-lg bg-muted animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="rounded-lg border divide-y">
        {options.map((bp) => (
          <button
            key={bp.handle}
            type="button"
            onClick={() => handleSelect(bp.handle)}
            className={cn(
              'flex items-center justify-between w-full px-3 py-2 text-left transition-colors cursor-pointer',
              value === bp.handle && !createNew
                ? 'bg-accent'
                : 'hover:bg-accent/50'
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <FileCode2 className="size-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium truncate">{bp.handle}</span>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {bp.tabCount} tab{bp.tabCount !== 1 ? 's' : ''} · {bp.fieldCount} field{bp.fieldCount !== 1 ? 's' : ''}
              </span>
            </div>
            {value === bp.handle && !createNew && (
              <Check className="size-4 text-primary shrink-0" />
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={handleCreateNew}
          className={cn(
            'flex items-center gap-2.5 w-full px-3 py-2 text-left transition-colors cursor-pointer',
            createNew ? 'bg-accent' : 'hover:bg-accent/50'
          )}
        >
          <Plus className="size-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">Create new</span>
          {createNew && (
            <Check className="size-4 text-primary shrink-0 ml-auto" />
          )}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {createNew
          ? 'An empty blueprint will be generated automatically.'
          : value
            ? `Using blueprint: ${value}`
            : 'Select an existing blueprint or create a new one.'}
      </p>
    </div>
  )
}
