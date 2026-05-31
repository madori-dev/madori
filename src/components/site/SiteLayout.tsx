import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { loadConfig, resolveConfigPaths } from '@/lib/config/loader'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { InMemoryContentCache } from '@/lib/cache/store'
import { NavigationOperations } from '@/lib/content/navigation'

async function getNavItems() {
  const config = await loadConfig()
  const resolvedConfig = resolveConfigPaths(config, process.cwd())

  const fs = new NodeFileSystemAdapter()
  const parser = new MarkdownYamlParser()
  const cache = new InMemoryContentCache()
  const navOps = new NavigationOperations(fs, parser, cache, resolvedConfig.contentPath)

  const nav = await navOps.getNavigation('main')
  return nav?.items ?? []
}

export async function SiteLayout({ children }: { children: React.ReactNode }) {
  const items = await getNavItems()

  return (
    <>
      <Navbar items={items} />
      {children}
      <Footer />
    </>
  )
}
