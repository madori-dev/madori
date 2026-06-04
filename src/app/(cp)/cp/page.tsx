'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  FolderOpen,
  Tags,
  Globe,
  Navigation,
  Image,
  FileText,
  Users,
  Clock,
  ArrowRight,
} from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface RecentEntry {
  title: string
  slug: string
  collection: string
  collectionTitle: string
  status: 'published' | 'draft'
  updatedAt: string
}

const quickAccessSections = [
  { label: 'Collections', href: '/cp/collections', description: 'Manage structured content', icon: FolderOpen },
  { label: 'Taxonomies', href: '/cp/taxonomies', description: 'Organize with categories and tags', icon: Tags },
  { label: 'Globals', href: '/cp/globals', description: 'Edit site-wide settings', icon: Globe },
  { label: 'Navigation', href: '/cp/navigation', description: 'Build navigation menus', icon: Navigation },
  { label: 'Assets', href: '/cp/assets', description: 'Upload and manage files', icon: Image },
  { label: 'Forms', href: '/cp/forms', description: 'View form submissions', icon: FileText },
  { label: 'Users', href: '/cp/users', description: 'Manage users and roles', icon: Users },
]

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function RecentActivitySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-2">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchRecentActivity() {
      try {
        const res = await fetch('/api/dashboard/recent')
        if (res.ok) {
          const json = await res.json()
          setRecentEntries(json.data ?? [])
        }
      } catch {
        // Silently fail — dashboard is non-critical
      } finally {
        setLoading(false)
      }
    }
    fetchRecentActivity()
  }, [])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Welcome to the Madori Control Panel.
        </p>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </div>
          <CardDescription>
            Recently modified content entries across all collections.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <RecentActivitySkeleton />
          ) : recentEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No recent activity. Start by creating content in a collection.
            </p>
          ) : (
            <div className="divide-y">
              {recentEntries.map((entry) => (
                <Link
                  key={`${entry.collection}-${entry.slug}`}
                  href={`/cp/collections/${entry.collection}/${entry.slug}`}
                  className="flex items-center justify-between py-2.5 group cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                        {entry.title}
                      </span>
                      <Badge
                        variant={entry.status === 'published' ? 'default' : 'secondary'}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {entry.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {entry.collectionTitle}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {formatRelativeTime(entry.updatedAt)}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Access */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Quick Access</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {quickAccessSections.map((section) => (
            <Link key={section.href} href={section.href} className="group">
              <Card className="h-full transition-colors hover:bg-accent/50 cursor-pointer">
                <CardHeader className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                      <section.icon className="size-4" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">{section.label}</CardTitle>
                      <CardDescription className="text-xs">
                        {section.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
