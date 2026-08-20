import type { Metadata } from 'next'
import { marked } from 'marked'
import { renderTipTapToHtml } from '@/lib/editor/renderer'
import { BlockRenderer } from '@/components/blocks'
import { SiteLayout } from '@/components/site/SiteLayout'
import { BlueprintForm } from '@/components/site/BlueprintForm'
import type { TipTapDocument } from '@/lib/editor/types'
import { serializeJsonLd } from '@/lib/seo/outputs'
import { getPublishedEntry, getRequestSite, resolvePublishedEntrySeo } from '@/lib/seo/next'

async function getPageEntry() {
  return getPublishedEntry('pages', 'home')
}

interface Block {
  _type: string
  [key: string]: unknown
}

export async function generateMetadata(): Promise<Metadata> {
  const entry = await getPageEntry()
  if (!entry) return {}
  const site = await getRequestSite()
  const seo = await resolvePublishedEntrySeo(site.handle, 'pages', 'home', '/')
  return seo?.metadata as Metadata ?? {}
}

export default async function Home() {
  const entry = await getPageEntry()

  if (!entry) {
    return (
      <main className="flex min-h-svh items-center justify-center">
        <p className="text-zinc-500">No home page found.</p>
      </main>
    )
  }

  const blocks = (entry.data?.blocks as Block[]) ?? []
  const formHandle = typeof entry.data?.form_handle === 'string' ? entry.data.form_handle : undefined
  const site = await getRequestSite()
  const seo = await resolvePublishedEntrySeo(site.handle, 'pages', 'home', '/')

  // Use structured tiptap JSON if available, fall back to markdown
  let html = ''
  if (entry.data?.content_json) {
    html = renderTipTapToHtml(entry.data.content_json as TipTapDocument)
  } else if (entry.content) {
    html = await marked.parse(entry.content)
  }

  return (
    <SiteLayout>
      <main className="min-h-svh">
        {seo?.jsonLd && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: serializeJsonLd(seo.jsonLd) }}
          />
        )}
        {/* Render blocks */}
        {blocks.length > 0 && <BlockRenderer blocks={blocks} />}

        {/* Fallback: render tiptap/markdown content if no blocks or as additional content */}
        {html && (
          <div className="mx-auto max-w-3xl px-6 py-16">
            <div
              className="prose dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        )}
        {formHandle && (
          <div className="mx-auto max-w-3xl px-6 py-16">
            <BlueprintForm handle={formHandle} className="space-y-4" />
          </div>
        )}
      </main>
    </SiteLayout>
  )
}
