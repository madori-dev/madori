'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'

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
import { PageHeader } from '@/components/cp/PageHeader'
import { EmptyState } from '@/components/cp/EmptyState'
import { ErrorAlert } from '@/components/cp/ErrorAlert'
import { ListSkeleton } from '@/components/cp/ListSkeleton'
import { DeleteDialog } from '@/components/cp/DeleteDialog'
import { CapabilityGate } from '@/components/cp/CapabilityGate'
import { useCapabilities } from '@/components/cp/use-capabilities'

interface User {
  id: string
  email: string
  name: string
  roles: string[]
  createdAt: string
  lastLogin?: string
}

export default function UsersListPage() {
  const capabilities = useCapabilities()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchUsers() {
    try {
      setLoading(true)
      const res = await fetch('/api/users')
      if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`)
      const json = await res.json()
      setUsers(json.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    queueMicrotask(() => { void fetchUsers() })
  }, [])

  async function handleDelete(userId: string) {
    const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Failed to delete user: ${res.status}`)
    setUsers((prev) => prev.filter((u) => u.id !== userId))
  }

  if (loading) return <ListSkeleton />
  if (error) return <ErrorAlert message={error} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description={`${users.length} ${users.length === 1 ? 'user' : 'users'}`}
        createHref={capabilities?.['users:create'] ? '/cp/users/create' : undefined}
        createLabel="Create User"
      />
      <CapabilityGate resource="users" action="edit"><div><Button variant="outline" nativeButton={false} render={<Link href="/cp/users/roles" />}>Manage roles</Button></div></CapabilityGate>

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users yet."
        >
          <CapabilityGate resource="users" action="create"><Link
            href="/cp/users/create"
            className="mt-2 text-sm font-medium text-foreground underline hover:no-underline"
          >
            Create your first user
          </Link></CapabilityGate>
        </EmptyState>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <Link
                      href={`/cp/users/${user.id}`}
                      className="font-medium hover:underline"
                    >
                      {user.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <Badge key={role} variant="secondary">
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.lastLogin
                      ? new Date(user.lastLogin).toLocaleDateString()
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <CapabilityGate resource="users" action="edit"><Button
                        variant="ghost"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/cp/users/${user.id}`} />}
                      >
                        Edit
                      </Button></CapabilityGate>
                      <CapabilityGate resource="users" action="delete"><DeleteDialog
                        title="Delete user"
                        description={`Are you sure you want to delete "${user.name}"? This cannot be undone.`}
                        onConfirm={() => handleDelete(user.id)}
                      /></CapabilityGate>
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
