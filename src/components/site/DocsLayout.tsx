import { loadConfig, resolveConfigPaths } from '@/lib/config/loader'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { InMemoryContentCache } from '@/lib/cache/store'
import { NavigationOperations } from '@/lib/content/navigation'
import { DocsSidebar } from './DocsSidebar'
import { DocsMobileNav } from './DocsMobileNav'

async function getDocsNav() {
  const config = await loadConfig()
  const resolvedConfig = resolveConfigPaths(config, process.cwd())

  const fs = new NodeFileSystemAdapter()
  const parser = new MarkdownYamlParser()
  const cache = new InMemoryContentCache()
  const navOps = new NavigationOperations(fs, parser, cache, resolvedConfig.contentPath)

  const nav = await navOps.getNavigation('docs')
  return nav?.items ?? []
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
