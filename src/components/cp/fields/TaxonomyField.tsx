'use client'

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
  const maxItems = (field.options?.max_items as number | undefined) ?? 0
  const terms = parseTerms(value)
  const isAtLimit = maxItems > 0 && terms.length >= maxItems

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawInput = e.target.value
    const parsed = rawInput.split(',').map((t) => t.trim()).filter(Boolean)

    // Enforce max_items: never allow more than N terms to be saved
    const enforced = enforceMaxItems(parsed, maxItems)

    // If the user is still typing (trailing comma or partial term), preserve raw input
    // but only up to the allowed number of terms
    if (maxItems > 0 && parsed.length > maxItems) {
      // Truncate to max and rejoin — user sees the enforced value
      onChange(enforced.join(', '))
    } else {
      onChange(rawInput)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {field.display && (
        <label className="text-sm font-medium text-foreground">
          {field.display}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <input
        type="text"
        value={(value as string) ?? ''}
        onChange={handleChange}
        placeholder="term-1, term-2"
        disabled={false}
        className={`rounded-md border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring ${error && error.length > 0 ? 'border-destructive' : 'border-border'} ${isAtLimit ? 'bg-muted/50' : ''}`}
      />
      <p className="text-xs text-muted-foreground">
        {isAtLimit
          ? `Maximum of ${maxItems} term${maxItems === 1 ? '' : 's'} reached`
          : maxItems > 0
            ? `Enter taxonomy terms separated by commas (max ${maxItems})`
            : 'Enter taxonomy terms separated by commas (picker coming soon)'}
      </p>
      {error && error.length > 0 && (
        <p className="text-xs text-destructive">{error[0]}</p>
      )}
    </div>
  )
}

// Exported for testing
export { parseTerms, enforceMaxItems }
