'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
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

interface NavigationItem {
  title: string
  url?: string
  entry?: string
  children?: NavigationItem[]
}

interface NavigationData {
  items: NavigationItem[]
}

export default function EditNavigationPage() {
  const params = useParams()
  const handle = params.handle as string

  const [jsonContent, setJsonContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    async function fetchNavigation() {
      try {
        const res = await fetch(`/api/content/navigations/${handle}`)
        if (!res.ok) throw new Error(`Failed to fetch navigation: ${res.status}`)
        const json = await res.json()
        const data: NavigationData = json.data ?? { items: [] }
        setJsonContent(JSON.stringify(data, null, 2))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load navigation')
      } finally {
        setLoading(false)
      }
    }
    fetchNavigation()
  }, [handle])

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault()
    setSaving(true)
    setSuccess(false)
    setError(null)

    try {
      let payload: NavigationData
      try {
        payload = JSON.parse(jsonContent)
      } catch {
        throw new Error('Invalid JSON. Please check the format.')
      }

      if (!payload.items || !Array.isArray(payload.items)) {
        throw new Error('Navigation data must have an "items" array.')
      }

      const res = await fetch(`/api/content/navigations/${handle}/_`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error || `Failed to save: ${res.status}`)
      }
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save navigation')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <ListSkeleton rows={4} />
  if (error && !jsonContent) return <ErrorAlert message={error} />

  let parsedItems: NavigationItem[] = []
  try {
    const parsed = JSON.parse(jsonContent)
    parsedItems = parsed?.items ?? []
  } catch {
    // invalid JSON — will show error on save
  }

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
        <h1 className="text-2xl font-bold tracking-tight capitalize">{handle}</h1>
        <Button onClick={() => handleSave()} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-sm text-green-700">Navigation saved successfully.</p>
        </div>
      )}

      {error && jsonContent && <ErrorAlert message={error} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* JSON Editor */}
        <Card>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="nav-json">Navigation Data (JSON)</Label>
              <textarea
                id="nav-json"
                value={jsonContent}
                onChange={(e) => setJsonContent(e.target.value)}
                rows={20}
                spellCheck={false}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <p className="text-xs text-muted-foreground">
                Edit the navigation structure as JSON with an &quot;items&quot; array.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tree Preview */}
        <Card>
          <CardContent>
            <Label className="mb-2">Preview</Label>
            {parsedItems.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="text-sm text-muted-foreground">No navigation items.</p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <ul className="divide-y py-1">
                  {parsedItems.map((item, idx) => (
                    <NavPreviewItem key={idx} item={item} depth={0} />
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function NavPreviewItem({ item, depth }: { item: NavigationItem; depth: number }) {
  return (
    <li>
      <div
        className="flex items-center gap-2 rounded px-3 py-2 hover:bg-muted/50 transition-colors"
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
      >
        {item.children && item.children.length > 0 ? (
          <ChevronRight className="size-3 text-muted-foreground shrink-0" />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span className="text-sm font-medium">{item.title}</span>
        {item.url && (
          <span className="text-xs text-muted-foreground ml-2">{item.url}</span>
        )}
        {item.entry && (
          <Badge variant="secondary" className="text-[10px] ml-1">
            {item.entry}
          </Badge>
        )}
      </div>
      {item.children && item.children.length > 0 && (
        <ul>
          {item.children.map((child, idx) => (
            <NavPreviewItem key={idx} item={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}
