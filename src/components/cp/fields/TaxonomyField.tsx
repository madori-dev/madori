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

/**
 * Parse a taxonomy field value into an array of trimmed, non-empty term strings.
 */
function parseTerms(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String).filter(Boolean)
  if (typeof val === 'string') return val.split(',').map((t) => t.trim()).filter(Boolean)
  return []
}

/**
 * Enforce max_items limit: truncates terms array to at most maxItems entries.
 * A maxItems of 0 or undefined means unlimited.
 */
function enforceMaxItems(terms: string[], maxItems: number | undefined): string[] {
  if (!maxItems || maxItems <= 0) return terms
  return terms.slice(0, maxItems)
}

export function TaxonomyField({ value, onChange, field, error }: FieldComponentProps) {
  const [options, setOptions] = useState<MultiSelectOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const maxItems = (field.options?.max_items as number | undefined) ?? 0
  const terms = parseTerms(value)
  const isAtLimit = maxItems > 0 && terms.length >= maxItems
  const pickerOptions = [
    ...options,
    ...terms
      .filter((slug) => !options.some((option) => option.value === slug))
      .map((slug) => ({ value: slug, label: `${slug} · unavailable` })),
  ]

  useEffect(() => {
    let cancelled = false

    async function loadTerms() {
      try {
        const configuredTaxonomy = field.options?.taxonomy as string | undefined
        let taxonomies: Array<{ handle: string; title?: string }>
        if (configuredTaxonomy) {
          taxonomies = [{ handle: configuredTaxonomy }]
        } else {
          const res = await fetch('/api/taxonomies')
          if (!res.ok) throw new Error('Failed to load taxonomies')
          const json = await res.json()
          taxonomies = json.data ?? []
        }

        const responses = await Promise.all(
          taxonomies.map(async (taxonomy) => {
            const res = await fetch(`/api/taxonomies/${encodeURIComponent(taxonomy.handle)}/terms`)
            if (!res.ok) return []
            const json = await res.json()
            return ((json.data ?? []) as Array<{ slug: string; title?: string }>).map((term) => ({
              value: term.slug,
              label: configuredTaxonomy
                ? term.title || term.slug
                : `${term.title || term.slug} · ${taxonomy.title || taxonomy.handle}`,
            }))
          })
        )
        if (!cancelled) {
          const unique = new Map(responses.flat().map((option) => [option.value, option]))
          setOptions([...unique.values()])
        }
      } catch {
        if (!cancelled) setLoadError('Could not load taxonomy terms')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadTerms()
    return () => { cancelled = true }
  }, [field.options?.taxonomy])

  return (
    <div className="flex flex-col gap-1">
      {field.display && (
        <label className="text-sm font-medium text-foreground">
          {field.display}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <MultiSelect
        options={pickerOptions}
        selected={terms}
        onChange={(selected) => onChange(enforceMaxItems(selected, maxItems))}
        disabled={loading}
        placeholder={loading ? 'Loading terms…' : 'Select taxonomy terms…'}
      />
      {isAtLimit && <p className="text-xs text-muted-foreground">Maximum of {maxItems} term{maxItems === 1 ? '' : 's'} reached</p>}
      {loadError && <p className="text-xs text-destructive">{loadError}</p>}
      {error && error.length > 0 && (
        <p className="text-xs text-destructive">{error[0]}</p>
      )}
    </div>
  )
}

// Exported for testing
export { parseTerms, enforceMaxItems }
