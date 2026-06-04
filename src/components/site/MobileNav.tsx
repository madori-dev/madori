'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X, ChevronDown, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NavigationItem } from '@/lib/types'

export function MobileNav({ items }: { items: NavigationItem[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        aria-label={open ? 'Close menu' : 'Open menu'}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <div className="absolute inset-x-0 top-14 border-b border-border bg-background/95 backdrop-blur-md">
          <nav className="mx-auto max-w-5xl flex flex-col gap-0.5 px-6 py-4">
            {items.map((item, i) => (
              <MobileNavItem key={i} item={item} onClose={() => setOpen(false)} />
            ))}
          </nav>
        </div>
      )}
    </div>
  )
}

function MobileNavItem({ item, onClose, depth = 0 }: { item: NavigationItem; onClose: () => void; depth?: number }) {
  const [childrenOpen, setChildrenOpen] = useState(false)

  const label = item.label as string | undefined
  const url = item.url as string | undefined
  const external = item.external as boolean | undefined
  const icon = item.icon as string | undefined
  const hasChildren = Array.isArray(item.children) && item.children.length > 0

  return (
    <div>
      <div className="flex items-center">
        <Link
          href={url ?? '#'}
          target={external ? '_blank' : undefined}
          rel={external ? 'noopener noreferrer' : undefined}
          onClick={onClose}
          className={cn(
            'flex-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors cursor-pointer',
            depth > 0 && 'text-muted-foreground font-normal'
          )}
          style={{ paddingLeft: `${depth * 12 + 12}px` }}
        >
          {icon && <span className="text-xs" aria-hidden="true">{icon}</span>}
          {label}
          {external && <ExternalLink className="size-3 text-muted-foreground/70" aria-hidden="true" />}
        </Link>
        {hasChildren && (
          <button
            type="button"
            onClick={() => setChildrenOpen(!childrenOpen)}
            className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            aria-label={childrenOpen ? 'Collapse' : 'Expand'}
          >
            <ChevronDown className={cn('size-4 transition-transform', childrenOpen && 'rotate-180')} />
          </button>
        )}
      </div>
      {hasChildren && childrenOpen && (
        <div className="mt-0.5">
          {item.children!.map((child, i) => (
            <MobileNavItem key={i} item={child} onClose={onClose} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}
