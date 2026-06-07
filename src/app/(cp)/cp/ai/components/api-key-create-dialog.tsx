'use client'

import { useState, useCallback } from 'react'
import { Copy, Check, Plus, AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { McpPermission } from '@/lib/mcp/auth'
import { PermissionPicker } from './permission-picker'

interface ApiKeyCreateDialogProps {
  onCreated?: () => void
}

export function ApiKeyCreateDialog({ onCreated }: ApiKeyCreateDialogProps) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [permissions, setPermissions] = useState<McpPermission[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const reset = useCallback(() => {
    setLabel('')
    setPermissions([])
    setLoading(false)
    setError(null)
    setCreatedKey(null)
    setCopied(false)
  }, [])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen)
      if (!nextOpen) {
        reset()
        if (createdKey) {
          onCreated?.()
        }
      }
    },
    [reset, createdKey, onCreated]
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError(null)

      if (!label.trim()) {
        setError('Label is required')
        return
      }

      if (permissions.length === 0) {
        setError('Select at least one permission')
        return
      }

      setLoading(true)

      try {
        const res = await fetch('/api/ai/api-keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: label.trim(), permissions }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => null)
          setError(data?.error ?? `Failed to create key (${res.status})`)
          return
        }

        const data = await res.json()
        setCreatedKey(data.key)
      } catch {
        setError('Network error. Please try again.')
      } finally {
        setLoading(false)
      }
    },
    [label, permissions]
  )

  const handleCopy = useCallback(async () => {
    if (!createdKey) return
    try {
      await navigator.clipboard.writeText(createdKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for insecure contexts
      const textarea = document.createElement('textarea')
      textarea.value = createdKey
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [createdKey])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" data-icon="inline-start" />
        Create API Key
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        {createdKey ? (
          <>
            <DialogHeader>
              <DialogTitle>API Key Created</DialogTitle>
              <DialogDescription>
                Copy your API key now. It will not be shown again.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
                <code className="flex-1 break-all text-xs font-mono">
                  {createdKey}
                </code>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleCopy}
                  aria-label="Copy API key"
                >
                  {copied ? (
                    <Check className="size-3.5 text-green-600" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
              </div>

              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  This key will not be displayed again. Store it in a secure location.
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Create API Key</DialogTitle>
              <DialogDescription>
                Create a new API key for MCP access. Assign a label and select permissions.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="api-key-label">Label</Label>
                <Input
                  id="api-key-label"
                  placeholder="e.g. Claude Code Agent"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label>Permissions</Label>
                <div className="max-h-64 overflow-y-auto rounded-md border p-3">
                  <PermissionPicker value={permissions} onChange={setPermissions} />
                </div>
              </div>

              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating…' : 'Create Key'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
