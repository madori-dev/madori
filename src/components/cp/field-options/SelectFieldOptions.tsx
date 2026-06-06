'use client'

import { useState } from 'react'
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface FieldOptionsProps {
  options: Record<string, unknown>
  onChange: (options: Record<string, unknown>) => void
}

export function SelectFieldOptions({ options, onChange }: FieldOptionsProps) {
  const [newChoice, setNewChoice] = useState('')

  const choices = Array.isArray(options.options)
    ? (options.options as string[])
    : []

  function updateChoices(updated: string[]) {
    onChange({ ...options, options: updated })
  }

  function handleAdd() {
    const trimmed = newChoice.trim()
    if (!trimmed) return
    updateChoices([...choices, trimmed])
    setNewChoice('')
  }

  function handleRemove(index: number) {
    updateChoices(choices.filter((_, i) => i !== index))
  }

  function handleMoveUp(index: number) {
    if (index === 0) return
    const updated = [...choices]
    ;[updated[index - 1], updated[index]] = [updated[index], updated[index - 1]]
    updateChoices(updated)
  }

  function handleMoveDown(index: number) {
    if (index === choices.length - 1) return
    const updated = [...choices]
    ;[updated[index], updated[index + 1]] = [updated[index + 1], updated[index]]
    updateChoices(updated)
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
        <Label className="text-xs font-medium">Choices</Label>
        <p className="text-xs text-muted-foreground">
          Define the selectable options for this field.
        </p>
      </div>

      {/* Choices list */}
      {choices.length > 0 && (
        <ul className="space-y-1.5">
          {choices.map((choice, index) => (
            <li
              key={`${index}-${choice}`}
              className="flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-sm"
            >
              <span className="flex-1 truncate">{choice}</span>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => handleMoveUp(index)}
                disabled={index === 0}
                aria-label={`Move "${choice}" up`}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => handleMoveDown(index)}
                disabled={index === choices.length - 1}
                aria-label={`Move "${choice}" down`}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                onClick={() => handleRemove(index)}
                aria-label={`Remove "${choice}"`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Add new choice */}
      <div className="flex items-center gap-2">
        <Input
          value={newChoice}
          onChange={(e) => setNewChoice(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="New choice…"
          className="h-8 flex-1 text-sm"
          aria-label="New choice"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 shrink-0"
          onClick={handleAdd}
          disabled={!newChoice.trim()}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add
        </Button>
      </div>
    </div>
  )
}
