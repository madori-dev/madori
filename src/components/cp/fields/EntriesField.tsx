'use client'

import { useEffect, useState } from 'react'

import { MultiSelect, type MultiSelectOption } from '@/components/cp/multi-select'
import { FieldConfig } from '@/lib/blueprints/types'

interface FieldComponentProps {
  value: unknown
  onChange: (value: unknown) => void
  field: FieldConfig
  error?: string[]
}

export function EntriesField({ value, onChange, field, error }: FieldComponentProps) {
  const [options, setOptions] = useState<MultiSelectOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const selected = Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string'
      ? value.split(',').map((slug) => slug.trim()).filter(Boolean)
      : []
  const pickerOptions = [
    ...options,
    ...selected
      .filter((reference) => !options.some((option) => option.value === reference))
      .map((reference) => {
        // Old slug-only values remain readable. They deliberately are not
        // coerced: collection cannot be inferred safely after a collision.
        const legacyMatch = !reference.includes('::') ? options.find((option) => option.value.endsWith(`::${reference}`)) : undefined
        return legacyMatch
          ? { ...legacyMatch, value: reference, label: `${legacyMatch.label} · legacy reference` }
          : { value: reference, label: `${reference} · unavailable` }
      }),
  ]

  useEffect(() => {
    let cancelled = false

    async function loadEntries() {
      try {
        const collectionsRes = await fetch('/api/collections')
        if (!collectionsRes.ok) throw new Error('Failed to load collections')
        const collectionsJson = await collectionsRes.json()
        const collections = (collectionsJson.data ?? []) as Array<{ handle: string; title?: string }>
        const responses = await Promise.all(
          collections.map(async (collection) => {
            const res = await fetch(`/api/entries/${encodeURIComponent(collection.handle)}`)
            if (!res.ok) return []
            const json = await res.json()
            return ((json.data ?? []) as Array<{ slug: string; title?: string }>).map((entry) => ({
              // Collection-qualified identity prevents same-slug collisions.
              value: `${collection.handle}::${entry.slug}`,
              label: `${entry.title || entry.slug} · ${collection.title || collection.handle}`,
            }))
          })
        )
        if (!cancelled) {
          setOptions(responses.flat())
        }
      } catch {
        if (!cancelled) setLoadError('Could not load entries')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadEntries()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="flex flex-col gap-1.5">
      {field.display && (
        <label className="text-sm font-medium text-foreground">
          {field.display}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <MultiSelect
        options={pickerOptions}
        selected={selected}
        onChange={onChange}
        disabled={loading}
        placeholder={loading ? 'Loading entries…' : 'Select entries…'}
      />
      {loadError && <p className="text-xs text-destructive">{loadError}</p>}
      {error && error.length > 0 && <p className="text-xs text-destructive">{error[0]}</p>}
    </div>
  )
}
