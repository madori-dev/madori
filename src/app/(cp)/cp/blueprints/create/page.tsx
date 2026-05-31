'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

import type { BlueprintType } from '@/lib/blueprints/types'

const TYPE_OPTIONS: { value: BlueprintType; label: string; description: string }[] = [
  { value: 'collections', label: 'Collection', description: 'Fields for collection entries (blog posts, products, etc.)' },
  { value: 'taxonomies', label: 'Taxonomy', description: 'Fields for taxonomy terms' },
  { value: 'globals', label: 'Global', description: 'Fields for global configuration sets' },
  { value: 'forms', label: 'Form', description: 'Fields for form submissions' },
]

export default function CreateBlueprintPage() {
  const router = useRouter()
  const [handle, setHandle] = useState('')
  const [type, setType] = useState<BlueprintType>('collections')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!handle.trim()) {
      setError('Handle is required')
      return
    }

    const sanitized = handle.toLowerCase().replace(/[^a-z0-9_-]/g, '_')
    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/blueprints/${type}/${sanitized}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: sanitized,
          tabs: { main: { fields: [] } },
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error?.message ?? 'Failed to create blueprint')
      }

      router.push(`/cp/blueprints/${type}/${sanitized}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creation failed')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" nativeButton={false} render={<Link href="/cp/blueprints" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">New Blueprint</h1>
          <p className="text-sm text-muted-foreground">
            Create a new field schema definition.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="handle">Handle</Label>
            <Input
              id="handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="e.g. blog, product, article"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              A unique identifier. Lowercase letters, numbers, hyphens, and underscores.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer flex-col rounded-lg border p-3 transition-colors ${
                    type === opt.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    value={opt.value}
                    checked={type === opt.value}
                    onChange={() => setType(opt.value)}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-xs text-muted-foreground">{opt.description}</span>
                </label>
              ))}
            </div>
          </div>

          <Separator />

          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" nativeButton={false} render={<Link href="/cp/blueprints" />}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Creating...' : 'Create Blueprint'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
