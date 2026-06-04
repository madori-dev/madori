'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { BlueprintPicker } from '@/components/cp/BlueprintPicker'
import { MultiSelect, type MultiSelectOption } from '@/components/cp/multi-select'

export type EntityType = 'taxonomies' | 'globals' | 'navigations' | 'forms'

interface FieldConfig {
  name: string
  label: string
  type: 'text' | 'number' | 'checkbox' | 'collections'
  placeholder?: string
  help?: string
}

interface DefinitionFormProps {
  entityType: EntityType
  mode: 'create' | 'edit'
  handle?: string
  listPath: string
  title: string
}

const ENTITY_FIELDS: Record<EntityType, FieldConfig[]> = {
  taxonomies: [],
  globals: [],
  navigations: [
    { name: 'max_depth', label: 'Max Depth', type: 'number', placeholder: 'e.g. 3', help: 'Maximum nesting depth for navigation items' },
    { name: 'collections', label: 'Collections', type: 'collections', help: 'Enable linking to entries in these collections' },
  ],
  forms: [
    { name: 'honeypot', label: 'Enable honeypot', type: 'checkbox', help: 'Add a hidden field to detect spam submissions' },
    { name: 'store_submissions', label: 'Store submissions', type: 'checkbox', help: 'Save form submissions to the filesystem' },
  ],
}

/** Entity types that support blueprints */
const BLUEPRINT_ENTITY_TYPES: EntityType[] = ['taxonomies', 'globals', 'forms', 'navigations']

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function DefinitionForm({ entityType, mode, handle, listPath, title }: DefinitionFormProps) {
  const router = useRouter()
  const [formData, setFormData] = useState<Record<string, unknown>>({ title: '' })
  const [handleValue, setHandleValue] = useState('')
  const [handleManuallyEdited, setHandleManuallyEdited] = useState(false)
  const [loading, setLoading] = useState(mode === 'edit')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [createNewBlueprint, setCreateNewBlueprint] = useState(false)
  const [collectionOptions, setCollectionOptions] = useState<MultiSelectOption[]>([])

  // Fetch available collections for the multi-select picker
  useEffect(() => {
    const hasCollectionsField = ENTITY_FIELDS[entityType].some((f) => f.type === 'collections')
    if (!hasCollectionsField) return

    async function fetchCollections() {
      try {
        const res = await fetch('/api/collections')
        if (res.ok) {
          const json = await res.json()
          const collections = (json.data ?? []) as { handle: string; title: string }[]
          setCollectionOptions(collections.map((c) => ({ value: c.handle, label: c.title })))
        }
      } catch {
        // Non-critical — picker will just be empty
      }
    }
    fetchCollections()
  }, [entityType])

  useEffect(() => {
    if (mode !== 'edit' || !handle) return

    async function fetchDefinition() {
      try {
        const res = await fetch(`/api/definitions/${entityType}/${handle}`)
        if (!res.ok) {
          const json = await res.json().catch(() => ({ error: 'Failed to load definition' }))
          setGeneralError(json.error || `Failed to load definition (${res.status})`)
          return
        }
        const json = await res.json()
        const data = json.data ?? {}
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { handle: _handle, ...rest } = data
        setFormData(rest)
      } catch (err) {
        setGeneralError(err instanceof Error ? err.message : 'Failed to load definition')
      } finally {
        setLoading(false)
      }
    }

    fetchDefinition()
  }, [mode, handle, entityType])

  function handleTitleChange(value: string) {
    setFormData((prev) => ({ ...prev, title: value }))
    if (mode === 'create' && !handleManuallyEdited) {
      setHandleValue(slugify(value))
    }
  }

  function handleFieldChange(name: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})
    setGeneralError(null)

    const clientErrors: Record<string, string[]> = {}
    if (!formData.title || (typeof formData.title === 'string' && formData.title.trim() === '')) {
      clientErrors.title = ['Title is required']
    }
    if (mode === 'create' && !handleValue.trim()) {
      clientErrors.handle = ['Handle is required']
    }

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors)
      return
    }

    setSubmitting(true)

    try {
      // If creating a new blueprint, generate an empty one first
      if (mode === 'create' && createNewBlueprint && BLUEPRINT_ENTITY_TYPES.includes(entityType)) {
        const bpHandle = handleValue
        const defaultFields = entityType === 'navigations'
          ? [
              { handle: 'label', field: { type: 'text', display: 'Label', required: true } },
              { handle: 'url', field: { type: 'text', display: 'URL' } },
            ]
          : []
        const emptyBlueprint = {
          tabs: {
            main: {
              label: 'Main',
              fields: defaultFields,
            },
          },
        }

        const bpRes = await fetch(`/api/blueprints/${entityType}/${bpHandle}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(emptyBlueprint),
        })

        if (!bpRes.ok) {
          const json = await bpRes.json().catch(() => ({ error: { message: 'Failed to create blueprint' } }))
          setGeneralError(json.error?.message || `Failed to create blueprint (${bpRes.status})`)
          setSubmitting(false)
          return
        }

        // Set the blueprint field to the newly created handle
        formData.blueprint = bpHandle
      }

      const url = mode === 'create'
        ? `/api/definitions/${entityType}`
        : `/api/definitions/${entityType}/${handle}`
      const method = mode === 'create' ? 'POST' : 'PUT'

      const body = mode === 'create'
        ? { handle: handleValue, ...formData }
        : { ...formData }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.status === 422) {
        const json = await res.json()
        if (json.details) {
          setErrors(json.details)
        } else {
          setGeneralError(json.error || 'Validation failed')
        }
        return
      }

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: 'An unexpected error occurred' }))
        setGeneralError(json.error || `Request failed (${res.status})`)
        return
      }

      toast.success(mode === 'create' ? `${sectionTitle.slice(0, -1)} created` : 'Changes saved')
      router.push(listPath)
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : 'An unexpected error occurred')
      toast.error(mode === 'create' ? 'Failed to create' : 'Failed to save changes')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <ListSkeleton rows={3} />

  const fields = ENTITY_FIELDS[entityType]

  // Derive breadcrumb label from listPath
  const sectionLabel = listPath.split('/').pop() ?? entityType
  const sectionTitle = sectionLabel.charAt(0).toUpperCase() + sectionLabel.slice(1)

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={listPath} />}>
              {sectionTitle}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{mode === 'create' ? 'Create' : handle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>

      {generalError && <ErrorAlert message={generalError} />}

      <Card className="max-w-lg">
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Title field */}
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                type="text"
                value={(formData.title as string) ?? ''}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="e.g. My Taxonomy"
                aria-invalid={!!errors.title}
              />
              {errors.title && (
                <p className="text-xs text-destructive">{errors.title[0]}</p>
              )}
            </div>

            {/* Handle field (create only) */}
            {mode === 'create' && (
              <div className="space-y-2">
                <Label htmlFor="handle">
                  Handle <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="handle"
                  type="text"
                  value={handleValue}
                  onChange={(e) => {
                    setHandleManuallyEdited(true)
                    setHandleValue(e.target.value)
                  }}
                  placeholder="auto-generated-from-title"
                  className="font-mono"
                  aria-invalid={!!errors.handle}
                />
                <p className="text-xs text-muted-foreground">
                  Used as the filename and URL slug. Auto-generated from title.
                </p>
                {errors.handle && (
                  <p className="text-xs text-destructive">{errors.handle[0]}</p>
                )}
              </div>
            )}

            {/* Blueprint picker (for entity types that support blueprints) */}
            {BLUEPRINT_ENTITY_TYPES.includes(entityType) && (
              <BlueprintPicker
                type={entityType}
                value={(formData.blueprint as string) ?? ''}
                onChange={(val) => handleFieldChange('blueprint', val || undefined)}
                onCreateNew={mode === 'create' ? setCreateNewBlueprint : undefined}
              />
            )}

            {/* Type-specific fields */}
            {fields.map((field) => (
              <div key={field.name} className="space-y-2">
                {field.type === 'checkbox' ? (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={field.name}
                      checked={!!formData[field.name]}
                      onCheckedChange={(checked) => handleFieldChange(field.name, checked === true)}
                    />
                    <Label htmlFor={field.name} className="font-normal">
                      {field.label}
                    </Label>
                  </div>
                ) : field.type === 'collections' ? (
                  <>
                    <Label>{field.label}</Label>
                    <MultiSelect
                      options={collectionOptions}
                      selected={Array.isArray(formData[field.name]) ? (formData[field.name] as string[]) : []}
                      onChange={(val) => handleFieldChange(field.name, val.length > 0 ? val : undefined)}
                      placeholder="Select collections..."
                    />
                  </>
                ) : (
                  <>
                    <Label htmlFor={field.name}>{field.label}</Label>
                    <Input
                      id={field.name}
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={(formData[field.name] as string | number) ?? ''}
                      onChange={(e) => {
                        if (field.type === 'number') {
                          const val = e.target.value === '' ? undefined : Number(e.target.value)
                          handleFieldChange(field.name, val)
                        } else {
                          const val = e.target.value || undefined
                          handleFieldChange(field.name, val)
                        }
                      }}
                      placeholder={field.placeholder}
                      aria-invalid={!!errors[field.name]}
                    />
                  </>
                )}
                {field.help && !errors[field.name] && (
                  <p className="text-xs text-muted-foreground">{field.help}</p>
                )}
                {errors[field.name] && (
                  <p className="text-xs text-destructive">{errors[field.name][0]}</p>
                )}
              </div>
            ))}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : mode === 'create' ? 'Create' : 'Save changes'}
              </Button>
              <Button variant="ghost" nativeButton={false} render={<Link href={listPath} />}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
