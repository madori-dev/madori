'use client'

import Link from 'next/link'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { FileText, Download, ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

interface FormSubmission {
  id: string
  form: string
  submittedAt: string
  data: Record<string, unknown>
}

interface SubmissionListResult {
  submissions: FormSubmission[]
  total: number
  page: number
  perPage: number
}

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso)
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function getSubmissionSummary(data: Record<string, unknown>): string {
  const values = Object.values(data)
  const firstString = values.find((v) => typeof v === 'string' && v.length > 0)
  if (typeof firstString === 'string') {
    return firstString.length > 60 ? firstString.slice(0, 60) + '…' : firstString
  }
  const keys = Object.keys(data)
  return keys.length > 0 ? `${keys.length} field${keys.length === 1 ? '' : 's'}` : '—'
}

export default function FormSubmissionsPage() {
  const params = useParams()
  const handle = params.handle as string

  const [result, setResult] = useState<SubmissionListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const perPage = 20

  const fetchSubmissions = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(
        `/api/forms/${handle}/submissions?page=${page}&perPage=${perPage}`
      )
      if (!res.ok) throw new Error(`Failed to fetch submissions: ${res.status}`)
      const json = await res.json()
      setResult(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submissions')
    } finally {
      setLoading(false)
    }
  }, [handle, page])

  useEffect(() => {
    fetchSubmissions()
  }, [fetchSubmissions])

  async function handleDelete(submissionId: string) {
    const res = await fetch(`/api/forms/${handle}/submissions/${submissionId}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      throw new Error(json?.error?.message || `Failed to delete submission: ${res.status}`)
    }
    await fetchSubmissions()
  }

  function handleExportCsv() {
    window.open(`/api/forms/${handle}/export/csv`, '_blank')
  }

  function handleExportJson() {
    window.open(`/api/forms/${handle}/export/json`, '_blank')
  }

  const totalPages = result ? Math.ceil(result.total / perPage) : 0

  if (loading && !result) return <ListSkeleton />
  if (error && !result) return <ErrorAlert message={error} />

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

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight capitalize">{handle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result?.total ?? 0} {(result?.total ?? 0) === 1 ? 'submission' : 'submissions'}
          </p>
        </div>
        {result && result.total > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="size-3.5" data-icon="inline-start" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportJson}>
              <Download className="size-3.5" data-icon="inline-start" />
              JSON
            </Button>
          </div>
        )}
      </div>

      {error && <ErrorAlert message={error} />}

      {!result || result.total === 0 ? (
        <EmptyState
          icon={FileText}
          title="No submissions yet"
          description="Submissions will appear here when visitors submit this form on your frontend."
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead className="w-[70px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.submissions.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell>
                      <Link
                        href={`/cp/forms/${handle}/submissions/${submission.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {formatTimestamp(submission.submittedAt)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">received</Badge>
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground">
                      {getSubmissionSummary(submission.data)}
                    </TableCell>
                    <TableCell>
                      <DeleteDialog
                        title="Delete submission"
                        description="Are you sure you want to delete this submission? This action cannot be undone."
                        onConfirm={() => handleDelete(submission.id)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
