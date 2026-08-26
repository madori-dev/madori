'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FieldRenderer } from '@/components/cp/fields/FieldRenderer'
import { ListSkeleton } from '@/components/cp/ListSkeleton'
import { DeleteDialog } from '@/components/cp/DeleteDialog'
import { CapabilityGate } from '@/components/cp/CapabilityGate'
import { useFieldValidation } from '@/hooks/use-field-validation'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import type { FieldDefinition as TypedFieldDefinition } from '@/lib/blueprints/types'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SeoRecordEditor } from '@/components/cp/seo/seo-record-editor'
import { filterPayloadByVisibility } from '@/lib/blueprints/visibility'

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
      sections?: Record<string, { display?: string; fields: FieldDefinition[] }>
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
        const [entryRes, collectionRes] = await Promise.all([
          fetch(`/api/entries/${handle}/${slug}`),
          fetch(`/api/collections/${handle}`),
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

        if (collectionRes.ok) {
          const collectionJson = await collectionRes.json()
          const blueprintRes = await fetch(`/api/blueprints/collections/${collectionJson.data.blueprint}`)
          if (!blueprintRes.ok) return
          const blueprintJson = await blueprintRes.json()
          setBlueprint(blueprintJson.data)

          // Extract all fields for client-side validation
          const fields: TypedFieldDefinition[] = []
          if (blueprintJson.data?.tabs) {
            for (const tab of Object.values(blueprintJson.data.tabs) as { fields: FieldDefinition[]; sections?: Record<string, { fields: FieldDefinition[] }> }[]) {
              for (const field of tab.fields) {
                if (field.handle !== 'seo') fields.push(field as TypedFieldDefinition)
              }
              for (const section of Object.values(tab.sections ?? {}) as { fields: FieldDefinition[] }[]) {
                for (const field of section.fields) if (field.handle !== 'seo') fields.push(field as TypedFieldDefinition)
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
      const structuredContent = typeof content === 'object' && content !== null ? content : undefined
      if (structuredContent) {
        // Serialize to markdown for the file body (used by frontend rendering)
        const { serializeTipTapToMarkdown } = await import('@/lib/editor/serializer')
        contentStr = serializeTipTapToMarkdown(content as import('@/lib/editor/types').TipTapDocument)
      }
      const visibleData = filterPayloadByVisibility(allBlueprintFields.map((field) => ({ handle: field.handle, visibility: field.field.visibility })), data)
      if ('seo' in data) visibleData.seo = data.seo
      if (structuredContent) visibleData.content_json = structuredContent
      // JSON omits undefined. Preserve an editor clear as null so updateEntry can
      // remove stale frontmatter before validating the optional field.
      const serializableData = Object.fromEntries(
        Object.entries(visibleData).map(([key, value]) => [key, value === undefined ? null : value])
      )

      const res = await fetch(`/api/entries/${handle}/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          slug: formSlug,
          status,
          content: contentStr,
          data: serializableData,
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

  const contentTabs: { key: string; label: string; fields: FieldDefinition[]; sections: { key: string; label: string; fields: FieldDefinition[] }[]; showSeoEditor: boolean }[] = []
  let hasSeoTab = false
  if (blueprint) {
    for (const [tabKey, tab] of Object.entries(blueprint.tabs)) {
      const showSeoEditor = tabKey.toLowerCase() === 'seo' || tab.display?.toLowerCase() === 'seo' || tab.fields.some(field => field.handle === 'seo')
      const visibleFields = tab.fields.filter(field => field.handle !== 'seo')
      const sections = Object.entries(tab.sections ?? {}).map(([sectionKey, section]) => ({
        key: sectionKey,
        label: section.display ?? sectionKey.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        fields: section.fields.filter((field) => field.handle !== 'seo'),
      })).filter((section) => section.fields.length > 0)
      if (visibleFields.length > 0 || sections.length > 0 || showSeoEditor) {
        const label = tab.display ?? (tabKey === 'sidebar' ? 'Settings' : tabKey.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
        contentTabs.push({ key: tabKey, label, fields: visibleFields, sections, showSeoEditor })
      }
      hasSeoTab ||= showSeoEditor
    }
  }
  const needsFallbackContent = contentTabs.length === 0
  if (needsFallbackContent) contentTabs.push({ key: '__content', label: 'Content', fields: [], sections: [], showSeoEditor: false })
  if (!hasSeoTab) contentTabs.push({ key: '__seo', label: 'SEO', fields: [], sections: [], showSeoEditor: true })

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
        <CapabilityGate resource="entries" action="delete" scope={handle}><DeleteDialog
          title="Delete entry"
          description={`Are you sure you want to delete "${entry?.title}"? This action cannot be undone.`}
          onConfirm={handleDelete}
        /></CapabilityGate>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <form onSubmit={handleSave} className="mt-6">
        <div>
          <div className="min-w-0">
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
                      values={formData}
                    />
                  ))}
                  {tab.sections.map((section) => (
                    <section key={section.key} className="space-y-5 rounded-lg border p-4">
                      <h2 className="text-sm font-semibold">{section.label}</h2>
                      {section.fields.map((fieldDef) => <FieldRenderer key={fieldDef.handle} fieldDefinition={fieldDef as TypedFieldDefinition} value={formData[fieldDef.handle]} onChange={(value) => handleFieldChange(fieldDef.handle, value)} error={fieldErrors[fieldDef.handle]} values={formData} />)}
                    </section>
                  ))}
                  {needsFallbackContent && tab.key === '__content' && (
                    <div>
                      <label htmlFor="field-content" className="block text-sm font-medium text-foreground">Content</label>
                      <textarea
                        id="field-content"
                        value={(formData.content as string) ?? ''}
                        onChange={(e) => handleFieldChange('content', e.target.value)}
                        rows={12}
                        className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                  )}
                  {tab.showSeoEditor && <SeoRecordEditor value={formData.seo} onChange={(value) => handleFieldChange('seo', value)} />}
                </TabsContent>
              ))}
            </Tabs>

            <div className="flex items-center gap-3 border-t border-border pt-5 mt-5">
              <CapabilityGate resource="entries" action="edit" scope={handle}><button
                type="submit"
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Saving…' : 'Save'}
              </button></CapabilityGate>
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
        </div>
      </form>
    </div>
  )
}
