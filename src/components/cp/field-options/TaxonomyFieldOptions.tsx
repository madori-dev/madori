'use client'

import { useEffect, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface FieldOptionsProps {
  options: Record<string, unknown>
  onChange: (options: Record<string, unknown>) => void
}

interface TaxonomyListItem {
  handle: string
  title: string
}

const DISPLAY_FORMATS = [
  { value: 'tags', label: 'Tags' },
  { value: 'list', label: 'List' },
  { value: 'dropdown', label: 'Dropdown' },
] as const

export function TaxonomyFieldOptions({ options, onChange }: FieldOptionsProps) {
  const [taxonomies, setTaxonomies] = useState<TaxonomyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showValidation, setShowValidation] = useState(false)

  const taxonomy = (options.taxonomy as string) ?? ''
  const maxItems = (options.max_items as number) ?? 0
  const displayFormat = (options.display_format as string) ?? 'tags'

  useEffect(() => {
    async function fetchTaxonomies() {
      try {
        const res = await fetch('/api/taxonomies')
        if (!res.ok) throw new Error('Failed to fetch taxonomies')
        const json = await res.json()
        setTaxonomies(json.data ?? [])
      } catch {
        setError('Could not load taxonomies')
      } finally {
        setLoading(false)
      }
    }
    fetchTaxonomies()
  }, [])

  // Show validation once user has interacted (blurred) or on mount if already empty
  useEffect(() => {
    if (!taxonomy) {
      setShowValidation(true)
    }
  }, [taxonomy])

  function handleTaxonomyChange(value: string | null) {
    setShowValidation(!value)
    onChange({ ...options, taxonomy: value ?? '' })
  }

  function handleMaxItemsChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10)
    onChange({ ...options, max_items: isNaN(val) ? 0 : Math.max(0, val) })
  }

  function handleDisplayFormatChange(value: string | null) {
    onChange({ ...options, display_format: value ?? 'tags' })
  }

  return (
    <div className="space-y-4">
      {/* Taxonomy Picker */}
      <div className="space-y-1.5">
        <Label htmlFor="taxonomy-select" className="text-xs font-medium">
          Taxonomy
        </Label>
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading taxonomies…</p>
        ) : error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <Select value={taxonomy} onValueChange={handleTaxonomyChange}>
            <SelectTrigger className="w-full" id="taxonomy-select">
              <SelectValue placeholder="Select a taxonomy" />
            </SelectTrigger>
            <SelectContent>
              {taxonomies.map((t) => (
                <SelectItem key={t.handle} value={t.handle}>
                  {t.title || t.handle}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {showValidation && !taxonomy && (
          <p className="text-xs text-destructive">
            A taxonomy must be selected before saving.
          </p>
        )}
      </div>

      {/* Max Items */}
      <div className="space-y-1.5">
        <Label htmlFor="taxonomy-max-items" className="text-xs font-medium">
          Max Items
        </Label>
        <Input
          id="taxonomy-max-items"
          type="number"
          min={0}
          value={maxItems}
          onChange={handleMaxItemsChange}
          placeholder="0"
          className="h-8 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Maximum number of selections. 0 means unlimited.
        </p>
      </div>

      {/* Display Format */}
      <div className="space-y-1.5">
        <Label htmlFor="taxonomy-display-format" className="text-xs font-medium">
          Display Format
        </Label>
        <Select value={displayFormat} onValueChange={handleDisplayFormatChange}>
          <SelectTrigger className="w-full" id="taxonomy-display-format">
            <SelectValue placeholder="Select display format" />
          </SelectTrigger>
          <SelectContent>
            {DISPLAY_FORMATS.map((fmt) => (
              <SelectItem key={fmt.value} value={fmt.value}>
                {fmt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
