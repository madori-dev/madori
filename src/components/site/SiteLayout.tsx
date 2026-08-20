import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { getMadori } from '@/lib/madori'
import { resolveNavigationItems } from '@/lib/navigation/resolve'
import { getRequestSite } from '@/lib/seo/next'

async function getNavItems() {
  const [{ contentEngine, urlResolver }, site] = await Promise.all([getMadori(), getRequestSite()])
  const [nav, collections] = await Promise.all([contentEngine.getNavigation('main'), contentEngine.listCollections()])
  return resolveNavigationItems(nav?.items ?? [], { collections, content: contentEngine, urlResolver, site })
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
