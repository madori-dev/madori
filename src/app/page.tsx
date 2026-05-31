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
import type { TipTapDocument } from '@/lib/editor/types'

async function getPageEntry() {
  const config = await loadConfig()
  const resolvedConfig = resolveConfigPaths(config, process.cwd())

  const fs = new NodeFileSystemAdapter()
  const parser = new MarkdownYamlParser()
  const cache = new InMemoryContentCache()
  const blueprintLoader = new BlueprintLoader(fs, parser, resolvedConfig.resourcesPath)
  const blueprintRegistry = new BlueprintRegistry(blueprintLoader)

  const contentEngine = new MadoriContentEngine(
    resolvedConfig,
    fs,
    parser,
    cache,
    blueprintRegistry
  )

  return contentEngine.getEntry('pages', 'home')
}

interface Block {
  _type: string
  [key: string]: unknown
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
      </main>
    </SiteLayout>
  )
}
