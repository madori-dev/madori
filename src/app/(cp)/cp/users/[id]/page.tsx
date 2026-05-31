'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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

interface UserData {
  id: string
  email: string
  name: string
  roles: string[]
  createdAt: string
  lastLogin?: string
}

export default function EditUserPage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.id as string

  const [user, setUser] = useState<UserData | null>(null)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    roles: [] as string[],
  })
  const [availableRoles, setAvailableRoles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    setAvailableRoles(['admin', 'editor'])
  }, [])

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch(`/api/users/${userId}`)
        if (!res.ok) throw new Error(`Failed to fetch user: ${res.status}`)
        const json = await res.json()
        const data = json.data as UserData
        setUser(data)
        setForm({
          name: data.name,
          email: data.email,
          password: '',
          roles: data.roles,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load user')
      } finally {
        setLoading(false)
      }
    }
    fetchUser()
  }, [userId])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function handleRoleToggle(role: string, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      roles: checked
        ? [...prev.roles, role]
        : prev.roles.filter((r) => r !== role),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        roles: form.roles,
      }
      if (form.password) {
        payload.password = form.password
      }

      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error?.message || `Failed to update user: ${res.status}`)
      }

      setSuccess(true)
      setForm((prev) => ({ ...prev, password: '' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <ListSkeleton rows={4} />
  if (error && !user) return <ErrorAlert message={error} />

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/cp/users" />}>
              Users
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{user?.name || userId}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-bold tracking-tight">Edit User</h1>

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-sm text-green-700">User updated successfully.</p>
        </div>
      )}

      {error && user && <ErrorAlert message={error} />}

      <Card className="max-w-lg">
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                type="text"
                required
                value={form.name}
                onChange={handleChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                value={form.email}
                onChange={handleChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Leave blank to keep current"
              />
            </div>

            <div className="space-y-3">
              <Label>Roles</Label>
              <div className="flex flex-wrap gap-4">
                {availableRoles.map((role) => (
                  <div key={role} className="flex items-center gap-2">
                    <Checkbox
                      id={`role-${role}`}
                      checked={form.roles.includes(role)}
                      onCheckedChange={(checked) => handleRoleToggle(role, checked === true)}
                    />
                    <Label htmlFor={`role-${role}`} className="font-normal">
                      {role}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {user && (
              <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground space-y-0.5">
                <p>ID: {user.id}</p>
                <p>Created: {new Date(user.createdAt).toLocaleString()}</p>
                {user.lastLogin && (
                  <p>Last login: {new Date(user.lastLogin).toLocaleString()}</p>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
              <Button variant="ghost" nativeButton={false} render={<Link href="/cp/users" />}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
