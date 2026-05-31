import { notFound } from 'next/navigation'
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

export default async function DynamicPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const slugStr = slug.join('/')

  const engine = await getContentEngine()
  const entry = await engine.getEntry('pages', slugStr)

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

  return (
    <main className="min-h-svh">
      {blocks.length > 0 && <BlockRenderer blocks={blocks} />}

      {html && (
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div
            className="prose dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      )}
    </main>
  )
}
