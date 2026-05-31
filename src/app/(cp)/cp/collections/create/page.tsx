'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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
import { BlueprintPicker } from '@/components/cp/BlueprintPicker'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function CreateCollectionPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [handle, setHandle] = useState('')
  const [handleManuallyEdited, setHandleManuallyEdited] = useState(false)
  const [blueprint, setBlueprint] = useState('')
  const [createNewBlueprint, setCreateNewBlueprint] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleTitleChange(value: string) {
    setTitle(value)
    if (!handleManuallyEdited) {
      setHandle(slugify(value))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('Title is required')
      return
    }
    if (!handle.trim()) {
      setError('Handle is required')
      return
    }

    const blueprintHandle = createNewBlueprint ? handle : blueprint
    if (!blueprintHandle) {
      setError('Select a blueprint or choose "Create new"')
      return
    }

    setSubmitting(true)

    try {
      // If creating a new blueprint, generate one first
      if (createNewBlueprint) {
        const emptyBlueprint = {
          tabs: {
            main: {
              label: 'Main',
              fields: [
                { handle: 'title', field: { type: 'text', required: true } },
                { handle: 'slug', field: { type: 'slug' } },
                { handle: 'content', field: { type: 'markdown' } },
              ],
            },
          },
        }

        const bpRes = await fetch(`/api/blueprints/collections/${handle}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(emptyBlueprint),
        })

        if (!bpRes.ok) {
          const json = await bpRes.json().catch(() => ({ error: { message: 'Failed to create blueprint' } }))
          setError(json.error?.message || `Failed to create blueprint (${bpRes.status})`)
          return
        }
      }

      // Create the collection definition
      const res = await fetch('/api/definitions/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle,
          title: title.trim(),
          blueprint: blueprintHandle,
        }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: 'Failed to create collection' }))
        setError(json.error?.message || json.error || `Failed to create collection (${res.status})`)
        return
      }

      router.push('/cp/collections')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/cp/collections" />}>
              Collections
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Create</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-bold tracking-tight">Create Collection</h1>

      {error && <ErrorAlert message={error} />}

      <Card className="max-w-lg">
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="e.g. Blog Posts"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="handle">
                Handle <span className="text-destructive">*</span>
              </Label>
              <Input
                id="handle"
                type="text"
                value={handle}
                onChange={(e) => {
                  setHandleManuallyEdited(true)
                  setHandle(e.target.value)
                }}
                placeholder="auto-generated-from-title"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Used as the blueprint filename and URL slug. Auto-generated from title.
              </p>
            </div>

            <BlueprintPicker
              type="collections"
              value={blueprint}
              onChange={setBlueprint}
              onCreateNew={setCreateNewBlueprint}
            />

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create'}
              </Button>
              <Button variant="ghost" nativeButton={false} render={<Link href="/cp/collections" />}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
