'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
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
import { ListSkeleton } from '@/components/cp/ListSkeleton'

export default function EditTermPage() {
  const params = useParams()
  const router = useRouter()
  const handle = params.handle as string
  const termSlug = params.termSlug as string

  const [fields, setFields] = useState<{ key: string; value: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchTerm() {
      try {
        const res = await fetch(`/api/content/taxonomies/${handle}/${termSlug}`)
        if (!res.ok) throw new Error(`Failed to fetch term: ${res.status}`)
        const json = await res.json()
        const data = json.data ?? {}

        const entries: { key: string; value: string }[] = []
        for (const [key, val] of Object.entries(data)) {
          if (key === 'id') continue
          entries.push({
            key,
            value: typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val ?? ''),
          })
        }
        setFields(entries)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load term')
      } finally {
        setLoading(false)
      }
    }
    fetchTerm()
  }, [handle, termSlug])

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
      const data: Record<string, unknown> = {}
      for (const field of fields) {
        if (field.key.trim()) {
          try {
            data[field.key.trim()] = JSON.parse(field.value)
          } catch {
            data[field.key.trim()] = field.value
          }
        }
      }

      const res = await fetch(`/api/content/taxonomies/${handle}/${termSlug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error || `Failed to update term: ${res.status}`)
      }

      toast.success('Term updated')
      setTimeout(() => {
        router.push(`/cp/taxonomies/${handle}`)
      }, 800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update term')
      toast.error('Failed to update term')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <ListSkeleton rows={3} />

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
            <BreadcrumbPage>{termSlug}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit Term</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Editing term &ldquo;{termSlug}&rdquo; in the {handle} taxonomy.
        </p>
      </div>

      {error && <ErrorAlert message={error} />}

      <Card className="max-w-lg">
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Fields</Label>
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
                  No fields. Click &quot;Add field&quot; to add data.
                </p>
              ) : (
                <div className="space-y-2">
                  {fields.map((field, index) => {
                    const isMultiline = field.value.includes('\n') || field.value.length > 80
                    return (
                      <div key={index} className="flex items-start gap-2">
                        <Input
                          type="text"
                          value={field.key}
                          onChange={(e) => updateField(index, 'key', e.target.value)}
                          placeholder="key"
                          className="w-1/3"
                        />
                        {isMultiline ? (
                          <textarea
                            value={field.value}
                            onChange={(e) => updateField(index, 'value', e.target.value)}
                            placeholder="value"
                            rows={3}
                            className="flex-1 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                          />
                        ) : (
                          <Input
                            type="text"
                            value={field.value}
                            onChange={(e) => updateField(index, 'value', e.target.value)}
                            placeholder="value"
                            className="flex-1"
                          />
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="mt-0.5 text-muted-foreground hover:text-destructive"
                          onClick={() => removeField(index)}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link href={`/cp/taxonomies/${handle}`} />}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
