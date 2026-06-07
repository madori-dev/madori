'use client'

import { useState, useCallback } from 'react'
import { Loader2, CheckCircle2, XCircle, Sparkles, Trash2, Save } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'

interface BlueprintGeneratorProps {
  onAccept: (yaml: string) => void
  onDiscard?: () => void
}

interface GenerationResult {
  yaml: string
  valid: boolean
  errors?: string[]
}

/**
 * Blueprint Generator UI — dialog for generating blueprints from natural
 * language descriptions. Calls POST /api/ai/blueprint with { description },
 * shows YAML preview with validation status, and allows accept/discard.
 *
 * Satisfies Requirements 8.1, 8.3, 8.4.
 */
export function BlueprintGenerator({ onAccept, onDiscard }: BlueprintGeneratorProps) {
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerationResult | null>(null)

  const reset = useCallback(() => {
    setDescription('')
    setLoading(false)
    setError(null)
    setResult(null)
  }, [])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen)
      if (!nextOpen) {
        reset()
      }
    },
    [reset],
  )

  const handleGenerate = useCallback(async () => {
    if (!description.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/ai/blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? `Generation failed (${res.status})`)
        return
      }

      const data = await res.json()
      setResult({
        yaml: data.yaml,
        valid: data.valid,
        errors: data.errors,
      })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [description])

  const handleAccept = useCallback(() => {
    if (!result) return
    onAccept(result.yaml)
    handleOpenChange(false)
  }, [result, onAccept, handleOpenChange])

  const handleDiscard = useCallback(() => {
    onDiscard?.()
    handleOpenChange(false)
  }, [onDiscard, handleOpenChange])

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Sparkles className="size-4" data-icon="inline-start" />
        Generate Blueprint
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate Blueprint</DialogTitle>
            <DialogDescription>
              Describe the content collection you want to create, and AI will
              generate a valid blueprint YAML file.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Description input */}
            <div className="space-y-2">
              <Label htmlFor="blueprint-description">Description</Label>
              <Textarea
                id="blueprint-description"
                placeholder="e.g. A blog post collection with title, featured image, author name, body content, publication date, and SEO fields..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                disabled={loading}
              />
            </div>

            {/* Generate button */}
            {!result && (
              <Button
                onClick={handleGenerate}
                disabled={loading || !description.trim()}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" data-icon="inline-start" />
                    Generate
                  </>
                )}
              </Button>
            )}

            {/* Error display */}
            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Result display */}
            {result && (
              <div className="space-y-3">
                {/* Validation status */}
                <div className="flex items-center gap-2">
                  {result.valid ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="size-3" />
                      Valid Blueprint
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="size-3" />
                      Invalid Blueprint
                    </Badge>
                  )}
                </div>

                {/* Validation errors */}
                {result.errors && result.errors.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
                    <p className="mb-1.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                      Validation errors:
                    </p>
                    <ul className="space-y-1">
                      {result.errors.map((err, i) => (
                        <li key={i} className="text-xs text-amber-700 dark:text-amber-300">
                          • {err}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* YAML code preview (Req 8.3 — review before writing) */}
                <div className="space-y-1.5">
                  <Label>Generated YAML</Label>
                  <div className="max-h-72 overflow-auto rounded-md border bg-muted/50">
                    <pre className="p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap">
                      {result.yaml}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          {result && (
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={handleDiscard}>
                <Trash2 className="size-4" data-icon="inline-start" />
                Discard
              </Button>
              <Button onClick={handleAccept} disabled={!result.valid}>
                <Save className="size-4" data-icon="inline-start" />
                Save Blueprint
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
