'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, FileCode2, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/cp/PageHeader'
import { EmptyState } from '@/components/cp/EmptyState'
import { ErrorAlert } from '@/components/cp/ErrorAlert'
import { ListSkeleton } from '@/components/cp/ListSkeleton'
import { DeleteDialog } from '@/components/cp/DeleteDialog'

import type { Blueprint, BlueprintType } from '@/lib/blueprints/types'

const blueprintTypes: { type: BlueprintType; label: string; description: string }[] = [
  { type: 'collections', label: 'Collections', description: 'Define fields for collection entries' },
  { type: 'taxonomies', label: 'Taxonomies', description: 'Define fields for taxonomy terms' },
  { type: 'globals', label: 'Globals', description: 'Define fields for global sets' },
  { type: 'navigations', label: 'Navigations', description: 'Define custom fields for navigation items' },
  { type: 'forms', label: 'Forms', description: 'Define fields for form submissions' },
]

export default function BlueprintsListPage() {
  const searchParams = useSearchParams()
  const filterType = searchParams.get('type') as BlueprintType | null

  const [blueprintsByType, setBlueprintsByType] = useState<Record<string, Blueprint[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const visibleTypes = filterType
    ? blueprintTypes.filter(({ type }) => type === filterType)
    : blueprintTypes

  async function fetchAll() {
    try {
      const results: Record<string, Blueprint[]> = {}
      for (const { type } of blueprintTypes) {
        const res = await fetch(`/api/blueprints/${type}`)
        if (res.status === 401) {
          window.location.href = '/cp/login'
          return
        }
        if (res.ok) {
          const json = await res.json()
          results[type] = json.data ?? []
        } else {
          results[type] = []
        }
      }
      setBlueprintsByType(results)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load blueprints')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  async function handleDelete(type: string, handle: string) {
    const res = await fetch(`/api/blueprints/${type}/${handle}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Failed to delete blueprint: ${res.status}`)
    await fetchAll()
  }

  if (loading) return <ListSkeleton />
  if (error) return <ErrorAlert message={error} />

  return (
    <div className="space-y-6">
      <PageHeader
        title={filterType ? `Blueprints — ${visibleTypes[0]?.label ?? filterType}` : 'Blueprints'}
        description="Define the field schemas for your content types."
        createHref="/cp/blueprints/create"
        createLabel="New Blueprint"
      />

      {filterType && (
        <div>
          <Link href="/cp/blueprints" className="text-sm text-muted-foreground hover:text-foreground underline">
            ← Show all blueprint types
          </Link>
        </div>
      )}

      <div className="space-y-6">
        {visibleTypes.map(({ type, label, description }) => {
          const blueprints = blueprintsByType[type] ?? []
          if (blueprints.length === 0) return null

          return (
            <div key={type}>
              <div className="mb-2">
                <h2 className="text-sm font-semibold">{label}</h2>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <div className="rounded-lg border divide-y">
                {blueprints.map((bp) => {
                  const fieldCount = Object.values(bp.tabs).reduce(
                    (acc, tab) => acc + tab.fields.length + (tab.sections ? Object.values(tab.sections).reduce((s, sec) => s + sec.fields.length, 0) : 0),
                    0
                  )

                  return (
                    <div
                      key={bp.handle}
                      className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-accent/50"
                    >
                      <Link
                        href={`/cp/blueprints/${type}/${bp.handle}`}
                        className="flex items-center gap-3 min-w-0 flex-1"
                      >
                        <FileCode2 className="size-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate">{bp.handle}</span>
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                          {Object.keys(bp.tabs).length} tab{Object.keys(bp.tabs).length !== 1 ? 's' : ''} · {fieldCount} field{fieldCount !== 1 ? 's' : ''}
                        </span>
                      </Link>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className="text-xs">
                          {type}
                        </Badge>
                        <DeleteDialog
                          title="Delete blueprint"
                          description={`Are you sure you want to delete the "${bp.handle}" blueprint? This cannot be undone.`}
                          onConfirm={() => handleDelete(type, bp.handle)}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {Object.values(blueprintsByType).every((bps) => bps.length === 0) && (
          <EmptyState
            icon={FileCode2}
            title="No blueprints found."
            description="Create your first blueprint to define content field schemas."
          />
        )}
      </div>
    </div>
  )
}
