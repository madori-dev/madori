import { NextResponse } from 'next/server'
import type { ContentEngine } from '@/lib/content/engine'
import type { Entry } from '@/lib/types'

export interface RecentEntry {
  title: string
  slug: string
  collection: string
  collectionTitle: string
  status: 'published' | 'draft'
  updatedAt: string
}

export function createDashboardHandlers(contentEngine: ContentEngine) {
  /**
   * GET /api/dashboard/recent — returns the most recently modified entries
   * across all collections, sorted by updatedAt descending.
   */
  async function handleRecentActivity(): Promise<NextResponse> {
    try {
      const collections = await contentEngine.listCollections()
      const allEntries: (Entry & { collectionTitle: string })[] = []

      for (const collection of collections) {
        try {
          const entries = await contentEngine.listEntries(collection.handle)
          for (const entry of entries) {
            allEntries.push({ ...entry, collectionTitle: collection.title })
          }
        } catch {
          // Skip collections that fail to load (e.g. missing directory)
        }
      }

      // Sort by updatedAt descending, take most recent 10
      allEntries.sort((a, b) => {
        const dateA = new Date(a.updatedAt).getTime()
        const dateB = new Date(b.updatedAt).getTime()
        return dateB - dateA
      })

      const recent: RecentEntry[] = allEntries.slice(0, 10).map((entry) => ({
        title: entry.title,
        slug: entry.slug,
        collection: entry.collection,
        collectionTitle: entry.collectionTitle,
        status: entry.status,
        updatedAt: entry.updatedAt,
      }))

      return NextResponse.json({ data: recent })
    } catch {
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch recent activity' } },
        { status: 500 }
      )
    }
  }

  return {
    handleRecentActivity,
  }
}
