'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ChevronRight, Navigation, Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/cp/PageHeader'
import { EmptyState } from '@/components/cp/EmptyState'
import { ErrorAlert } from '@/components/cp/ErrorAlert'
import { ListSkeleton } from '@/components/cp/ListSkeleton'
import { DeleteDialog } from '@/components/cp/DeleteDialog'

interface NavigationItem {
  handle: string
  title: string
  max_depth?: number
  collections?: string[]
}

export default function NavigationListPage() {
  const [navigations, setNavigations] = useState<NavigationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchNavigations() {
    try {
      setLoading(true)
      const res = await fetch('/api/definitions/navigations')
      if (!res.ok) throw new Error(`Failed to fetch navigations: ${res.status}`)
      const json = await res.json()
      setNavigations(json.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load navigations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNavigations()
  }, [])

  async function handleDelete(handle: string) {
    const res = await fetch(`/api/definitions/navigations/${handle}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Failed to delete navigation: ${res.status}`)
    await fetchNavigations()
  }

  if (loading) return <ListSkeleton />
  if (error) return <ErrorAlert message={error} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Navigation"
        description="Manage your site navigation menus."
        createHref="/cp/navigation/create"
      />

      {navigations.length === 0 ? (
        <EmptyState
          icon={Navigation}
          title="No navigations configured."
          description="Create a navigation or add definition files to resources/navigations/."
        />
      ) : (
        <div className="rounded-lg border divide-y">
          {navigations.map((nav) => (
            <div key={nav.handle} className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-accent/50">
              <Link
                href={`/cp/navigation/${nav.handle}`}
                className="flex items-center gap-3 min-w-0 flex-1"
              >
                <span className="text-sm font-medium truncate">{nav.title}</span>
                <span className="text-xs text-muted-foreground truncate">{nav.handle}</span>
              </Link>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  nativeButton={false}
                  render={<Link href={`/cp/navigation/${nav.handle}/edit`} />}
                >
                  <Pencil className="size-4" />
                </Button>
                <DeleteDialog
                  title="Delete navigation"
                  description={`Are you sure you want to delete "${nav.title}"? This cannot be undone.`}
                  onConfirm={() => handleDelete(nav.handle)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
