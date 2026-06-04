'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'

import type { CollectionConfig } from '@/lib/config/schema'
import { IconPicker } from '@/components/cp/icon-picker'
import { MultiSelect, type MultiSelectOption } from '@/components/cp/multi-select'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Checkbox } from '@/components/ui/checkbox'
import { ErrorAlert } from '@/components/cp/ErrorAlert'
import { ListSkeleton } from '@/components/cp/ListSkeleton'

export default function CollectionConfigurePage() {
  const params = useParams()
  const handle = params.handle as string

  const [config, setConfig] = useState<CollectionConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [blueprintOptions, setBlueprintOptions] = useState<MultiSelectOption[]>([])
  const [taxonomyOptions, setTaxonomyOptions] = useState<MultiSelectOption[]>([])

  useEffect(() => {
    fetchConfig()
    fetchBlueprints()
    fetchTaxonomies()
  }, [handle])

  async function fetchBlueprints() {
    try {
      const res = await fetch('/cp/api/blueprints/collections')
      if (res.ok) {
        const json = await res.json()
        const options = (json.data ?? []).map((bp: { handle: string }) => ({
          value: bp.handle,
          label: bp.handle,
        }))
        setBlueprintOptions(options)
      }
    } catch {
      // Silently fail
    }
  }

  async function fetchTaxonomies() {
    try {
      const res = await fetch('/cp/api/taxonomies')
      if (res.ok) {
        const json = await res.json()
        const options = (json.data ?? []).map((t: { handle: string; title: string }) => ({
          value: t.handle,
          label: t.title,
        }))
        setTaxonomyOptions(options)
      }
    } catch {
      // Silently fail
    }
  }

  async function fetchConfig() {
    try {
      setLoading(true)
      const res = await fetch(`/cp/api/collections/${handle}`)
      if (!res.ok) {
        throw new Error(`Failed to fetch configuration: ${res.status}`)
      }
      const json = await res.json()
      setConfig(json.data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load configuration')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!config) return

    setSaving(true)
    setErrors({})

    try {
      const res = await fetch(`/cp/api/collections/${handle}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })

      if (res.status === 422) {
        const json = await res.json()
        const fieldErrors: Record<string, string> = {}
        if (json.error?.details) {
          for (const [field, messages] of Object.entries(json.error.details)) {
            fieldErrors[field] = (messages as string[]).join(', ')
          }
        }
        setErrors(fieldErrors)
        toast.error('Validation failed. Check the fields below.')
        return
      }

      if (!res.ok) {
        throw new Error(`Failed to save configuration: ${res.status}`)
      }

      toast.success('Configuration saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <ListSkeleton rows={5} />

  if (!config) {
    return <ErrorAlert message="Collection not found." />
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/cp/collections" />}>
              Collections
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={`/cp/collections/${handle}`} />}>
              {handle}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Configure</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configure Collection</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage settings for the <span className="font-medium">{handle}</span> collection.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {/* Configuration cards */}
      <div className="space-y-6">
        {/* General */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">General</CardTitle>
            <CardDescription>Basic collection identity and routing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                type="text"
                value={config.title}
                onChange={(e) => setConfig((prev) => ({ ...prev!, title: e.target.value }))}
                placeholder="Collection title"
                aria-invalid={!!errors.title}
              />
              {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
            </div>

            <IconPicker
              label="Icon"
              value={config.icon}
              onChange={(value) => setConfig((prev) => ({ ...prev!, icon: value }))}
            />
            {errors.icon && <p className="text-xs text-destructive">{errors.icon}</p>}

            <div className="space-y-2">
              <Label htmlFor="handle">Handle</Label>
              <Input id="handle" type="text" value={config.handle} disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="route">Route</Label>
              <Input
                id="route"
                type="text"
                value={config.route ?? ''}
                onChange={(e) => setConfig((prev) => ({ ...prev!, route: e.target.value }))}
                placeholder="/{collection}/{slug}"
                aria-invalid={!!errors.route}
              />
              {errors.route && <p className="text-xs text-destructive">{errors.route}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Dates & Behaviors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dates &amp; Behaviors</CardTitle>
            <CardDescription>Configure date-based entry behaviors.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="dated">Dated</Label>
                <p className="text-xs text-muted-foreground">
                  Entries support publish date scheduling and expiration
                </p>
              </div>
              <button
                id="dated"
                type="button"
                role="switch"
                aria-checked={config.dated ?? false}
                onClick={() => setConfig((prev) => ({ ...prev!, dated: !prev!.dated }))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  config.dated ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`pointer-events-none block size-5 rounded-full bg-card shadow-lg ring-0 transition-transform ${
                    config.dated ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            {errors.dated && <p className="text-xs text-destructive">{errors.dated}</p>}
          </CardContent>
        </Card>

        {/* Ordering */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ordering</CardTitle>
            <CardDescription>Control how entries are sorted.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="sortable">Sortable</Label>
                <p className="text-xs text-muted-foreground">
                  Enable drag-and-drop reordering of entries
                </p>
              </div>
              <button
                id="sortable"
                type="button"
                role="switch"
                aria-checked={config.sortable ?? false}
                onClick={() => setConfig((prev) => ({ ...prev!, sortable: !prev!.sortable }))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  config.sortable ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`pointer-events-none block size-5 rounded-full bg-card shadow-lg ring-0 transition-transform ${
                    config.sortable ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            {errors.sortable && <p className="text-xs text-destructive">{errors.sortable}</p>}

            <div className="space-y-2">
              <Label htmlFor="sortDirection">Sort Direction</Label>
              <select
                id="sortDirection"
                value={config.sortDirection ?? 'asc'}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev!,
                    sortDirection: e.target.value as 'asc' | 'desc',
                  }))
                }
                className="h-8 w-full cursor-pointer rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
              {errors.sortDirection && <p className="text-xs text-destructive">{errors.sortDirection}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Content Model */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Content Model</CardTitle>
            <CardDescription>Assign blueprints to define entry structure.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {blueprintOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No blueprints available.{' '}
                <Link
                  href={`/cp/blueprints/collections/${handle}`}
                  className="text-foreground underline underline-offset-2 hover:no-underline"
                >
                  Create a blueprint
                </Link>
              </p>
            ) : (
              <MultiSelect
                label="Blueprints"
                options={blueprintOptions}
                selected={config.blueprints ?? []}
                onChange={(selected) =>
                  setConfig((prev) => ({ ...prev!, blueprints: selected }))
                }
                placeholder="Select blueprints..."
              />
            )}
            {errors.blueprints && <p className="text-xs text-destructive">{errors.blueprints}</p>}
          </CardContent>
        </Card>

        {/* Publishing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Publishing</CardTitle>
            <CardDescription>Default publishing behavior for new entries.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="defaultStatus">Default Status</Label>
              <select
                id="defaultStatus"
                value={config.defaultStatus ?? 'draft'}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev!,
                    defaultStatus: e.target.value as 'published' | 'draft',
                  }))
                }
                className="h-8 w-full cursor-pointer rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
              {errors.defaultStatus && <p className="text-xs text-destructive">{errors.defaultStatus}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Redirects */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Redirects</CardTitle>
            <CardDescription>Configure redirect behavior for entries.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="redirects-create">Create Redirect</Label>
              <Input
                id="redirects-create"
                type="text"
                value={config.redirects?.create ?? ''}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev!,
                    redirects: { ...prev!.redirects, create: e.target.value },
                  }))
                }
                placeholder="/redirect/after/create"
                aria-invalid={!!errors['redirects.create']}
              />
              {errors['redirects.create'] && <p className="text-xs text-destructive">{errors['redirects.create']}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="redirects-404">404 Redirect</Label>
              <Input
                id="redirects-404"
                type="text"
                value={config.redirects?.['404'] ?? ''}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev!,
                    redirects: { ...prev!.redirects, '404': e.target.value },
                  }))
                }
                placeholder="/redirect/on/404"
                aria-invalid={!!errors['redirects.404']}
              />
              {errors['redirects.404'] && <p className="text-xs text-destructive">{errors['redirects.404']}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Templates */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Templates</CardTitle>
            <CardDescription>Default template and layout for rendering.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template">Template</Label>
              <Input
                id="template"
                type="text"
                value={config.template ?? ''}
                onChange={(e) => setConfig((prev) => ({ ...prev!, template: e.target.value }))}
                placeholder="default"
                aria-invalid={!!errors.template}
              />
              {errors.template && <p className="text-xs text-destructive">{errors.template}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="layout">Layout</Label>
              <Input
                id="layout"
                type="text"
                value={config.layout ?? ''}
                onChange={(e) => setConfig((prev) => ({ ...prev!, layout: e.target.value }))}
                placeholder="default"
                aria-invalid={!!errors.layout}
              />
              {errors.layout && <p className="text-xs text-destructive">{errors.layout}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Taxonomies */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Taxonomies</CardTitle>
            <CardDescription>Connect taxonomies for entry categorization.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MultiSelect
              label="Taxonomies"
              options={taxonomyOptions}
              selected={config.taxonomies ?? []}
              onChange={(selected) =>
                setConfig((prev) => ({ ...prev!, taxonomies: selected }))
              }
              placeholder="Select taxonomies..."
            />
            {errors.taxonomies && <p className="text-xs text-destructive">{errors.taxonomies}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
