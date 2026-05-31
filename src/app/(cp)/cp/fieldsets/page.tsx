'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Layers, ChevronRight } from 'lucide-react'

import { PageHeader } from '@/components/cp/PageHeader'
import { EmptyState } from '@/components/cp/EmptyState'
import { ErrorAlert } from '@/components/cp/ErrorAlert'
import { ListSkeleton } from '@/components/cp/ListSkeleton'
import { DeleteDialog } from '@/components/cp/DeleteDialog'

interface Fieldset {
  handle: string
}

export default function FieldsetsListPage() {
  const [fieldsets, setFieldsets] = useState<Fieldset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchFieldsets() {
    try {
      setLoading(true)
      const res = await fetch('/api/fieldsets')
      if (!res.ok) throw new Error(`Failed to fetch fieldsets: ${res.status}`)
      const json = await res.json()
      setFieldsets(json.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fieldsets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFieldsets()
  }, [])

  async function handleDelete(handle: string) {
    const res = await fetch(`/api/fieldsets/${handle}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Failed to delete fieldset: ${res.status}`)
    await fetchFieldsets()
  }

  if (loading) return <ListSkeleton />
  if (error) return <ErrorAlert message={error} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fieldsets"
        description="Reusable field groups for blueprints and replicators."
        createHref="/cp/fieldsets/create"
        createLabel="New Fieldset"
      />

      {fieldsets.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No fieldsets yet."
          description="Create a fieldset to define reusable field groups."
        />
      ) : (
        <div className="rounded-lg border divide-y">
          {fieldsets.map((fs) => (
            <div key={fs.handle} className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-accent/50">
              <Link
                href={`/cp/fieldsets/${fs.handle}`}
                className="flex items-center gap-3 min-w-0 flex-1"
              >
                <Layers className="size-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">{fs.handle}</span>
              </Link>
              <div className="flex items-center gap-1 shrink-0">
                <DeleteDialog
                  title="Delete fieldset"
                  description={`Are you sure you want to delete the "${fs.handle}" fieldset? This cannot be undone.`}
                  onConfirm={() => handleDelete(fs.handle)}
                />
                <Link href={`/cp/fieldsets/${fs.handle}`}>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
