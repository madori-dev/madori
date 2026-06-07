import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { marked } from 'marked'
import { loadConfig, resolveConfigPaths } from '@/lib/config/loader'
import { BlueprintRegistry } from '@/lib/blueprints/registry'
import { BlueprintLoader } from '@/lib/blueprints/loader'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { InMemoryContentCache } from '@/lib/cache/store'
import { MadoriContentEngine } from '@/lib/content/engine'
import { renderTipTapToHtml } from '@/lib/editor/renderer'
import { BlockRenderer } from '@/components/blocks'
import { SiteLayout } from '@/components/site/SiteLayout'
import { DocsLayout } from '@/components/site/DocsLayout'
import { DownloadMarkdown } from '@/components/site/DownloadMarkdown'
import type { TipTapDocument } from '@/lib/editor/types'

interface Block {
  _type: string
  [key: string]: unknown
}

async function getContentEngine() {
  const config = await loadConfig()
  const resolvedConfig = resolveConfigPaths(config, process.cwd())

  const fs = new NodeFileSystemAdapter()
  const parser = new MarkdownYamlParser()
  const cache = new InMemoryContentCache()
  const blueprintLoader = new BlueprintLoader(fs, parser, resolvedConfig.resourcesPath)
  const blueprintRegistry = new BlueprintRegistry(blueprintLoader)

  return new MadoriContentEngine(
    resolvedConfig,
    fs,
    parser,
    cache,
    blueprintRegistry
  )
}

interface PageProps {
  params: Promise<{ slug: string[] }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const engine = await getContentEngine()

  const isDocsPage = slug[0] === 'docs'
  const collection = isDocsPage ? 'docs' : 'pages'
  const entrySlug = isDocsPage ? slug.slice(1).join('/') : slug.join('/')

  const entry = await engine.getEntry(collection, entrySlug)

  if (!entry) return {}

  return {
    title: (entry.data?.meta_title as string) || `${entry.title} — MADORI`,
    description: (entry.data?.meta_description as string) || undefined,
    openGraph: entry.data?.og_image
      ? { images: [{ url: entry.data.og_image as string }] }
      : undefined,
  }
}

export default async function DynamicPage({ params }: PageProps) {
  const { slug } = await params

  const engine = await getContentEngine()

  const isDocsPage = slug[0] === 'docs'
  const collection = isDocsPage ? 'docs' : 'pages'
  const entrySlug = isDocsPage ? slug.slice(1).join('/') : slug.join('/')

  const entry = await engine.getEntry(collection, entrySlug)

  if (!entry) {
    notFound()
  }

  const blocks = (entry.data?.blocks as Block[]) ?? []

  let html = ''
  if (entry.data?.content_json) {
    html = renderTipTapToHtml(entry.data.content_json as TipTapDocument)
  } else if (entry.content) {
    html = await marked.parse(entry.content)
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
        {isDocsPage ? (
          <DocsLayout>{content}</DocsLayout>
        ) : (
          content
        )}
      </main>
    </SiteLayout>
  )
}
