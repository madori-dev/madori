'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface FieldOptionsProps {
  options: Record<string, unknown>
  onChange: (options: Record<string, unknown>) => void
}

export function ReplicatorFieldOptions({ options, onChange }: FieldOptionsProps) {
  const [newSet, setNewSet] = useState('')

  const sets: string[] = Array.isArray(options.sets) ? (options.sets as string[]) : []

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
          Define available sets for this replicator field.
        </p>
      </div>

      {/* Existing sets */}
      {sets.length > 0 && (
        <ul className="space-y-1.5">
          {sets.map((set, index) => (
            <li key={index} className="flex items-center gap-2">
              <span className="flex-1 rounded-md border px-3 py-1.5 text-sm bg-muted/50">
                {set}
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
          ))}
        </ul>
      )}

      {/* Add new set */}
      <div className="flex items-center gap-2">
        <Input
          value={newSet}
          onChange={(e) => setNewSet(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Set handle"
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
    </div>
  )
}
