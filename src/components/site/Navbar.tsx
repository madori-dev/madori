'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ExternalLink } from 'lucide-react'
import { MobileNav } from './MobileNav'
import { cn } from '@/lib/utils'
import type { NavigationItem } from '@/lib/types'

interface NavbarProps {
  items: NavigationItem[]
}

export function Navbar({ items }: NavbarProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 cursor-pointer">
          <Image src="/madori_logo.svg" alt="MADORI" width={28} height={28} />
          <span className="font-heading text-lg font-bold tracking-wide">MADORI</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {items.map((item, i) => {
            const hasChildren = Array.isArray(item.children) && item.children.length > 0
            if (hasChildren) {
              return <NavDropdown key={i} item={item} />
            }
            return <NavLink key={i} item={item} />
          })}
        </nav>

        {/* Mobile menu */}
        <MobileNav items={items} />
      </div>
    </header>
  )
}

function NavLink({ item }: { item: NavigationItem }) {
  const label = item.label as string | undefined
  const url = item.url as string | undefined
  const external = item.external as boolean | undefined
  const icon = item.icon as string | undefined

  return (
    <Link
      href={url ?? '#'}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/50 cursor-pointer"
    >
      {icon && <span className="text-xs" aria-hidden="true">{icon}</span>}
      {label}
      {external && <ExternalLink className="size-3 text-muted-foreground/70" aria-hidden="true" />}
    </Link>
  )
}

function NavDropdown({ item }: { item: NavigationItem }) {
  const [open, setOpen] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const label = item.label as string | undefined
  const url = item.url as string | undefined
  const icon = item.icon as string | undefined
  const children = item.children ?? []

  function handleEnter() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setOpen(true)
  }

  function handleLeave() {
    timeoutRef.current = setTimeout(() => setOpen(false), 150)
  }

  // Close on escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) {
      document.addEventListener('keydown', handleKey)
      return () => document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {url ? (
        <Link
          href={url}
          className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/50 cursor-pointer"
          onFocus={handleEnter}
          onBlur={handleLeave}
        >
          {icon && <span className="text-xs" aria-hidden="true">{icon}</span>}
          {label}
          <ChevronDown className={cn('size-3 text-muted-foreground/70 transition-transform', open && 'rotate-180')} />
        </Link>
      ) : (
        <button
          type="button"
          className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/50 cursor-pointer"
          onClick={() => setOpen(!open)}
          onFocus={handleEnter}
          onBlur={handleLeave}
          aria-expanded={open}
          aria-haspopup="true"
        >
          {icon && <span className="text-xs" aria-hidden="true">{icon}</span>}
          {label}
          <ChevronDown className={cn('size-3 text-muted-foreground/70 transition-transform', open && 'rotate-180')} />
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full pt-1 z-50">
          <div className="min-w-48 rounded-lg border border-border bg-popover p-1 shadow-lg">
            {children.map((child, i) => {
              const childLabel = child.label as string | undefined
              const childUrl = child.url as string | undefined
              const childExternal = child.external as boolean | undefined
              const childIcon = child.icon as string | undefined

              return (
                <Link
                  key={i}
                  href={childUrl ?? '#'}
                  target={childExternal ? '_blank' : undefined}
                  rel={childExternal ? 'noopener noreferrer' : undefined}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/50 cursor-pointer"
                  onClick={() => setOpen(false)}
                >
                  {childIcon && <span className="text-xs" aria-hidden="true">{childIcon}</span>}
                  {childLabel}
                  {childExternal && <ExternalLink className="size-3 text-muted-foreground/70" aria-hidden="true" />}
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
