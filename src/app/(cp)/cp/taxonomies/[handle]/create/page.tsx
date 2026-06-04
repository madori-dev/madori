'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { ErrorAlert } from '@/components/cp/ErrorAlert'

export default function CreateTermPage() {
  const params = useParams()
  const router = useRouter()
  const handle = params.handle as string

  const [slug, setSlug] = useState('')
  const [title, setTitle] = useState('')
  const [fields, setFields] = useState<{ key: string; value: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addField() {
    setFields([...fields, { key: '', value: '' }])
  }

  function updateField(index: number, prop: 'key' | 'value', value: string) {
    setFields(fields.map((f, i) => (i === index ? { ...f, [prop]: value } : f)))
  }

  function removeField(index: number) {
    setFields(fields.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const data: Record<string, unknown> = { slug, title }
      for (const field of fields) {
        if (field.key.trim()) {
          try {
            data[field.key.trim()] = JSON.parse(field.value)
          } catch {
            data[field.key.trim()] = field.value
          }
        }
      }

      const res = await fetch(`/api/content/taxonomies/${handle}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => null)
        const msg = json?.details
          ? Object.entries(json.details).map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`).join('; ')
          : json?.error || `Failed to create term: ${res.status}`
        throw new Error(msg)
      }

      router.push(`/cp/taxonomies/${handle}`)
      toast.success('Term created')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create term')
      toast.error('Failed to create term')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/cp/taxonomies" />}>
              Taxonomies
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={`/cp/taxonomies/${handle}`} />} className="capitalize">
              {handle}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Create</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add Term</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a new term in the {handle} taxonomy.
        </p>
      </div>

      {error && <ErrorAlert message={error} />}

      <Card className="max-w-lg">
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="my-term"
              />
              <p className="text-xs text-muted-foreground">
                URL-friendly identifier for this term.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="My Term"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Additional Fields</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addField}
                >
                  <Plus className="size-3.5" />
                  Add field
                </Button>
              </div>

              {fields.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No additional fields. Click &quot;Add field&quot; to add key-value data.
                </p>
              ) : (
                <div className="space-y-2">
                  {fields.map((field, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        type="text"
                        value={field.key}
                        onChange={(e) => updateField(index, 'key', e.target.value)}
                        placeholder="key"
                        className="w-1/3"
                      />
                      <Input
                        type="text"
                        value={field.value}
                        onChange={(e) => updateField(index, 'value', e.target.value)}
                        placeholder="value"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeField(index)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={saving || !slug.trim()}>
                {saving ? 'Creating…' : 'Create Term'}
              </Button>
              <Button variant="ghost" nativeButton={false} render={<Link href={`/cp/taxonomies/${handle}`} />}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
