'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

export default function CreateFieldsetPage() {
  const router = useRouter()
  const [handle, setHandle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!handle.trim()) {
      setError('Handle is required')
      return
    }

    const sanitized = handle.toLowerCase().replace(/[^a-z0-9_-]/g, '_')
    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/fieldsets/${sanitized}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: [] }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: { message: 'Failed to create fieldset' } }))
        setError(json.error?.message || `Failed to create fieldset (${res.status})`)
        return
      }

      router.push(`/cp/fieldsets/${sanitized}`)
      toast.success('Fieldset created')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      toast.error('Failed to create fieldset')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/cp/fieldsets" />}>
              Fieldsets
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Create</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-bold tracking-tight">Create Fieldset</h1>

      {error && <ErrorAlert message={error} />}

      <Card className="max-w-lg">
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="handle">
                Handle <span className="text-destructive">*</span>
              </Label>
              <Input
                id="handle"
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="e.g. hero_block"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Used as the filename and reference handle.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create'}
              </Button>
              <Button variant="ghost" nativeButton={false} render={<Link href="/cp/fieldsets" />}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
