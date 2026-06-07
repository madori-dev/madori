'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Layers, ChevronRight, Puzzle } from 'lucide-react'

import { PageHeader } from '@/components/cp/PageHeader'
import { EmptyState } from '@/components/cp/EmptyState'
import { ErrorAlert } from '@/components/cp/ErrorAlert'
import { ListSkeleton } from '@/components/cp/ListSkeleton'
import { DeleteDialog } from '@/components/cp/DeleteDialog'

interface Fieldset {
  handle: string
  is_block?: boolean
  display?: string
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

  const blocks = fieldsets.filter((fs) => fs.is_block)
  const importable = fieldsets.filter((fs) => !fs.is_block)

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
        <>
          {/* Blocks */}
          {blocks.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Puzzle className="size-4 text-primary" />
                <h2 className="text-sm font-medium">Blocks</h2>
                <span className="text-xs text-muted-foreground">({blocks.length})</span>
              </div>
              <div className="rounded-lg border divide-y">
                {blocks.map((fs) => (
                  <FieldsetRow key={fs.handle} fieldset={fs} onDelete={handleDelete} />
                ))}
              </div>
            </section>
          )}

          {/* Importable fieldsets */}
          {importable.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Layers className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-medium">Fieldsets</h2>
                <span className="text-xs text-muted-foreground">({importable.length})</span>
              </div>
              <div className="rounded-lg border divide-y">
                {importable.map((fs) => (
                  <FieldsetRow key={fs.handle} fieldset={fs} onDelete={handleDelete} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function FieldsetRow({ fieldset: fs, onDelete }: { fieldset: Fieldset; onDelete: (handle: string) => Promise<void> }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-accent/50">
      <Link
        href={`/cp/fieldsets/${fs.handle}`}
        className="flex items-center gap-3 min-w-0 flex-1"
      >
        {fs.is_block ? (
          <Puzzle className="size-4 text-primary shrink-0" />
        ) : (
          <Layers className="size-4 text-muted-foreground shrink-0" />
        )}
        <span className="text-sm font-medium truncate">{fs.display || fs.handle}</span>
        {fs.display && (
          <span className="text-xs text-muted-foreground truncate">{fs.handle}</span>
        )}
      </Link>
      <div className="flex items-center gap-1 shrink-0">
        <DeleteDialog
          title="Delete fieldset"
          description={`Are you sure you want to delete the "${fs.handle}" fieldset? This cannot be undone.`}
          onConfirm={async () => onDelete(fs.handle)}
        />
        <Link href={`/cp/fieldsets/${fs.handle}`}>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      </div>
    </div>
  )
}
