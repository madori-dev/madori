'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
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
import { FieldRenderer } from '@/components/cp/fields/FieldRenderer'

import type { Blueprint, FieldDefinition } from '@/lib/blueprints/types'

export default function EditGlobalPage() {
  const params = useParams()
  const handle = params.handle as string

  const [blueprint, setBlueprint] = useState<Blueprint | null>(null)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [blueprintHandle, setBlueprintHandle] = useState<string | null>(null)

  useEffect(() => {
    async function loadGlobal() {
      try {
        // 1. Get the global definition to find its blueprint
        const defRes = await fetch(`/api/definitions/globals/${handle}`)
        if (defRes.ok) {
          const defJson = await defRes.json()
          const bpHandle = defJson.data?.blueprint
          if (bpHandle) {
            setBlueprintHandle(bpHandle)
            // 2. Load the blueprint
            const bpRes = await fetch(`/api/blueprints/globals/${bpHandle}`)
            if (bpRes.ok) {
              const bpJson = await bpRes.json()
              setBlueprint(bpJson.data)
            }
          }
        }

        // 3. Load existing content
        const contentRes = await fetch(`/api/content/globals/${handle}`)
        if (contentRes.ok) {
          const contentJson = await contentRes.json()
          setFormData(contentJson.data ?? {})
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load global')
      } finally {
        setLoading(false)
      }
    }
    loadGlobal()
  }, [handle])

  function handleFieldChange(fieldHandle: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [fieldHandle]: value }))
  }

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault()
    setSaving(true)
    setSuccess(false)
    setError(null)

    try {
      const res = await fetch(`/api/content/globals/${handle}/_`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error || `Failed to save: ${res.status}`)
      }
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save global')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <ListSkeleton rows={4} />

  // Collect all fields from blueprint
  const allFields: FieldDefinition[] = []
  if (blueprint) {
    for (const tab of Object.values(blueprint.tabs)) {
      for (const field of tab.fields) {
        allFields.push(field)
      }
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/cp/globals" />}>
              Globals
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="capitalize">{handle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight capitalize">{handle}</h1>
        <Button onClick={() => handleSave()} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-sm text-green-700">Global saved successfully.</p>
        </div>
      )}

      {error && <ErrorAlert message={error} />}

      {allFields.length > 0 ? (
        <Card>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-5">
              {allFields.map((fieldDef) => (
                <FieldRenderer
                  key={fieldDef.handle}
                  fieldDefinition={fieldDef}
                  value={formData[fieldDef.handle]}
                  onChange={(value) => handleFieldChange(fieldDef.handle, value)}
                />
              ))}
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <div className="py-6 text-center">
              <p className="text-sm text-muted-foreground">
                {blueprintHandle
                  ? `Blueprint "${blueprintHandle}" has no fields defined.`
                  : 'No blueprint assigned to this global.'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {blueprintHandle
                  ? <Link href={`/cp/blueprints/globals/${blueprintHandle}`} className="underline hover:no-underline">Edit the blueprint</Link>
                  : <Link href={`/cp/globals/${handle}/edit`} className="underline hover:no-underline">Assign a blueprint</Link>}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
