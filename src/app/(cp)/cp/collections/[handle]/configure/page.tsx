'use client'

import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
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

  const fetchBlueprints = useCallback(async () => {
    try {
      const res = await fetch('/api/blueprints/collections')
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
  }, [])

  const fetchTaxonomies = useCallback(async () => {
    try {
      const res = await fetch('/api/taxonomies')
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
  }, [])

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/collections/${handle}`)
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
  }, [handle])

  useEffect(() => {
    const load = window.setTimeout(() => {
      void fetchConfig()
      void fetchBlueprints()
      void fetchTaxonomies()
    }, 0)

    return () => window.clearTimeout(load)
  }, [fetchBlueprints, fetchConfig, fetchTaxonomies])

  async function handleSave() {
    if (!config) return

    setSaving(true)
    setErrors({})

    try {
      const res = await fetch(`/api/collections/${handle}`, {
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

        {/* Content Model */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Content Model</CardTitle>
            <CardDescription>Assign one blueprint to define entry structure.</CardDescription>
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
              <div className="space-y-2">
                <Label htmlFor="blueprint">Blueprint</Label>
                <select
                  id="blueprint"
                  value={config.blueprint}
                  onChange={(event) => setConfig((prev) => ({ ...prev!, blueprint: event.target.value }))}
                  className="h-8 w-full cursor-pointer rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {blueprintOptions.map((blueprint) => <option key={blueprint.value} value={blueprint.value}>{blueprint.label}</option>)}
                </select>
              </div>
            )}
            {errors.blueprint && <p className="text-xs text-destructive">{errors.blueprint}</p>}
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
