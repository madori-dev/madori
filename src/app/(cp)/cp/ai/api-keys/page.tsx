'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Key, Plus, Trash2, Ban } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { PageHeader } from '@/components/cp/PageHeader'

interface ApiKeyRecord {
  id: string
  label: string
  permissions: { resource: string; actions: string[]; scope?: string }[]
  createdAt: string
  lastUsedAt?: string
  revokedAt?: string
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/api-keys')
      if (res.ok) {
        const data = await res.json()
        setKeys(data)
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchKeys()
  }, [fetchKeys])

  async function handleRevoke(id: string) {
    setActionInProgress(id)
    try {
      const res = await fetch(`/api/ai/api-keys/${id}`, { method: 'PATCH' })
      if (res.ok) {
        await fetchKeys()
      }
    } finally {
      setActionInProgress(null)
    }
  }

  async function handleDelete(id: string) {
    setActionInProgress(id)
    try {
      const res = await fetch(`/api/ai/api-keys/${id}`, { method: 'DELETE' })
      if (res.ok) {
        await fetchKeys()
      }
    } finally {
      setActionInProgress(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="API Keys" description="Manage MCP API keys for external AI agents" />
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" nativeButton={false} render={<Link href="/cp/ai" />}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage MCP API keys for external AI agents
            </p>
          </div>
        </div>
        <Button nativeButton={false} render={<Link href="/cp/ai/api-keys/create" />}>
          <Plus className="size-4" />
          Create API Key
        </Button>
      </div>

      {keys.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Key className="size-12 text-muted-foreground/50" />
            <h2 className="mt-4 text-lg font-semibold">No API keys</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Create an API key to allow external AI agents to access your CMS content via the MCP server.
            </p>
            <Button className="mt-6" nativeButton={false} render={<Link href="/cp/ai/api-keys/create" />}>
              <Plus className="size-4" />
              Create API Key
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((apiKey) => {
                  const isRevoked = !!apiKey.revokedAt
                  const isBusy = actionInProgress === apiKey.id

                  return (
                    <TableRow key={apiKey.id}>
                      <TableCell className="font-medium">{apiKey.label}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(apiKey.createdAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(apiKey.lastUsedAt)}
                      </TableCell>
                      <TableCell>
                        {isRevoked ? (
                          <Badge variant="destructive">Revoked</Badge>
                        ) : (
                          <Badge variant="default">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!isRevoked && (
                            <AlertDialog>
                              <AlertDialogTrigger
                                render={
                                  <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    disabled={isBusy}
                                  />
                                }
                              >
                                <Ban className="size-3.5" />
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Revoke API key</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will immediately prevent any agent using this key from accessing the MCP server. This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    variant="destructive"
                                    onClick={() => handleRevoke(apiKey.id)}
                                  >
                                    Revoke
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  disabled={isBusy}
                                />
                              }
                            >
                              <Trash2 className="size-3.5" />
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete API key</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the API key &ldquo;{apiKey.label}&rdquo;. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  variant="destructive"
                                  onClick={() => handleDelete(apiKey.id)}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
