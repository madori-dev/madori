import type { ResolvedSeoOutputView, SeoMetadataDescriptor } from './types'
import { isAbsoluteHttpUrl, requireAbsoluteHttpUrl } from './utils'

/** Return a plain object assignable to Next's metadata API at route boundaries. */
export function generateMetadata(view: ResolvedSeoOutputView): SeoMetadataDescriptor {
  const canonical = requireAbsoluteHttpUrl(view.canonical, 'canonical')
  const image = view.social?.enabled === false || !isAbsoluteHttpUrl(view.social?.image)
    ? undefined
    : view.social.image
  const pageType = view.pageType ?? 'website'
  const languages = Object.fromEntries(
    Object.entries(view.alternates ?? {}).filter(([, url]) => isAbsoluteHttpUrl(url)),
  )
  const previous = isAbsoluteHttpUrl(view.pagination?.previous) ? view.pagination?.previous : undefined
  const next = isAbsoluteHttpUrl(view.pagination?.next) ? view.pagination?.next : undefined
  const description = view.description || undefined
  const imageDescriptor = image ? [{ url: image, ...(view.social?.imageAlt ? { alt: view.social.imageAlt } : {}) }] : undefined

  return {
    title: view.title,
    ...(description ? { description } : {}),
    alternates: {
      canonical,
      ...(Object.keys(languages).length ? { languages } : {}),
      ...(previous ? { previous } : {}),
      ...(next ? { next } : {}),
    },
    ...(view.robots?.length ? { robots: view.robots.join(', ') } : {}),
    openGraph: {
      type: pageType,
      url: canonical,
      title: view.title,
      ...(description ? { description } : {}),
      ...(view.siteName ? { siteName: view.siteName } : {}),
      ...(view.locale ? { locale: view.locale } : {}),
      ...(imageDescriptor ? { images: imageDescriptor } : {}),
      ...(pageType === 'article' && view.article?.publishedAt ? { publishedTime: view.article.publishedAt } : {}),
      ...(pageType === 'article' && view.article?.modifiedAt ? { modifiedTime: view.article.modifiedAt } : {}),
      ...(pageType === 'article' && view.article?.author ? { authors: [view.article.author] } : {}),
      ...(pageType === 'article' && view.article?.section ? { section: view.article.section } : {}),
      ...(pageType === 'article' && view.article?.tags?.length ? { tags: view.article.tags } : {}),
    },
    twitter: {
      card: view.social?.twitterCard ?? (image ? 'summary_large_image' : 'summary'),
      title: view.title,
      ...(description ? { description } : {}),
      ...(image ? { images: [image] } : {}),
      ...(view.social?.twitterSite ? { site: view.social.twitterSite } : {}),
      ...(view.social?.twitterCreator ? { creator: view.social.twitterCreator } : {}),
    },
  }
}
