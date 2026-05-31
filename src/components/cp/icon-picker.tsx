'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { icons, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Static array of common Lucide icon names for the picker */
const ICON_NAMES: string[] = [
  'file',
  'file-text',
  'folder',
  'folder-open',
  'image',
  'video',
  'music',
  'layout',
  'layout-grid',
  'layout-list',
  'user',
  'users',
  'settings',
  'sliders-horizontal',
  'tag',
  'tags',
  'bookmark',
  'heart',
  'star',
  'flag',
  'globe',
  'map',
  'map-pin',
  'home',
  'building',
  'calendar',
  'clock',
  'mail',
  'message-square',
  'bell',
  'search',
  'filter',
  'list',
  'grid-3x3',
  'table',
  'database',
  'hard-drive',
  'code',
  'terminal',
  'box',
  'package',
  'archive',
  'clipboard',
  'pen',
  'pencil',
  'trash-2',
  'download',
  'upload',
  'link',
  'external-link',
  'eye',
  'lock',
  'unlock',
  'shield',
  'key',
  'zap',
  'activity',
  'bar-chart-2',
  'pie-chart',
  'trending-up',
  'layers',
]

interface IconPickerProps {
  value: string | undefined
  onChange: (value: string) => void
  label?: string
}

function toPascalCase(str: string): string {
  return str
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function getIconComponent(name: string): LucideIcon | null {
  const pascalName = toPascalCase(name)
  return (icons as Record<string, LucideIcon>)[pascalName] ?? null
}

export function IconPicker({ value, onChange, label }: IconPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  const filteredIcons = useMemo(() => {
    if (!search.trim()) return ICON_NAMES
    const term = search.toLowerCase()
    return ICON_NAMES.filter((name) => name.includes(term))
  }, [search])

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) {
      setSearch('')
      setFocusedIndex(-1)
    }
  }, [])

  const handleSelect = useCallback(
    (iconName: string) => {
      onChange(iconName)
      setOpen(false)
    },
    [onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const cols = 6
      const total = filteredIcons.length

      if (total === 0) return

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          setFocusedIndex((prev) => {
            const next = prev + cols
            return next < total ? next : prev
          })
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          setFocusedIndex((prev) => {
            const next = prev - cols
            return next >= 0 ? next : prev
          })
          break
        }
        case 'ArrowRight': {
          e.preventDefault()
          setFocusedIndex((prev) => {
            const next = prev + 1
            return next < total ? next : prev
          })
          break
        }
        case 'ArrowLeft': {
          e.preventDefault()
          setFocusedIndex((prev) => {
            const next = prev - 1
            return next >= 0 ? next : prev
          })
          break
        }
        case 'Enter': {
          e.preventDefault()
          if (focusedIndex >= 0 && focusedIndex < total) {
            handleSelect(filteredIcons[focusedIndex])
          }
          break
        }
        case 'Escape': {
          e.preventDefault()
          setOpen(false)
          break
        }
      }
    },
    [filteredIcons, focusedIndex, handleSelect]
  )

  const SelectedIcon = value ? getIconComponent(value) : null

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-slate-700">{label}</label>
      )}
      <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        <PopoverPrimitive.Trigger
          className={cn(
            'inline-flex h-8 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors cursor-pointer',
            'hover:bg-accent focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
            'outline-none'
          )}
        >
          {SelectedIcon ? (
            <>
              <SelectedIcon className="size-4 shrink-0" />
              <span className="text-foreground">{value}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Select icon…</span>
          )}
        </PopoverPrimitive.Trigger>

        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner
            className="isolate z-50 outline-none"
            side="bottom"
            align="start"
            sideOffset={4}
          >
            <PopoverPrimitive.Popup
              className={cn(
                'w-72 origin-(--transform-origin) rounded-lg border border-border bg-popover p-2 shadow-md',
                'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
                'data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95'
              )}
            >
              <div className="mb-2">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search icons…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setFocusedIndex(0)
                  }}
                  onKeyDown={handleKeyDown}
                  className={cn(
                    'h-8 w-full rounded-md border border-input bg-transparent px-2.5 py-1 text-sm outline-none',
                    'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
                  )}
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                />
              </div>

              <div
                ref={gridRef}
                className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto"
                role="grid"
                aria-label="Icon grid"
              >
                {filteredIcons.map((iconName, index) => {
                  const Icon = getIconComponent(iconName)
                  if (!Icon) return null

                  const isFocused = index === focusedIndex
                  const isSelected = value === iconName

                  return (
                    <button
                      key={iconName}
                      type="button"
                      title={iconName}
                      onClick={() => handleSelect(iconName)}
                      data-focused={isFocused || undefined}
                      data-selected={isSelected || undefined}
                      className={cn(
                        'flex items-center justify-center rounded-md p-2 transition-colors cursor-pointer',
                        'hover:bg-accent hover:text-accent-foreground',
                        'data-focused:bg-accent data-focused:text-accent-foreground',
                        'data-selected:bg-primary/10 data-selected:text-primary',
                        'outline-none focus-visible:ring-2 focus-visible:ring-ring'
                      )}
                    >
                      <Icon className="size-4" />
                    </button>
                  )
                })}

                {filteredIcons.length === 0 && (
                  <p className="col-span-6 py-4 text-center text-xs text-muted-foreground">
                    No icons found
                  </p>
                )}
              </div>
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  )
}
