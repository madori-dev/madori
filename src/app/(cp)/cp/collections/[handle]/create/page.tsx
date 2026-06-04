'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FieldRenderer } from '@/components/cp/fields/FieldRenderer'
import { ListSkeleton } from '@/components/cp/ListSkeleton'
import { getDefaultsFromBlueprint, getAllFields } from '@/lib/blueprints/defaults'
import { useFieldValidation } from '@/hooks/use-field-validation'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import type { Blueprint, FieldDefinition } from '@/lib/blueprints/types'

export default function CreateEntryPage() {
  const params = useParams()
  const router = useRouter()
  const handle = params.handle as string

  const [allFields, setAllFields] = useState<FieldDefinition[]>([])
  const [formData, setFormData] = useState<Record<string, unknown>>({
    title: '',
    slug: '',
    status: 'draft',
    content: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const { validate, clearFieldError } = useFieldValidation(allFields)
  const { isDirty } = useUnsavedChanges(formData, { enabled: !saving })

  useEffect(() => {
    async function loadBlueprint() {
      try {
        const res = await fetch(`/api/blueprints/collections/${handle}`)
        if (res.ok) {
          const json = await res.json()
          const bp = json.data as Blueprint | undefined

          // Extract all fields for validation
          const fields = bp ? getAllFields(bp) : []
          setAllFields(fields)

          // Pre-populate defaults from blueprint field definitions
          const blueprintDefaults = bp ? getDefaultsFromBlueprint(bp) : {}
          setFormData({
            title: '',
            slug: '',
            status: 'draft',
            content: '',
            ...blueprintDefaults,
          })
        }
      } catch {
        // Blueprint loading is optional — form still works with core fields
      } finally {
        setLoading(false)
      }
    }
    loadBlueprint()
  }, [handle])

  function handleFieldChange(fieldHandle: string, value: unknown) {
    setFormData((prev) => {
      const next = { ...prev, [fieldHandle]: value }
      // Auto-generate slug from title if slug is empty
      if (fieldHandle === 'title' && !prev.slug) {
        next.slug = String(value)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
      }
      return next
    })
    setFieldErrors((prev) => {
      const next = { ...prev }
      delete next[fieldHandle]
      return next
    })
    clearFieldError(fieldHandle)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFieldErrors({})
    setError(null)

    // Client-side validation for blueprint fields (<100ms via Zod)
    if (allFields.length > 0) {
      const result = validate(formData)
      if (!result.valid) {
        setFieldErrors(result.errors)
        return
      }
    }

    setSaving(true)

    try {
      const { title, slug, status, content, ...data } = formData

      // If content is a tiptap JSON object, store JSON in data and serialize markdown for content
      let contentStr = content as string
      if (typeof content === 'object' && content !== null) {
        data.content_json = content
        const { serializeTipTapToMarkdown } = await import('@/lib/editor/serializer')
        contentStr = serializeTipTapToMarkdown(content as import('@/lib/editor/types').TipTapDocument)
      }

      const res = await fetch(`/api/entries/${handle}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          slug,
          status,
          content: contentStr,
          data,
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        if (json.error?.details?.fieldErrors) {
          setFieldErrors(json.error.details.fieldErrors)
        } else {
          setError(json.error?.message ?? 'Failed to create entry')
        }
        return
      }

      const json = await res.json()
      toast.success('Entry created')
      router.push(`/cp/collections/${handle}/${json.data.slug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create entry')
      toast.error('Failed to create entry')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <ListSkeleton rows={4} />
  }

  return (
    <div>
      <nav className="text-sm text-muted-foreground">
        <Link href="/cp/collections" className="hover:text-foreground">
          Collections
        </Link>
        <span className="mx-1">/</span>
        <Link href={`/cp/collections/${handle}`} className="hover:text-foreground capitalize">
          {handle}
        </Link>
        <span className="mx-1">/</span>
        <span className="text-foreground">New Entry</span>
      </nav>
      <h1 className="mt-2 text-2xl font-bold text-foreground">Create Entry</h1>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <form onSubmit={handleCreate} className="mt-6 space-y-5">
        {/* Core fields: title, slug, status */}
        <div>
          <label htmlFor="field-title" className="block text-sm font-medium text-foreground">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            id="field-title"
            type="text"
            value={(formData.title as string) ?? ''}
            onChange={(e) => handleFieldChange('title', e.target.value)}
            className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            required
          />
          {fieldErrors.title && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.title.join(', ')}</p>
          )}
        </div>

        <div>
          <label htmlFor="field-slug" className="block text-sm font-medium text-foreground">
            Slug <span className="text-red-500">*</span>
          </label>
          <input
            id="field-slug"
            type="text"
            value={(formData.slug as string) ?? ''}
            onChange={(e) => handleFieldChange('slug', e.target.value)}
            className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            required
          />
          {fieldErrors.slug && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.slug.join(', ')}</p>
          )}
        </div>

        <div>
          <label htmlFor="field-status" className="block text-sm font-medium text-foreground">
            Status
          </label>
          <select
            id="field-status"
            value={(formData.status as string) ?? 'draft'}
            onChange={(e) => handleFieldChange('status', e.target.value)}
            className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>

        {/* Dynamic fields from blueprint */}
        {allFields
          .filter((f) => !['title', 'slug', 'status'].includes(f.handle))
          .map((fieldDef) => (
            <FieldRenderer
              key={fieldDef.handle}
              fieldDefinition={fieldDef}
              value={formData[fieldDef.handle]}
              onChange={(value) => handleFieldChange(fieldDef.handle, value)}
              error={fieldErrors[fieldDef.handle]}
            />
          ))}

        {/* Content field (if no blueprint or blueprint has no content field) */}
        {!allFields.some((f) => f.handle === 'content') && (
          <div>
            <label htmlFor="field-content" className="block text-sm font-medium text-foreground">
              Content
            </label>
            <textarea
              id="field-content"
              value={(formData.content as string) ?? ''}
              onChange={(e) => handleFieldChange('content', e.target.value)}
              rows={12}
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm font-mono shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-border pt-5">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Creating…' : 'Create Entry'}
          </button>
          <Link
            href={`/cp/collections/${handle}`}
            className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancel
          </Link>
          {isDirty && (
            <span className="text-xs text-amber-600">Unsaved changes</span>
          )}
        </div>
      </form>
    </div>
  )
}
