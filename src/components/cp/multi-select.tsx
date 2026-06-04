'use client'

import * as React from 'react'
import { Popover } from '@base-ui/react/popover'
import { X, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MultiSelectOption {
  value: string
  label: string
}

export interface MultiSelectProps {
  /** Available options to select from */
  options: MultiSelectOption[]
  /** Currently selected values */
  selected: string[]
  /** Callback when selection changes */
  onChange: (selected: string[]) => void
  /** Label displayed above the component */
  label?: string
  /** Placeholder text when no items are selected */
  placeholder?: string
  /** Whether the field is disabled */
  disabled?: boolean
}

export function MultiSelect({
  options,
  selected,
  onChange,
  label,
  placeholder = 'Select items...',
  disabled = false,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [focusedIndex, setFocusedIndex] = React.useState(-1)
  const optionRefs = React.useRef<(HTMLButtonElement | null)[]>([])

  const selectedOptions = options.filter((opt) => selected.includes(opt.value))

  function handleRemove(value: string) {
    onChange(selected.filter((v) => v !== value))
  }

  function handleAdd(value: string) {
    onChange([...selected, value])
  }

  function handleToggle(value: string) {
    if (selected.includes(value)) {
      handleRemove(value)
    } else {
      handleAdd(value)
    }
  }

  function handleListKeyDown(e: React.KeyboardEvent) {
    const total = options.length
    if (total === 0) return

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        const next = focusedIndex < total - 1 ? focusedIndex + 1 : 0
        setFocusedIndex(next)
        optionRefs.current[next]?.focus()
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        const prev = focusedIndex > 0 ? focusedIndex - 1 : total - 1
        setFocusedIndex(prev)
        optionRefs.current[prev]?.focus()
        break
      }
      case 'Home': {
        e.preventDefault()
        setFocusedIndex(0)
        optionRefs.current[0]?.focus()
        break
      }
      case 'End': {
        e.preventDefault()
        setFocusedIndex(total - 1)
        optionRefs.current[total - 1]?.focus()
        break
      }
      case 'Escape': {
        e.preventDefault()
        setOpen(false)
        break
      }
    }
  }

  // Reset focused index when popover opens
  React.useEffect(() => {
    if (open) {
      setFocusedIndex(-1)
    }
  }, [open])

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </label>
      )}

      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          className={cn(
            'flex h-[38px] w-full items-center justify-between rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors cursor-pointer',
            'focus:border-ring focus:ring-3 focus:ring-ring/50 focus:outline-none',
            disabled && 'cursor-not-allowed opacity-50',
            'dark:bg-input/30'
          )}
        >
          {selectedOptions.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            <span className="text-sm truncate">
              {selectedOptions.length} item{selectedOptions.length !== 1 ? 's' : ''} selected
            </span>
          )}
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Popover.Trigger>

        {selectedOptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {selectedOptions.map((opt) => (
              <span
                key={opt.value}
                className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200"
              >
                {opt.label}
                <button
                  type="button"
                  onClick={() => handleRemove(opt.value)}
                  disabled={disabled}
                  className="ml-0.5 inline-flex size-4 items-center justify-center rounded-sm text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 focus:outline-none focus:ring-1 focus:ring-ring dark:text-slate-400 dark:hover:bg-slate-600 dark:hover:text-slate-200"
                  aria-label={`Remove ${opt.label}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <Popover.Portal>
          <Popover.Positioner side="bottom" sideOffset={4} align="start" trackAnchor={false} className="z-50">
            <Popover.Popup className="w-(--anchor-width) min-w-[200px] origin-(--transform-origin) overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
              <Popover.Close className="sr-only">Close</Popover.Close>
              <div
                className="max-h-60 overflow-y-auto p-1"
                role="listbox"
                aria-multiselectable="true"
                aria-label={label || 'Select options'}
                onKeyDown={handleListKeyDown}
              >
                {options.length === 0 ? (
                  <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                    No options available
                  </p>
                ) : (
                  options.map((opt, index) => {
                    const isSelected = selected.includes(opt.value)
                    return (
                      <button
                        key={opt.value}
                        ref={(el) => { optionRefs.current[index] = el }}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleToggle(opt.value)}
                        onFocus={() => setFocusedIndex(index)}
                        className={cn(
                          'relative flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-hidden transition-colors',
                          'hover:bg-accent hover:text-accent-foreground',
                          'focus:bg-accent focus:text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isSelected && 'font-medium'
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-4 shrink-0 items-center justify-center rounded-sm border border-input',
                            isSelected && 'border-primary bg-primary text-primary-foreground'
                          )}
                          aria-hidden="true"
                        >
                          {isSelected && <Check className="size-3" />}
                        </span>
                        <span className="flex-1 truncate">{opt.label}</span>
                      </button>
                    )
                  })
                )}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
