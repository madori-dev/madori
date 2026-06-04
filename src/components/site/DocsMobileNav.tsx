'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NavigationItem } from '@/lib/types'

export function DocsMobileNav({ items }: { items: NavigationItem[] }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const current = findCurrentItem(items, pathname)

  return (
    <div className="md:hidden mb-6">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground cursor-pointer"
      >
        <span>{(current?.label as string) ?? 'Documentation'}</span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <nav className="mt-2 rounded-md border border-border bg-background p-2 space-y-0.5">
          {items.map((item, i) => (
            <DocsMobileNavItem
              key={i}
              item={item}
              pathname={pathname}
              onClose={() => setOpen(false)}
              depth={0}
            />
          ))}
        </nav>
      )}
    </div>
  )
}

function DocsMobileNavItem({
  item,
  pathname,
  onClose,
  depth,
}: {
  item: NavigationItem
  pathname: string
  onClose: () => void
  depth: number
}) {
  const label = item.label as string | undefined
  const url = item.url as string | undefined
  const icon = item.icon as string | undefined
  const hasChildren = Array.isArray(item.children) && item.children.length > 0
  const active = pathname === url
  const childActive = hasChildren && isChildActive(item.children!, pathname)

  const [expanded, setExpanded] = useState(childActive)

  if (hasChildren) {
    return (
      <div>
        <div className="flex items-center">
          {url ? (
            <Link
              href={url}
              onClick={onClose}
              className={cn(
                'flex-1 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors cursor-pointer',
                active
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
              style={{ paddingLeft: `${depth * 12 + 12}px` }}
            >
              {icon && <span className="text-xs" aria-hidden="true">{icon}</span>}
              {label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className={cn(
                'flex-1 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-left transition-colors cursor-pointer',
                childActive
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
              style={{ paddingLeft: `${depth * 12 + 12}px` }}
            >
              {icon && <span className="text-xs" aria-hidden="true">{icon}</span>}
              {label}
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>
        {expanded && (
          <div className="mt-0.5">
            {item.children!.map((child, i) => (
              <DocsMobileNavItem
                key={i}
                item={child}
                pathname={pathname}
                onClose={onClose}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Link
      href={url ?? '#'}
      onClick={onClose}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors cursor-pointer',
        active
          ? 'bg-muted font-medium text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      )}
      style={{ paddingLeft: `${depth * 12 + 12}px` }}
    >
      {icon && <span className="text-xs" aria-hidden="true">{icon}</span>}
      {label}
    </Link>
  )
}

/** Find the currently active item by pathname, searching nested children */
function findCurrentItem(items: NavigationItem[], pathname: string): NavigationItem | undefined {
  for (const item of items) {
    if ((item.url as string) === pathname) return item
    if (item.children) {
      const found = findCurrentItem(item.children, pathname)
      if (found) return found
    }
  }
  return undefined
}

/** Check if any child item's url matches the current pathname */
function isChildActive(children: NavigationItem[], pathname: string): boolean {
  for (const child of children) {
    if ((child.url as string) === pathname) return true
    if (child.children && isChildActive(child.children, pathname)) return true
  }
  return false
}
