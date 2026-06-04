'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Globe, Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/cp/PageHeader'
import { EmptyState } from '@/components/cp/EmptyState'
import { ErrorAlert } from '@/components/cp/ErrorAlert'
import { ListSkeleton } from '@/components/cp/ListSkeleton'
import { DeleteDialog } from '@/components/cp/DeleteDialog'

interface Global {
  handle: string
  title: string
  blueprint?: string
}

export default function GlobalsListPage() {
  const [globals, setGlobals] = useState<Global[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchGlobals() {
    try {
      setLoading(true)
      const res = await fetch('/api/definitions/globals')
      if (!res.ok) throw new Error(`Failed to fetch globals: ${res.status}`)
      const json = await res.json()
      setGlobals(json.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load globals')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchGlobals()
  }, [])

  async function handleDelete(handle: string) {
    const res = await fetch(`/api/definitions/globals/${handle}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Failed to delete global: ${res.status}`)
    await fetchGlobals()
  }

  if (loading) return <ListSkeleton />
  if (error) return <ErrorAlert message={error} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Globals"
        description="Manage site-wide content and settings."
        createHref="/cp/globals/create"
        blueprintsHref="/cp/blueprints?type=globals"
      />

      {globals.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No globals configured."
          description="Create a global or add definition files to resources/globals/."
        />
      ) : (
        <div className="rounded-lg border divide-y">
          {globals.map((global) => (
            <div key={global.handle} className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-accent/50">
              <Link
                href={`/cp/globals/${global.handle}`}
                className="flex items-center gap-3 min-w-0 flex-1"
              >
                <span className="text-sm font-medium truncate">{global.title}</span>
                <span className="text-xs text-muted-foreground truncate">{global.handle}</span>
              </Link>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  nativeButton={false}
                  render={<Link href={`/cp/globals/${global.handle}/edit`} />}
                >
                  <Pencil className="size-4" />
                </Button>
                <DeleteDialog
                  title="Delete global"
                  description={`Are you sure you want to delete "${global.title}"? This cannot be undone.`}
                  onConfirm={() => handleDelete(global.handle)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
