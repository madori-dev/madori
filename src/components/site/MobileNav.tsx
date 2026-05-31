'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'

interface NavItem {
  label: string
  url?: string
  external?: boolean
}

export function MobileNav({ items }: { items: NavItem[] }) {
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
          <nav className="mx-auto max-w-5xl flex flex-col gap-1 px-6 py-4">
            {items.map((item) => (
              <Link
                key={item.label}
                href={item.url ?? '#'}
                target={item.external ? '_blank' : undefined}
                rel={item.external ? 'noopener noreferrer' : undefined}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  )
}
