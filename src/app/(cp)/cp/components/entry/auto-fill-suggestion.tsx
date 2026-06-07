'use client'

import { useState } from 'react'
import { Loader2, Sparkles, Check, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
  PopoverTrigger,
} from '@/components/ui/popover'

/**
 * A populated field — has a handle, value, and type.
 */
export interface PopulatedField {
  handle: string
  value: string | number | boolean
  type: string
}

/**
 * An empty field that may be derivable.
 */
export interface EmptyField {
  handle: string
  type: string
  display?: string
}

/**
 * A single suggestion returned from the auto-fill API.
 */
interface AutoFillSuggestion {
  handle: string
  suggestedValue: string
}

export interface AutoFillSuggestionProps {
  populatedFields: PopulatedField[]
  emptyFields: EmptyField[]
  onAccept: (handle: string, value: string) => void
}

/**
 * Auto-fill suggestion component — a button/popover that triggers AI-powered
 * field suggestions for empty fields in an entry edit form.
 *
 * Calls `POST /api/ai/auto-fill` with populated and empty fields, then presents
 * suggestions as pre-filled placeholders that the user can accept, modify, or dismiss.
 *
 * Satisfies Requirements 9.1, 9.2, 9.4.
 */
export function AutoFillSuggestion({
  populatedFields,
  emptyFields,
  onAccept,
}: AutoFillSuggestionProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<AutoFillSuggestion[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [fetched, setFetched] = useState(false)

  async function fetchSuggestions() {
    setLoading(true)
    setError(null)
    setSuggestions([])
    setDismissed(new Set())
    setFetched(false)

    try {
      const response = await fetch('/api/ai/auto-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ populatedFields, emptyFields }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setError(body.error ?? `Request failed (${response.status})`)
        return
      }

      const data = await response.json()
      setSuggestions(data.suggestions ?? [])
      setFetched(true)
    } catch {
      setError('Failed to connect to AI service')
    } finally {
      setLoading(false)
    }
  }

  function handleAccept(suggestion: AutoFillSuggestion) {
    onAccept(suggestion.handle, suggestion.suggestedValue)
    setDismissed((prev) => new Set(prev).add(suggestion.handle))
  }

  function handleDismiss(handle: string) {
    setDismissed((prev) => new Set(prev).add(handle))
  }

  const visibleSuggestions = suggestions.filter((s) => !dismissed.has(s.handle))
  const noDerivable = fetched && suggestions.length === 0
  const allDismissed = fetched && suggestions.length > 0 && visibleSuggestions.length === 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            disabled={emptyFields.length === 0}
            className="gap-1.5 text-muted-foreground"
          />
        }
      >
        <Sparkles className="size-3.5" />
        Auto-fill
      </PopoverTrigger>

      <PopoverContent side="bottom" align="start" className="w-80">
        <PopoverHeader>
          <PopoverTitle>AI Auto-fill Suggestions</PopoverTitle>
          <PopoverDescription>
            Suggest values for empty fields based on existing content.
          </PopoverDescription>
        </PopoverHeader>

        {/* Initial state — prompt to generate */}
        {!loading && !fetched && !error && (
          <Button
            variant="default"
            size="sm"
            className="w-full"
            onClick={fetchSuggestions}
          >
            <Sparkles className="size-3.5" data-icon="inline-start" />
            Generate suggestions
          </Button>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Generating suggestions…
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={fetchSuggestions}
            >
              Retry
            </Button>
          </div>
        )}

        {/* No derivable fields */}
        {noDerivable && (
          <p className="py-2 text-center text-sm text-muted-foreground">
            No derivable fields — there's nothing the AI can suggest from the current data.
          </p>
        )}

        {/* All suggestions dismissed */}
        {allDismissed && (
          <p className="py-2 text-center text-sm text-muted-foreground">
            All suggestions handled.
          </p>
        )}

        {/* Suggestions list */}
        {visibleSuggestions.length > 0 && (
          <ul className="space-y-2">
            {visibleSuggestions.map((suggestion) => {
              const fieldMeta = emptyFields.find(
                (f) => f.handle === suggestion.handle,
              )
              const label = fieldMeta?.display ?? suggestion.handle

              return (
                <li
                  key={suggestion.handle}
                  className="rounded-md border border-border bg-muted/30 p-2.5"
                >
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <Badge variant="secondary" className="text-xs">
                      {label}
                    </Badge>
                  </div>
                  <p className="mb-2 text-sm text-foreground wrap-break-word">
                    {suggestion.suggestedValue}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="default"
                      size="xs"
                      onClick={() => handleAccept(suggestion)}
                      className="cursor-pointer"
                    >
                      <Check className="size-3" data-icon="inline-start" />
                      Accept
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleDismiss(suggestion.handle)}
                      className="cursor-pointer text-muted-foreground"
                    >
                      <X className="size-3" data-icon="inline-start" />
                      Dismiss
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
