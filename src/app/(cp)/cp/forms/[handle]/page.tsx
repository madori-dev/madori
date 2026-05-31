'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { FileText } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
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

interface Submission {
  id: string
  [key: string]: unknown
}

export default function FormSubmissionsPage() {
  const params = useParams()
  const handle = params.handle as string

  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchSubmissions() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/content/forms/${handle}`)
      if (!res.ok) throw new Error(`Failed to fetch submissions: ${res.status}`)
      const json = await res.json()
      setSubmissions(json.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submissions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSubmissions()
  }, [handle])

  async function handleDelete(submissionId: string) {
    const res = await fetch(`/api/content/forms/${handle}/${submissionId}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      throw new Error(json?.error || `Failed to delete submission: ${res.status}`)
    }
    await fetchSubmissions()
  }

  if (loading) return <ListSkeleton />
  if (error && submissions.length === 0) return <ErrorAlert message={error} />

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/cp/forms" />}>
              Forms
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="capitalize">{handle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-bold tracking-tight capitalize">{handle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {submissions.length} {submissions.length === 1 ? 'submission' : 'submissions'}
        </p>
      </div>

      {error && <ErrorAlert message={error} />}

      {submissions.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No submissions yet."
        />
      ) : (
        <div className="space-y-3">
          {submissions.map((submission) => {
            const { id, ...data } = submission
            return (
              <Card key={id} size="sm">
                <CardContent>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground font-mono">{id}</span>
                    <DeleteDialog
                      title="Delete submission"
                      description="Are you sure you want to delete this submission? This cannot be undone."
                      onConfirm={() => handleDelete(id)}
                    />
                  </div>
                  <dl className="space-y-1.5">
                    {Object.entries(data).map(([key, value]) => (
                      <div key={key} className="flex gap-3">
                        <dt className="text-sm font-medium text-muted-foreground min-w-[100px]">
                          {key}
                        </dt>
                        <dd className="text-sm text-foreground">
                          {typeof value === 'object'
                            ? JSON.stringify(value)
                            : String(value ?? '—')}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
