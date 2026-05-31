'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ChevronRight, FolderOpen } from 'lucide-react'

import { PageHeader } from '@/components/cp/PageHeader'
import { EmptyState } from '@/components/cp/EmptyState'
import { ErrorAlert } from '@/components/cp/ErrorAlert'
import { ListSkeleton } from '@/components/cp/ListSkeleton'

interface Collection {
  title: string
  handle: string
  route?: string
  blueprint: string
}

export default function CollectionsListPage() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchCollections() {
      try {
        const res = await fetch('/api/collections')
        if (!res.ok) {
          throw new Error(`Failed to fetch collections: ${res.status}`)
        }
        const json = await res.json()
        setCollections(json.data ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load collections')
      } finally {
        setLoading(false)
      }
    }
    fetchCollections()
  }, [])

  if (loading) return <ListSkeleton />
  if (error) return <ErrorAlert message={error} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Collections"
        description="Manage your structured content collections."
        createHref="/cp/collections/create"
      />

      {collections.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No collections configured."
          description="Create a collection or add blueprint files to resources/blueprints/collections/."
        />
      ) : (
        <div className="rounded-lg border divide-y">
          {collections.map((collection) => (
            <Link
              key={collection.handle}
              href={`/cp/collections/${collection.handle}`}
              className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-accent/50"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm font-medium truncate">{collection.title}</span>
                <span className="text-xs text-muted-foreground truncate">{collection.handle}</span>
                {collection.route && (
                  <span className="text-xs text-muted-foreground truncate hidden sm:inline">{collection.route}</span>
                )}
              </div>
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
