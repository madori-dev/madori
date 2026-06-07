'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Loader2, Sparkles, Tags } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'

interface TaxonomyTerm {
  handle: string
  title: string
}

interface TaxonomySuggestionItem {
  term: TaxonomyTerm
  score: number
}

export interface TaxonomySuggestionProps {
  content: string
  existingTerms: TaxonomyTerm[]
  selectedTerms: string[]
  onSelectTerm: (handle: string) => void
}

/**
 * Taxonomy suggestion component for the entry edit form.
 *
 * Shows a "Suggest terms" button in the taxonomy selection area of an entry.
 * Calls POST /api/ai/taxonomy with { content, existingTerms } and displays
 * suggestions as selectable checkboxes/chips the user can accept individually
 * (Req 10.3). Shows relevance score next to each term. On entry save, offers
 * suggestions if no terms assigned (Req 10.4).
 *
 * Satisfies Requirements 10.1, 10.2, 10.3, 10.4.
 */
export function TaxonomySuggestion({
  content,
  existingTerms,
  selectedTerms,
  onSelectTerm,
}: TaxonomySuggestionProps) {
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<TaxonomySuggestionItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [fetched, setFetched] = useState(false)
  const [showSavePrompt, setShowSavePrompt] = useState(false)
  const prevSelectedRef = useRef(selectedTerms)

  const hasContent = content.trim().length > 0
  const hasTerms = existingTerms.length > 0

  // Track whether terms were just deselected to avoid stale save prompts
  useEffect(() => {
    prevSelectedRef.current = selectedTerms
  }, [selectedTerms])

  /**
   * Req 10.4: On entry save, offer suggestions if no terms assigned.
   * This is exposed via the showSavePrompt state. The parent form can call
   * triggerSavePrompt() before save to check.
   */
  const triggerSavePrompt = useCallback(() => {
    if (selectedTerms.length === 0 && hasContent && hasTerms && !fetched) {
      setShowSavePrompt(true)
    }
  }, [selectedTerms.length, hasContent, hasTerms, fetched])

  // Expose triggerSavePrompt so parent forms can call it
  useEffect(() => {
    // Expose on the window for simple integration; a ref-based approach
    // would be preferable in a full integration
    ;(window as unknown as Record<string, unknown>).__taxonomySuggestionTriggerSavePrompt = triggerSavePrompt
    return () => {
      delete (window as unknown as Record<string, unknown>).__taxonomySuggestionTriggerSavePrompt
    }
  }, [triggerSavePrompt])

  const fetchSuggestions = useCallback(async () => {
    if (!hasContent || !hasTerms) return

    setLoading(true)
    setError(null)
    setSuggestions([])
    setFetched(false)
    setShowSavePrompt(false)

    try {
      const res = await fetch('/api/ai/taxonomy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, existingTerms }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? `Failed to suggest terms (${res.status})`)
        return
      }

      const data = await res.json()
      setSuggestions(data.suggestions ?? [])
      setFetched(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [content, existingTerms, hasContent, hasTerms])

  const handleToggleTerm = useCallback(
    (handle: string) => {
      onSelectTerm(handle)
    },
    [onSelectTerm],
  )

  const handleDismissSavePrompt = useCallback(() => {
    setShowSavePrompt(false)
  }, [])

  // Filter out terms already selected — only show new suggestions
  const visibleSuggestions = suggestions.filter(
    (s) => !selectedTerms.includes(s.term.handle),
  )

  const noResults = fetched && suggestions.length === 0
  const allAlreadySelected =
    fetched && suggestions.length > 0 && visibleSuggestions.length === 0

  // Don't render if no content or no existing terms to suggest from
  if (!hasContent || !hasTerms) {
    return null
  }

  return (
    <div className="space-y-3">
      {/* Req 10.4: Save prompt when no terms assigned */}
      {showSavePrompt && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 p-3">
          <Tags className="size-4 shrink-0 text-muted-foreground" />
          <p className="flex-1 text-sm text-muted-foreground">
            No taxonomy terms assigned. Want AI to suggest relevant terms?
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchSuggestions}
              disabled={loading}
              className="cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" />
                  Suggesting…
                </>
              ) : (
                'Suggest terms'
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismissSavePrompt}
              className="cursor-pointer text-muted-foreground"
            >
              Skip
            </Button>
          </div>
        </div>
      )}

      {/* Suggest terms button */}
      {!showSavePrompt && !fetched && (
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchSuggestions}
          disabled={loading}
          className="cursor-pointer gap-1.5 text-muted-foreground"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          Suggest terms
        </Button>
      )}

      {/* Loading state */}
      {loading && !showSavePrompt && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Analyzing content for relevant terms…
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="space-y-2">
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2.5 text-sm text-destructive">
            {error}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchSuggestions}
            className="cursor-pointer"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Empty results */}
      {noResults && (
        <p className="text-sm text-muted-foreground">
          No relevant terms found for this content.
        </p>
      )}

      {/* All suggestions already selected */}
      {allAlreadySelected && (
        <p className="text-sm text-muted-foreground">
          All suggested terms are already assigned.
        </p>
      )}

      {/* Suggestions list (Req 10.3) */}
      {visibleSuggestions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="size-2.5" />
              Suggested Terms
            </Badge>
            <span className="text-xs text-muted-foreground">
              {visibleSuggestions.length} suggestion{visibleSuggestions.length !== 1 ? 's' : ''}
            </span>
          </div>

          <ul className="space-y-1">
            {visibleSuggestions.map((suggestion) => {
              const isSelected = selectedTerms.includes(suggestion.term.handle)
              const scorePercent = Math.round(suggestion.score * 100)

              return (
                <li
                  key={suggestion.term.handle}
                  className="flex items-center gap-2.5 rounded-md border border-border bg-card px-3 py-2 transition-colors hover:bg-muted/50"
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => handleToggleTerm(suggestion.term.handle)}
                    aria-label={`Select term: ${suggestion.term.title}`}
                    className="cursor-pointer"
                  />
                  <span className="flex-1 text-sm text-foreground">
                    {suggestion.term.title}
                  </span>
                  <Badge
                    variant="outline"
                    className="shrink-0 tabular-nums text-xs text-muted-foreground"
                  >
                    {scorePercent}%
                  </Badge>
                </li>
              )
            })}
          </ul>

          {/* Regenerate button after results shown */}
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchSuggestions}
            disabled={loading}
            className="cursor-pointer gap-1.5 text-muted-foreground"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            Regenerate
          </Button>
        </div>
      )}
    </div>
  )
}
