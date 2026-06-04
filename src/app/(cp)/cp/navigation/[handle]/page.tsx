'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { Settings2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { NavigationTreeEditor } from '@/components/cp/NavigationTreeEditor'

import type { NavigationItem } from '@/lib/types'
import type { Blueprint } from '@/lib/blueprints/types'

interface NavigationDefinition {
  title?: string
  blueprint?: string
  max_depth?: number
  collections?: string[]
}

export default function EditNavigationPage() {
  const params = useParams()
  const handle = params.handle as string

  const [items, setItems] = useState<NavigationItem[]>([])
  const [definition, setDefinition] = useState<NavigationDefinition | null>(null)
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchNavigation() {
      try {
        // Fetch navigation data
        const res = await fetch(`/api/content/navigations/${handle}`)
        if (!res.ok) throw new Error(`Failed to fetch navigation: ${res.status}`)
        const json = await res.json()
        const data = json.data ?? { items: [] }
        setItems(data.items ?? [])

        // Try to fetch definition for max_depth and blueprint
        try {
          const defRes = await fetch(`/api/definitions/navigations/${handle}`)
          if (defRes.ok) {
            const defJson = await defRes.json()
            const def = defJson.data ?? null
            setDefinition(def)

            // If definition has a blueprint, load it
            if (def?.blueprint) {
              try {
                const bpRes = await fetch(`/api/blueprints/navigations/${def.blueprint}`)
                if (bpRes.ok) {
                  const bpJson = await bpRes.json()
                  setBlueprint(bpJson.data ?? null)
                }
              } catch {
                // Blueprint not found — continue without it
              }
            }
          }
        } catch {
          // No definition available — no max_depth constraint
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load navigation')
      } finally {
        setLoading(false)
      }
    }
    fetchNavigation()
  }, [handle])

  async function handleSave() {
    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/content/navigations/${handle}/_`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => null)
        if (json?.error?.code === 'DEPTH_EXCEEDED') {
          throw new Error(
            `Navigation tree depth (${json.error.actualDepth}) exceeds the maximum allowed depth (${json.error.maxDepth}).`
          )
        }
        throw new Error(json?.error?.message || `Failed to save: ${res.status}`)
      }
      toast.success('Navigation saved')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save navigation'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <ListSkeleton rows={4} />

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/cp/navigation" />}>
              Navigation
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="capitalize">{handle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight capitalize">{handle}</h1>
          {definition?.blueprint && (
            <Badge variant="secondary" className="text-xs">
              Blueprint: {definition.blueprint}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {definition?.blueprint && (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/cp/blueprints/navigations/${definition.blueprint}`} />}
            >
              <Settings2 className="size-3.5" />
              Edit Blueprint
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      <NavigationTreeEditor
        items={items}
        onChange={setItems}
        maxDepth={definition?.max_depth}
        blueprint={blueprint}
      />
    </div>
  )
}
