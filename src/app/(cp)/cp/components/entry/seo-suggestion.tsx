'use client'

import { useState, useCallback } from 'react'
import { Loader2, Sparkles, Check, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

interface SeoSuggestionProps {
  content: string
  metaTitle?: string
  metaDescription?: string
  onAcceptTitle: (title: string) => void
  onAcceptDescription: (desc: string) => void
}

interface SuggestionState {
  value: string
  editing: boolean
  editValue: string
}

/**
 * SEO suggestion component for the entry edit form.
 *
 * Provides "Generate" buttons next to empty SEO fields. When SEO fields are
 * empty, shows an auto-suggest prompt offering to generate values (Req 6.4).
 * Generated values are displayed as suggestions the user can accept, edit, or
 * reject (Req 6.3).
 *
 * Calls POST /api/ai/seo/title and /api/ai/seo/description with entry content.
 */
export function SeoSuggestion({
  content,
  metaTitle,
  metaDescription,
  onAcceptTitle,
  onAcceptDescription,
}: SeoSuggestionProps) {
  const [loadingTitle, setLoadingTitle] = useState(false)
  const [loadingDescription, setLoadingDescription] = useState(false)
  const [titleSuggestion, setTitleSuggestion] = useState<SuggestionState | null>(null)
  const [descriptionSuggestion, setDescriptionSuggestion] = useState<SuggestionState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hasContent = content.trim().length > 0
  const showTitlePrompt = !metaTitle && !titleSuggestion
  const showDescriptionPrompt = !metaDescription && !descriptionSuggestion

  const generateTitle = useCallback(async () => {
    if (!hasContent) return

    setLoadingTitle(true)
    setError(null)

    try {
      const res = await fetch('/api/ai/seo/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? `Failed to generate title (${res.status})`)
        return
      }

      const data = await res.json()
      setTitleSuggestion({ value: data.text, editing: false, editValue: data.text })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoadingTitle(false)
    }
  }, [content, hasContent])

  const generateDescription = useCallback(async () => {
    if (!hasContent) return

    setLoadingDescription(true)
    setError(null)

    try {
      const res = await fetch('/api/ai/seo/description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? `Failed to generate description (${res.status})`)
        return
      }

      const data = await res.json()
      setDescriptionSuggestion({ value: data.text, editing: false, editValue: data.text })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoadingDescription(false)
    }
  }, [content, hasContent])

  const handleAcceptTitle = useCallback(() => {
    if (!titleSuggestion) return
    const value = titleSuggestion.editing ? titleSuggestion.editValue : titleSuggestion.value
    onAcceptTitle(value)
    setTitleSuggestion(null)
  }, [titleSuggestion, onAcceptTitle])

  const handleDismissTitle = useCallback(() => {
    setTitleSuggestion(null)
  }, [])

  const handleAcceptDescription = useCallback(() => {
    if (!descriptionSuggestion) return
    const value = descriptionSuggestion.editing
      ? descriptionSuggestion.editValue
      : descriptionSuggestion.value
    onAcceptDescription(value)
    setDescriptionSuggestion(null)
  }, [descriptionSuggestion, onAcceptDescription])

  const handleDismissDescription = useCallback(() => {
    setDescriptionSuggestion(null)
  }, [])

  // Don't render anything if both fields are already filled and no active suggestions
  if (metaTitle && metaDescription && !titleSuggestion && !descriptionSuggestion) {
    return null
  }

  return (
    <div className="space-y-3">
      {/* Auto-suggest prompt when both SEO fields are empty (Req 6.4) */}
      {showTitlePrompt && showDescriptionPrompt && hasContent && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 p-3">
          <Sparkles className="size-4 shrink-0 text-muted-foreground" />
          <p className="flex-1 text-sm text-muted-foreground">
            SEO fields are empty. Generate meta title and description from your content?
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              generateTitle()
              generateDescription()
            }}
            disabled={loadingTitle || loadingDescription}
          >
            {loadingTitle || loadingDescription ? (
              <>
                <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" />
                Generating…
              </>
            ) : (
              'Generate Both'
            )}
          </Button>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2.5 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Meta title section */}
      {showTitlePrompt && !showDescriptionPrompt && hasContent && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Meta title is empty.</span>
          <Button
            variant="ghost"
            size="xs"
            onClick={generateTitle}
            disabled={loadingTitle}
          >
            {loadingTitle ? (
              <Loader2 className="size-3 animate-spin" data-icon="inline-start" />
            ) : (
              <Sparkles className="size-3" data-icon="inline-start" />
            )}
            Generate
          </Button>
        </div>
      )}

      {/* Title suggestion display (Req 6.3) */}
      {titleSuggestion && (
        <div className="rounded-md border border-border bg-card p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="size-2.5" />
              Meta Title
            </Badge>
            <span className="text-xs text-muted-foreground">
              {titleSuggestion.editValue.length}/60 chars
            </span>
          </div>

          {titleSuggestion.editing ? (
            <Input
              value={titleSuggestion.editValue}
              onChange={(e) =>
                setTitleSuggestion((prev) =>
                  prev ? { ...prev, editValue: e.target.value } : null
                )
              }
              maxLength={60}
              className="text-sm"
            />
          ) : (
            <p
              className="text-sm text-foreground cursor-pointer rounded px-2 py-1 hover:bg-muted/50"
              onClick={() =>
                setTitleSuggestion((prev) => (prev ? { ...prev, editing: true } : null))
              }
              title="Click to edit"
            >
              {titleSuggestion.value}
            </p>
          )}

          <div className="flex items-center gap-1.5">
            <Button variant="default" size="xs" onClick={handleAcceptTitle}>
              <Check className="size-3" data-icon="inline-start" />
              Accept
            </Button>
            {!titleSuggestion.editing && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() =>
                  setTitleSuggestion((prev) => (prev ? { ...prev, editing: true } : null))
                }
              >
                Edit
              </Button>
            )}
            <Button variant="ghost" size="xs" onClick={handleDismissTitle}>
              <X className="size-3" data-icon="inline-start" />
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Meta description section */}
      {showDescriptionPrompt && !showTitlePrompt && hasContent && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Meta description is empty.</span>
          <Button
            variant="ghost"
            size="xs"
            onClick={generateDescription}
            disabled={loadingDescription}
          >
            {loadingDescription ? (
              <Loader2 className="size-3 animate-spin" data-icon="inline-start" />
            ) : (
              <Sparkles className="size-3" data-icon="inline-start" />
            )}
            Generate
          </Button>
        </div>
      )}

      {/* Description suggestion display (Req 6.3) */}
      {descriptionSuggestion && (
        <div className="rounded-md border border-border bg-card p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="size-2.5" />
              Meta Description
            </Badge>
            <span className="text-xs text-muted-foreground">
              {descriptionSuggestion.editValue.length}/160 chars
            </span>
          </div>

          {descriptionSuggestion.editing ? (
            <Input
              value={descriptionSuggestion.editValue}
              onChange={(e) =>
                setDescriptionSuggestion((prev) =>
                  prev ? { ...prev, editValue: e.target.value } : null
                )
              }
              maxLength={160}
              className="text-sm"
            />
          ) : (
            <p
              className="text-sm text-foreground cursor-pointer rounded px-2 py-1 hover:bg-muted/50"
              onClick={() =>
                setDescriptionSuggestion((prev) => (prev ? { ...prev, editing: true } : null))
              }
              title="Click to edit"
            >
              {descriptionSuggestion.value}
            </p>
          )}

          <div className="flex items-center gap-1.5">
            <Button variant="default" size="xs" onClick={handleAcceptDescription}>
              <Check className="size-3" data-icon="inline-start" />
              Accept
            </Button>
            {!descriptionSuggestion.editing && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() =>
                  setDescriptionSuggestion((prev) => (prev ? { ...prev, editing: true } : null))
                }
              >
                Edit
              </Button>
            )}
            <Button variant="ghost" size="xs" onClick={handleDismissDescription}>
              <X className="size-3" data-icon="inline-start" />
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Loading states for individual generation */}
      {loadingTitle && !titleSuggestion && !showDescriptionPrompt && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Generating meta title…
        </div>
      )}
      {loadingDescription && !descriptionSuggestion && !showTitlePrompt && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Generating meta description…
        </div>
      )}
    </div>
  )
}
