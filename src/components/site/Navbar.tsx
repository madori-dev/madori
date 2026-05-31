import Link from 'next/link'
import Image from 'next/image'
import { MobileNav } from './MobileNav'

interface NavItem {
  label: string
  url?: string
  external?: boolean
}

interface NavbarProps {
  items: NavItem[]
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
        <nav className="hidden md:flex items-center gap-6">
          {items.map((item) => (
            <Link
              key={item.label}
              href={item.url ?? '#'}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noopener noreferrer' : undefined}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Mobile menu */}
        <MobileNav items={items} />
      </div>
    </header>
  )
}
