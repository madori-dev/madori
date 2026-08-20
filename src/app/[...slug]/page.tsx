import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { marked } from 'marked'
import { renderTipTapToHtml } from '@/lib/editor/renderer'
import { BlockRenderer } from '@/components/blocks'
import { SiteLayout } from '@/components/site/SiteLayout'
import { DocsLayout } from '@/components/site/DocsLayout'
import { DownloadMarkdown } from '@/components/site/DownloadMarkdown'
import type { TipTapDocument } from '@/lib/editor/types'
import { serializeJsonLd } from '@/lib/seo/outputs'
import {
  getRequestSite,
  recordPublicNotFound,
  resolvePublishedContentRoute,
  resolvePublishedEntrySeo,
  resolvePublishedTermSeo,
} from '@/lib/seo/next'

interface Block {
  _type: string
  [key: string]: unknown
}

interface PageProps {
  params: Promise<{ slug: string[] }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const publicPath = `/${slug.join('/')}`
  const route = await resolvePublishedContentRoute(publicPath)
  if (!route) return {}
  const site = await getRequestSite()
  const seo = route.kind === 'collection'
    ? await resolvePublishedEntrySeo(site.handle, route.collection, route.slug, publicPath)
    : await resolvePublishedTermSeo(site.handle, route.taxonomy, route.slug)
  return seo?.metadata as Metadata ?? {}
}

export default async function DynamicPage({ params }: PageProps) {
  const { slug } = await params
  const publicPath = `/${slug.join('/')}`
  const [route, site] = await Promise.all([resolvePublishedContentRoute(publicPath), getRequestSite()])

  if (!route) {
    await recordPublicNotFound(site.handle, publicPath)
    notFound()
  }

  const seo = route.kind === 'collection'
    ? await resolvePublishedEntrySeo(site.handle, route.collection, route.slug, publicPath)
    : await resolvePublishedTermSeo(site.handle, route.taxonomy, route.slug)
  const record = route.kind === 'collection' ? route.entry : route.term
  const isDocsPage = route.kind === 'collection' && route.collection === 'docs'
  const blocks = (record.data?.blocks as Block[]) ?? []

  let html = ''
  if (record.data?.content_json) {
    html = renderTipTapToHtml(record.data.content_json as TipTapDocument)
  } else if (route.kind === 'collection' && route.entry.content) {
    html = await marked.parse(route.entry.content)
  } else if (route.kind === 'taxonomy' && typeof route.term.data.content === 'string') {
    html = await marked.parse(route.term.data.content)
  } else if (route.kind === 'taxonomy' && route.term.description) {
    html = await marked.parse(route.term.description)
  }

  const content = (
    <>
      {blocks.length > 0 && <BlockRenderer blocks={blocks} />}

      {html && (
        <div className={isDocsPage ? '' : 'mx-auto max-w-3xl px-6 py-16'}>
          {isDocsPage && (
            <div className="flex justify-end mb-4">
              <DownloadMarkdown />
            </div>
          )}
          {route.kind === 'taxonomy' && <h1 className="mb-8 text-4xl font-bold">{route.term.title}</h1>}
          <div
            className="prose dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      )}
    </>
  )

  return (
    <SiteLayout>
      <main className="min-h-svh">
        {seo?.jsonLd && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: serializeJsonLd(seo.jsonLd) }}
          />
        )}
        {isDocsPage ? (
          <DocsLayout>{content}</DocsLayout>
        ) : (
          content
        )}
      </main>
    </SiteLayout>
  )
}
