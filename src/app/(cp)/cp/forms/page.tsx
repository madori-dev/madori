'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { FileText, Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/cp/PageHeader'
import { EmptyState } from '@/components/cp/EmptyState'
import { ErrorAlert } from '@/components/cp/ErrorAlert'
import { ListSkeleton } from '@/components/cp/ListSkeleton'
import { DeleteDialog } from '@/components/cp/DeleteDialog'

interface Form {
  handle: string
  title: string
  blueprint?: string
  honeypot?: boolean
  store_submissions?: boolean
}

export default function FormsListPage() {
  const [forms, setForms] = useState<Form[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchForms() {
    try {
      setLoading(true)
      const res = await fetch('/api/definitions/forms')
      if (!res.ok) throw new Error(`Failed to fetch forms: ${res.status}`)
      const json = await res.json()
      setForms(json.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load forms')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchForms()
  }, [])

  async function handleDelete(handle: string) {
    const res = await fetch(`/api/definitions/forms/${handle}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Failed to delete form: ${res.status}`)
    await fetchForms()
  }

  if (loading) return <ListSkeleton />
  if (error) return <ErrorAlert message={error} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Forms"
        description="Manage form definitions and submissions."
        createHref="/cp/forms/create"
      />

      {forms.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No forms configured."
          description="Create a form or add definition files to resources/forms/."
        />
      ) : (
        <div className="rounded-lg border divide-y">
          {forms.map((form) => (
            <div key={form.handle} className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-accent/50">
              <Link
                href={`/cp/forms/${form.handle}`}
                className="flex items-center gap-3 min-w-0 flex-1"
              >
                <span className="text-sm font-medium truncate">{form.title}</span>
                <span className="text-xs text-muted-foreground truncate">{form.handle}</span>
              </Link>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  nativeButton={false}
                  render={<Link href={`/cp/forms/${form.handle}/edit`} />}
                >
                  <Pencil className="size-4" />
                </Button>
                <DeleteDialog
                  title="Delete form"
                  description={`Are you sure you want to delete "${form.title}"? This cannot be undone.`}
                  onConfirm={() => handleDelete(form.handle)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
