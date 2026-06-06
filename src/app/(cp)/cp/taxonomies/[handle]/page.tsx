'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Tags, Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { EmptyState } from '@/components/cp/EmptyState'
import { ErrorAlert } from '@/components/cp/ErrorAlert'
import { ListSkeleton } from '@/components/cp/ListSkeleton'
import { DeleteDialog } from '@/components/cp/DeleteDialog'

interface Term {
  id: string
  title?: string
  slug?: string
  [key: string]: unknown
}

export default function TaxonomyTermsPage() {
  const params = useParams()
  const handle = params.handle as string

  const [terms, setTerms] = useState<Term[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchTerms() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/content/taxonomies/${handle}`)
      if (!res.ok) throw new Error(`Failed to fetch terms: ${res.status}`)
      const json = await res.json()
      setTerms(json.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load terms')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTerms()
  }, [handle])

  async function handleDelete(termId: string) {
    const res = await fetch(`/api/content/taxonomies/${handle}/${termId}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      throw new Error(json?.error || `Failed to delete term: ${res.status}`)
    }
    await fetchTerms()
  }

  if (loading) return <ListSkeleton />
  if (error && terms.length === 0) return <ErrorAlert message={error} />

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/cp/taxonomies" />}>
              Taxonomies
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="capitalize">{handle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight capitalize">{handle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {terms.length} {terms.length === 1 ? 'term' : 'terms'}
          </p>
        </div>
        <Button nativeButton={false} render={<Link href={`/cp/taxonomies/${handle}/create`} />}>
          Add term
        </Button>
      </div>

      {error && <ErrorAlert message={error} />}

      {terms.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No terms yet."
          description={`Create a term or add files to content/taxonomies/${handle}/.`}
        />
      ) : (
        <div className="space-y-2">
          {terms.map((term) => (
            <Card key={term.id} className="transition-colors hover:bg-accent/50" size="sm">
              <CardHeader className="flex-row items-center justify-between py-3">
                <Link
                  href={`/cp/taxonomies/${handle}/${term.id}/edit`}
                  className="flex-1 cursor-pointer"
                >
                  <CardTitle className="text-sm">{term.title || term.id}</CardTitle>
                  <CardDescription className="text-xs">{term.slug || term.id}</CardDescription>
                </Link>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    nativeButton={false}
                    render={<Link href={`/cp/taxonomies/${handle}/${term.id}/edit`} />}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <DeleteDialog
                    title="Delete term"
                    description="Are you sure you want to delete this term? This cannot be undone."
                    onConfirm={() => handleDelete(term.id)}
                  />
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
