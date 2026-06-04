'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Tags, Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/cp/PageHeader'
import { EmptyState } from '@/components/cp/EmptyState'
import { ErrorAlert } from '@/components/cp/ErrorAlert'
import { ListSkeleton } from '@/components/cp/ListSkeleton'
import { DeleteDialog } from '@/components/cp/DeleteDialog'

interface Taxonomy {
  handle: string
  title: string
  blueprint?: string
}

export default function TaxonomiesListPage() {
  const [taxonomies, setTaxonomies] = useState<Taxonomy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchTaxonomies() {
    try {
      setLoading(true)
      const res = await fetch('/api/definitions/taxonomies')
      if (!res.ok) throw new Error(`Failed to fetch taxonomies: ${res.status}`)
      const json = await res.json()
      setTaxonomies(json.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load taxonomies')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTaxonomies()
  }, [])

  async function handleDelete(handle: string) {
    const res = await fetch(`/api/definitions/taxonomies/${handle}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Failed to delete taxonomy: ${res.status}`)
    await fetchTaxonomies()
  }

  if (loading) return <ListSkeleton />
  if (error) return <ErrorAlert message={error} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Taxonomies"
        description="Manage your content taxonomies and terms."
        createHref="/cp/taxonomies/create"
        blueprintsHref="/cp/blueprints?type=taxonomies"
      />

      {taxonomies.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No taxonomies configured."
          description="Create a taxonomy or add definition files to resources/taxonomies/."
        />
      ) : (
        <div className="rounded-lg border divide-y">
          {taxonomies.map((taxonomy) => (
            <div key={taxonomy.handle} className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-accent/50">
              <Link
                href={`/cp/taxonomies/${taxonomy.handle}`}
                className="flex items-center gap-3 min-w-0 flex-1"
              >
                <span className="text-sm font-medium truncate">{taxonomy.title}</span>
                <span className="text-xs text-muted-foreground truncate">{taxonomy.handle}</span>
              </Link>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  nativeButton={false}
                  render={<Link href={`/cp/taxonomies/${taxonomy.handle}/edit`} />}
                >
                  <Pencil className="size-4" />
                </Button>
                <DeleteDialog
                  title="Delete taxonomy"
                  description={`Are you sure you want to delete "${taxonomy.title}"? This cannot be undone.`}
                  onConfirm={() => handleDelete(taxonomy.handle)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
