'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface FieldOptionsProps {
  options: Record<string, unknown>
  onChange: (options: Record<string, unknown>) => void
}

interface FieldsetInfo {
  handle: string
  is_block?: boolean
  display?: string
}

export function ReplicatorFieldOptions({ options, onChange }: FieldOptionsProps) {
  const [newSet, setNewSet] = useState('')
  const [allFieldsets, setAllFieldsets] = useState<FieldsetInfo[]>([])
  const [loading, setLoading] = useState(true)

  const sets: string[] = Array.isArray(options.sets) ? (options.sets as string[]) : []

  useEffect(() => {
    async function fetchFieldsets() {
      try {
        const res = await fetch('/api/fieldsets')
        if (res.ok) {
          const json = await res.json()
          setAllFieldsets(json.data ?? [])
        }
      } catch {
        // Silently fail — manual input still available
      } finally {
        setLoading(false)
      }
    }
    fetchFieldsets()
  }, [])

  function handleAdd() {
    const handle = newSet.trim()
    if (!handle) return
    if (sets.includes(handle)) return
    onChange({ ...options, sets: [...sets, handle] })
    setNewSet('')
  }

  function handleRemove(index: number) {
    const updated = sets.filter((_, i) => i !== index)
    onChange({ ...options, sets: updated })
  }

  function handleToggle(handle: string, checked: boolean) {
    if (checked && !sets.includes(handle)) {
      onChange({ ...options, sets: [...sets, handle] })
    } else if (!checked) {
      onChange({ ...options, sets: sets.filter((s) => s !== handle) })
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Sets</Label>
        <p className="text-xs text-muted-foreground">
          Select which fieldsets this replicator can repeat. Each selected fieldset becomes an available set.
        </p>
      </div>

      {/* Fieldset picker */}
      {!loading && allFieldsets.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">Available Fieldsets</Label>
          <div className="rounded-md border divide-y max-h-64 overflow-y-auto">
            {allFieldsets.map((fs) => (
              <label
                key={fs.handle}
                className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={sets.includes(fs.handle)}
                  onCheckedChange={(checked) => handleToggle(fs.handle, checked === true)}
                />
                <span className="text-sm">{fs.display || fs.handle}</span>
                <span className="text-xs text-muted-foreground ml-auto">{fs.handle}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="h-16 rounded-md bg-muted animate-pulse" />
      )}

      {/* Currently selected sets */}
      {sets.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Selected Sets ({sets.length})</Label>
          <ul className="space-y-1.5">
            {sets.map((set, index) => {
              const info = allFieldsets.find((f) => f.handle === set)
              return (
                <li key={index} className="flex items-center gap-2">
                  <span className="flex-1 rounded-md border px-3 py-1.5 text-sm bg-muted/50">
                    {info?.display || set}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-destructive hover:text-destructive"
                    onClick={() => handleRemove(index)}
                  >
                    Remove
                  </Button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Add manually (for fieldsets not yet created) */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Add Manually</Label>
        <div className="flex items-center gap-2">
          <Input
            value={newSet}
            onChange={(e) => setNewSet(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Fieldset handle"
            className="h-8 text-sm"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8"
            onClick={handleAdd}
            disabled={!newSet.trim()}
          >
            Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Use this to reference a fieldset that hasn&apos;t been created yet.
        </p>
      </div>
    </div>
  )
}
