'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { MoreVertical, Settings, FileText, Trash2, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/cp/EmptyState'
import { ErrorAlert } from '@/components/cp/ErrorAlert'
import { ListSkeleton } from '@/components/cp/ListSkeleton'
import { DeleteDialog } from '@/components/cp/DeleteDialog'

interface Entry {
  title: string
  slug: string
  status: 'published' | 'draft'
  author?: string
  createdAt: string
  updatedAt: string
}

export default function EntriesListPage() {
  const params = useParams()
  const router = useRouter()
  const handle = params.handle as string

  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  useEffect(() => {
    fetchEntries()
  }, [handle])

  async function fetchEntries() {
    try {
      setLoading(true)
      const res = await fetch(`/api/entries/${handle}`)
      if (!res.ok) {
        throw new Error(`Failed to fetch entries: ${res.status}`)
      }
      const json = await res.json()
      setEntries(json.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entries')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(slug: string) {
    const res = await fetch(`/api/entries/${handle}/${slug}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      throw new Error(`Failed to delete entry: ${res.status}`)
    }
    setEntries((prev) => prev.filter((e) => e.slug !== slug))
  }

  async function handleDeleteCollection() {
    const res = await fetch(`/api/collections/${handle}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      throw new Error(`Failed to delete collection: ${res.status}`)
    }
    toast.success('Collection deleted')
    router.push('/cp/collections')
  }

  if (loading) return <ListSkeleton />
  if (error) return <ErrorAlert message={error} />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight capitalize">{handle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button nativeButton={false} render={<Link href={`/cp/collections/${handle}/create`} />}>
            Create Entry
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="icon" />}
            >
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => router.push(`/cp/collections/${handle}/configure`)}
              >
                <Settings className="size-4" />
                Configure Collection
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => router.push(`/cp/blueprints/collections/${handle}`)}
              >
                <FileText className="size-4" />
                Edit Blueprint
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                className="cursor-pointer"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="size-4" />
                Delete Collection
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete collection</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete the &ldquo;{handle}&rdquo; collection? This will remove the blueprint and cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleDeleteCollection}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No entries yet."
        >
          <Link
            href={`/cp/collections/${handle}/create`}
            className="mt-2 text-sm font-medium text-foreground underline hover:no-underline"
          >
            Create your first entry
          </Link>
        </EmptyState>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.slug}>
                  <TableCell>
                    <Link
                      href={`/cp/collections/${handle}/${entry.slug}`}
                      className="font-medium hover:underline"
                    >
                      {entry.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.slug}
                  </TableCell>
                  <TableCell>
                    <Badge variant={entry.status === 'published' ? 'default' : 'secondary'}>
                      {entry.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.updatedAt
                      ? new Date(entry.updatedAt).toLocaleDateString()
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/cp/collections/${handle}/${entry.slug}`} />}
                      >
                        Edit
                      </Button>
                      <DeleteDialog
                        title="Delete entry"
                        description={`Are you sure you want to delete "${entry.title}"? This cannot be undone.`}
                        onConfirm={() => handleDelete(entry.slug)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
