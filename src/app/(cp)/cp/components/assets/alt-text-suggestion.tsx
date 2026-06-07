'use client'

import { useState, useCallback } from 'react'
import { ImageIcon, Loader2, Sparkles, AlertTriangle, Check, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

interface AltTextSuggestionProps {
  imagePath: string
  currentAlt?: string
  onAccept: (altText: string) => void
}

type SuggestionState = 'idle' | 'loading' | 'suggestion' | 'error'

/**
 * Alt text suggestion component for the asset manager.
 *
 * Offers to generate alt text for an image via the AI vision API.
 * Shows the result as an editable suggestion that can be accepted or dismissed.
 *
 * Satisfies Requirements 7.1, 7.2, 7.3, 7.4.
 */
export function AltTextSuggestion({ imagePath, currentAlt, onAccept }: AltTextSuggestionProps) {
  const [state, setState] = useState<SuggestionState>('idle')
  const [suggestion, setSuggestion] = useState('')
  const [editedText, setEditedText] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const handleGenerate = useCallback(async () => {
    setState('loading')
    setErrorMessage('')

    try {
      const res = await fetch('/api/ai/alt-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePath }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const error = data?.error ?? `Request failed (${res.status})`

        // Vision unavailable error (Req 7.4)
        if (res.status === 422 || error.toLowerCase().includes('vision')) {
          setErrorMessage('Vision is not available with the current provider configuration.')
          setState('error')
          return
        }

        setErrorMessage(error)
        setState('error')
        return
      }

      const data = await res.json()
      const altText = data.altText ?? ''
      setSuggestion(altText)
      setEditedText(altText)
      setState('suggestion')
    } catch {
      setErrorMessage('Failed to connect to the AI service.')
      setState('error')
    }
  }, [imagePath])

  const handleAccept = useCallback(() => {
    onAccept(editedText)
    setState('idle')
    setSuggestion('')
    setEditedText('')
  }, [editedText, onAccept])

  const handleDismiss = useCallback(() => {
    setState('idle')
    setSuggestion('')
    setEditedText('')
    setErrorMessage('')
  }, [])

  // Idle state: show generate button
  if (state === 'idle') {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          className="cursor-pointer gap-1.5"
        >
          <Sparkles className="size-3.5" />
          Generate Alt Text
        </Button>
        {currentAlt && (
          <Badge variant="secondary" className="text-xs">
            <ImageIcon className="size-3 mr-1" />
            Has alt text
          </Badge>
        )}
      </div>
    )
  }

  // Loading state
  if (state === 'loading') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Generating alt text…</span>
      </div>
    )
  }

  // Error state (Req 7.4)
  if (state === 'error') {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-destructive" />
          <span className="text-sm text-destructive">{errorMessage}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={handleDismiss}
          className="cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    )
  }

  // Suggestion state: editable text with accept/dismiss (Req 7.3)
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" />
          <span className="text-xs font-medium text-muted-foreground">AI Suggestion</span>
        </div>
        <Badge variant="outline" className="text-xs">
          Editable
        </Badge>
      </div>

      <Textarea
        value={editedText}
        onChange={(e) => setEditedText(e.target.value)}
        rows={2}
        className="min-h-12 text-sm"
        placeholder="Alt text suggestion..."
      />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={handleAccept}
          disabled={!editedText.trim()}
          className="cursor-pointer gap-1.5"
        >
          <Check className="size-3.5" />
          Accept
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="cursor-pointer gap-1.5 text-muted-foreground"
        >
          <X className="size-3.5" />
          Dismiss
        </Button>
      </div>
    </div>
  )
}
