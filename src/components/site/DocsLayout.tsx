import { getMadori } from '@/lib/madori'
import { resolveNavigationItems } from '@/lib/navigation/resolve'
import { getRequestSite } from '@/lib/seo/next'
import { DocsSidebar } from './DocsSidebar'
import { DocsMobileNav } from './DocsMobileNav'

async function getDocsNav() {
  const [{ contentEngine, urlResolver }, site] = await Promise.all([getMadori(), getRequestSite()])
  const [nav, collections] = await Promise.all([contentEngine.getNavigation('docs'), contentEngine.listCollections()])
  return resolveNavigationItems(nav?.items ?? [], { collections, content: contentEngine, urlResolver, site })
}

export async function DocsLayout({ children }: { children: React.ReactNode }) {
  const items = await getDocsNav()

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="grid grid-cols-1 gap-10 md:grid-cols-[220px_1fr]">
        {/* Sidebar */}
        <aside className="hidden md:block">
          <div className="sticky top-20">
            <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Documentation
            </p>
            <DocsSidebar items={items} />
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0">
          <DocsMobileNav items={items} />
          {children}
        </div>
      </div>
    </div>
  )
}
