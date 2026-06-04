'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { FileText } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
import { DeleteDialog } from '@/components/cp/DeleteDialog'

interface FormSubmission {
  id: string
  form: string
  submittedAt: string
  data: Record<string, unknown>
}

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso)
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

export default function SubmissionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const handle = params.handle as string
  const id = params.id as string

  const [submission, setSubmission] = useState<FormSubmission | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchSubmission() {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch(`/api/forms/${handle}/submissions/${id}`)
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('Submission not found')
          }
          throw new Error(`Failed to fetch submission: ${res.status}`)
        }
        const json = await res.json()
        setSubmission(json.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load submission')
      } finally {
        setLoading(false)
      }
    }
    fetchSubmission()
  }, [handle, id])

  async function handleDelete() {
    const res = await fetch(`/api/forms/${handle}/submissions/${id}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      throw new Error(json?.error?.message || `Failed to delete submission: ${res.status}`)
    }
    toast.success('Submission deleted')
    router.push(`/cp/forms/${handle}`)
  }

  if (loading) return <ListSkeleton />
  if (error) return <ErrorAlert message={error} />
  if (!submission) return <ErrorAlert message="Submission not found" />

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
            <BreadcrumbLink render={<Link href={`/cp/forms/${handle}`} />}>
              <span className="capitalize">{handle}</span>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Submission</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Submission Detail</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatTimestamp(submission.submittedAt)}
          </p>
        </div>
        <DeleteDialog
          title="Delete submission"
          description="Are you sure you want to delete this submission? This action cannot be undone."
          onConfirm={handleDelete}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-1 mb-6">
            <div className="flex items-center gap-3">
              <FileText className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                ID: <span className="font-mono">{submission.id}</span>
              </span>
            </div>
            <div className="flex items-center gap-3 pl-7">
              <Badge variant="secondary">received</Badge>
            </div>
          </div>

          <div className="border-t pt-4">
            <h2 className="text-sm font-semibold mb-4">Submitted Data</h2>
            <dl className="space-y-3">
              {Object.entries(submission.data).map(([key, value]) => (
                <div key={key} className="grid grid-cols-[180px_1fr] gap-3">
                  <dt className="text-sm font-medium text-muted-foreground truncate">
                    {key}
                  </dt>
                  <dd className="text-sm text-foreground">
                    {typeof value === 'object' ? (
                      <pre className="font-mono text-xs bg-muted rounded p-2 overflow-x-auto whitespace-pre-wrap">
                        {formatFieldValue(value)}
                      </pre>
                    ) : (
                      formatFieldValue(value)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
