'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FieldRenderer } from '@/components/cp/fields/FieldRenderer'
import { ListSkeleton } from '@/components/cp/ListSkeleton'
import { DeleteDialog } from '@/components/cp/DeleteDialog'
import { useFieldValidation } from '@/hooks/use-field-validation'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import type { FieldDefinition as TypedFieldDefinition } from '@/lib/blueprints/types'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

interface FieldDefinition {
  handle: string
  field: {
    type: string
    display?: string
    required?: boolean
    default?: unknown
    options?: Record<string, unknown>
  }
}

interface Blueprint {
  handle: string
  tabs: Record<
    string,
    {
      display?: string
      fields: FieldDefinition[]
    }
  >
}

interface EntryData {
  title: string
  slug: string
  status: 'published' | 'draft'
  author?: string
  content: string
  data: Record<string, unknown>
  collection: string
  createdAt: string
  updatedAt: string
  contentHash?: string
}

export default function EntryEditorPage() {
  const params = useParams()
  const router = useRouter()
  const handle = params.handle as string
  const slug = params.slug as string

  const [entry, setEntry] = useState<EntryData | null>(null)
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null)
  const [allBlueprintFields, setAllBlueprintFields] = useState<TypedFieldDefinition[]>([])
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const { validate, clearFieldError } = useFieldValidation(allBlueprintFields)
  const { isDirty, markSaved } = useUnsavedChanges(formData, { enabled: !saving })

  useEffect(() => {
    async function loadData() {
      try {
        const [entryRes, blueprintRes] = await Promise.all([
          fetch(`/api/entries/${handle}/${slug}`),
          fetch(`/api/blueprints/collections/${handle}`),
        ])

        if (!entryRes.ok) {
          throw new Error(`Failed to load entry: ${entryRes.status}`)
        }

        const entryJson = await entryRes.json()
        const entryData = entryJson.data as EntryData
        setEntry(entryData)

        // Build form data from entry
        // If content_json exists in data, use it for the tiptap editor (structured content)
        const contentValue = entryData.data?.content_json ?? entryData.content ?? ''
        setFormData({
          title: entryData.title,
          slug: entryData.slug,
          status: entryData.status,
          content: contentValue,
          ...entryData.data,
        })

        if (blueprintRes.ok) {
          const blueprintJson = await blueprintRes.json()
          setBlueprint(blueprintJson.data)

          // Extract all fields for client-side validation
          const fields: TypedFieldDefinition[] = []
          if (blueprintJson.data?.tabs) {
            for (const tab of Object.values(blueprintJson.data.tabs) as { fields: FieldDefinition[] }[]) {
              for (const field of tab.fields) {
                fields.push(field as TypedFieldDefinition)
              }
            }
          }
          setAllBlueprintFields(fields)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load entry')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [handle, slug])

  function handleFieldChange(fieldHandle: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [fieldHandle]: value }))
    // Clear field error on change
    setFieldErrors((prev) => {
      const next = { ...prev }
      delete next[fieldHandle]
      return next
    })
    clearFieldError(fieldHandle)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFieldErrors({})
    setError(null)

    // Client-side validation for blueprint fields (<100ms via Zod)
    if (allBlueprintFields.length > 0) {
      const result = validate(formData)
      if (!result.valid) {
        setFieldErrors(result.errors)
        return
      }
    }

    setSaving(true)

    try {
      const { title, slug: formSlug, status, content, ...data } = formData

      // If content is a tiptap JSON object, store JSON in data and serialize markdown for content
      let contentStr = content as string
      if (typeof content === 'object' && content !== null) {
        data.content_json = content
        // Serialize to markdown for the file body (used by frontend rendering)
        const { serializeTipTapToMarkdown } = await import('@/lib/editor/serializer')
        contentStr = serializeTipTapToMarkdown(content as import('@/lib/editor/types').TipTapDocument)
      }

      const res = await fetch(`/api/entries/${handle}/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          slug: formSlug,
          status,
          content: contentStr,
          data,
          contentHash: entry?.contentHash,
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        if (json.error?.details?.fieldErrors) {
          setFieldErrors(json.error.details.fieldErrors)
        } else {
          setError(json.error?.message ?? 'Failed to save entry')
        }
        return
      }

      const json = await res.json()
      const updatedEntry = json.data as EntryData

      // If slug changed, redirect to new URL
      if (updatedEntry.slug !== slug) {
        router.replace(`/cp/collections/${handle}/${updatedEntry.slug}`)
      } else {
        setEntry(updatedEntry)
      }
      markSaved()
      toast.success('Entry saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save entry')
      toast.error('Failed to save entry')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    const res = await fetch(`/api/entries/${handle}/${slug}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      throw new Error(`Failed to delete entry: ${res.status}`)
    }
    router.push(`/cp/collections/${handle}`)
  }

  if (loading) {
    return <ListSkeleton rows={4} />
  }

  if (error && !entry) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-700">{error}</p>
        <Link
          href={`/cp/collections/${handle}`}
          className="mt-2 inline-block text-sm font-medium text-red-900 underline"
        >
          Back to entries
        </Link>
      </div>
    )
  }

  // Separate tabs into content tabs and sidebar
  const contentTabs: { key: string; label: string; fields: FieldDefinition[] }[] = []
  const sidebarFields: FieldDefinition[] = []
  if (blueprint) {
    for (const [tabKey, tab] of Object.entries(blueprint.tabs)) {
      if (tabKey === 'sidebar') {
        sidebarFields.push(...tab.fields)
      } else {
        const label = tab.display ?? tabKey.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        contentTabs.push({ key: tabKey, label, fields: tab.fields })
      }
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
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
            <span className="text-foreground">{entry?.title ?? slug}</span>
          </nav>
          <h1 className="mt-2 text-2xl font-bold text-foreground">
            Edit Entry
          </h1>
        </div>
        <DeleteDialog
          title="Delete entry"
          description={`Are you sure you want to delete "${entry?.title}"? This action cannot be undone.`}
          onConfirm={handleDelete}
        />
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <form onSubmit={handleSave} className="mt-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main content area with tabs */}
          <div className="flex-1 min-w-0">
            <Tabs defaultValue={contentTabs[0]?.key ?? 'main'}>
              {contentTabs.length > 1 && (
                <TabsList variant="line" className="mb-5">
                  {contentTabs.map((tab) => (
                    <TabsTrigger key={tab.key} value={tab.key}>
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              )}

              {contentTabs.map((tab) => (
                <TabsContent key={tab.key} value={tab.key} className="space-y-5">
                  {tab.fields.map((fieldDef) => (
                    <FieldRenderer
                      key={fieldDef.handle}
                      fieldDefinition={fieldDef as TypedFieldDefinition}
                      value={formData[fieldDef.handle]}
                      onChange={(value) => handleFieldChange(fieldDef.handle, value)}
                      error={fieldErrors[fieldDef.handle]}
                    />
                  ))}
                </TabsContent>
              ))}

              {/* Fallback content field if no blueprint defines one */}
              {contentTabs.every((tab) => !tab.fields.some((f) => f.handle === 'content')) &&
                !sidebarFields.some((f) => f.handle === 'content') &&
                contentTabs.length === 0 && (
                <div className="space-y-5">
                  <div>
                    <label htmlFor="field-content" className="block text-sm font-medium text-foreground">
                      Content
                    </label>
                    <textarea
                      id="field-content"
                      value={(formData.content as string) ?? ''}
                      onChange={(e) => handleFieldChange('content', e.target.value)}
                      rows={12}
                      className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
              )}
            </Tabs>

            <div className="flex items-center gap-3 border-t border-border pt-5 mt-5">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Saving…' : 'Save'}
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
          </div>

          {/* Sidebar panel */}
          {sidebarFields.length > 0 && (
            <aside className="w-full lg:w-72 lg:shrink-0">
              <div className="lg:sticky lg:top-6 space-y-5 rounded-lg border border-border bg-card p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Settings
                </h3>
                {sidebarFields.map((fieldDef) => (
                  <FieldRenderer
                    key={fieldDef.handle}
                    fieldDefinition={fieldDef as TypedFieldDefinition}
                    value={formData[fieldDef.handle]}
                    onChange={(value) => handleFieldChange(fieldDef.handle, value)}
                    error={fieldErrors[fieldDef.handle]}
                  />
                ))}
              </div>
            </aside>
          )}
        </div>
      </form>
    </div>
  )
}


