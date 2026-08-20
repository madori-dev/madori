'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCapabilities } from '@/components/cp/use-capabilities'
import {
  LayoutDashboard,
  FolderOpen,
  Tags,
  Globe,
  Navigation,
  Image,
  FileText,
  Users,
  FileCode2,
  Layers,
  GitBranch,
  Search,
} from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { MadoriLogo } from '@/components/cp/MadoriLogo'
import { SidebarUserMenu } from '@/components/cp/SidebarUserMenu'

const navGroups = [
  {
    items: [
      { label: 'Dashboard', href: '/cp', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Content',
    items: [
      { label: 'Collections', href: '/cp/collections', icon: FolderOpen },
      { label: 'Globals', href: '/cp/globals', icon: Globe },
      { label: 'Navigation', href: '/cp/navigation', icon: Navigation },
      { label: 'Taxonomies', href: '/cp/taxonomies', icon: Tags },
    ],
  },
  {
    label: 'Media & Data',
    items: [
      { label: 'Assets', href: '/cp/assets', icon: Image },
      { label: 'Forms', href: '/cp/forms', icon: FileText },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { label: 'Blueprints', href: '/cp/blueprints', icon: FileCode2 },
      { label: 'Fieldsets', href: '/cp/fieldsets', icon: Layers },
      { label: 'SEO', href: '/cp/seo', icon: Search },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Users', href: '/cp/users', icon: Users },
      { label: 'Git', href: '/cp/git', icon: GitBranch },
    ],
  },
]

// Flat list for header breadcrumb lookup
const allNavItems = navGroups.flatMap((g) => g.items)

const navCapability: Record<string, string> = { '/cp/collections': 'collections:view', '/cp/globals': 'globals:view', '/cp/navigation': 'navigation:view', '/cp/taxonomies': 'taxonomies:view', '/cp/assets': 'assets:view', '/cp/forms': 'forms:view', '/cp/users': 'users:view', '/cp/git': 'git:view', '/cp/seo': 'seo:view', '/cp/settings': 'settings:view' }

export default function CPLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const capabilities = useCapabilities()

  // Don't render sidebar on login page
  if (pathname === '/cp/login') {
    return <>{children}<Toaster /></>
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="lg"
                  render={<Link href="/cp" />}
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <MadoriLogo className="size-5" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-heading font-semibold">MADORI</span>
                    <span className="truncate text-xs text-muted-foreground">
                      Control Panel
                    </span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarContent>
            {navGroups.map((group, groupIndex) => {
              // Fail closed until capability contract loads; API remains final authority.
              const items = group.items.filter(item => !navCapability[item.href] || capabilities?.[navCapability[item.href]] === true)
              if (items.length === 0) return null
              return (
              <SidebarGroup key={groupIndex}>
                {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
                <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map((item) => {
                      const isActive =
                        item.href === '/cp'
                          ? pathname === '/cp'
                          : pathname.startsWith(item.href)

                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton
                            render={<Link href={item.href} />}
                            isActive={isActive}
                            tooltip={item.label}
                          >
                            <item.icon />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
              )})}
          </SidebarContent>

          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<a href="/" target="_blank" rel="noopener noreferrer" />}
                  tooltip="Back to site"
                >
                  <Globe />
                  <span>View Site</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarUserMenu />
          </SidebarFooter>

          <SidebarRail />
        </Sidebar>

        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <span className="text-sm text-muted-foreground">
              {allNavItems.find(
                (item) =>
                  item.href === '/cp'
                    ? pathname === '/cp'
                    : pathname.startsWith(item.href)
              )?.label ?? 'Dashboard'}
            </span>
          </header>
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
      <Toaster />
    </TooltipProvider>
  )
}
