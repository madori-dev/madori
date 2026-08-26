'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
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
import { CapabilityGate } from '@/components/cp/CapabilityGate'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validatePasswordPolicy } from '@/lib/auth/password-policy'

export default function CreateUserPage() {
  const router = useRouter()

  const [form, setForm] = useState({
    id: '',
    name: '',
    email: '',
    password: '',
    roles: [] as string[],
  })
  const [availableRoles, setAvailableRoles] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetch('/api/roles').then(async (response) => {
      if (!response.ok) throw new Error('Unable to load roles')
      const payload = await response.json() as { data?: Array<{ handle: string }> }
      setAvailableRoles((payload.data ?? []).map(role => role.handle))
    }).catch(() => setError('Unable to load available roles'))
  }, [])

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
    const passwordValidation = validatePasswordPolicy(form.password)
    if (!passwordValidation.valid) {
      setError(passwordValidation.message)
      return
    }
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error?.message || `Failed to create user: ${res.status}`)
      }

      router.push('/cp/users')
      toast.success('User created')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
      toast.error('Failed to create user')
    } finally {
      setSaving(false)
    }
  }

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
            <BreadcrumbPage>Create</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-bold tracking-tight">Create User</h1>

      {error && <ErrorAlert message={error} />}

      <Card className="max-w-lg">
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="id">ID</Label>
              <Input
                id="id"
                name="id"
                type="text"
                required
                value={form.id}
                onChange={handleChange}
                placeholder="e.g. john-doe"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                type="text"
                required
                value={form.name}
                onChange={handleChange}
                placeholder="Full name"
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
                placeholder="user@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                aria-describedby="password-help"
                value={form.password}
                onChange={handleChange}
                placeholder="••••••••"
              />
              <p id="password-help" className="text-sm text-muted-foreground">
                {PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} characters
              </p>
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

            <div className="flex items-center gap-3 pt-2">
              <CapabilityGate resource="users" action="create"><Button type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create User'}
              </Button></CapabilityGate>
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
