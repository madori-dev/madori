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

interface User {
  id: string
  email: string
  name: string
  roles: string[]
  createdAt: string
  lastLogin?: string
}

export default function UsersListPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchUsers()
  }, [])

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
        createHref="/cp/users/create"
        createLabel="Create User"
      />

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users yet."
        >
          <Link
            href="/cp/users/create"
            className="mt-2 text-sm font-medium text-foreground underline hover:no-underline"
          >
            Create your first user
          </Link>
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
                      <Button
                        variant="ghost"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/cp/users/${user.id}`} />}
                      >
                        Edit
                      </Button>
                      <DeleteDialog
                        title="Delete user"
                        description={`Are you sure you want to delete "${user.name}"? This cannot be undone.`}
                        onConfirm={() => handleDelete(user.id)}
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
