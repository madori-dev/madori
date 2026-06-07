import { NextResponse } from 'next/server'
import { loadConfig, resolveConfigPaths } from '@/lib/config/loader'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { InMemoryContentCache } from '@/lib/cache/store'
import { BlueprintRegistry } from '@/lib/blueprints/registry'
import { BlueprintLoader } from '@/lib/blueprints/loader'
import { MadoriContentEngine } from '@/lib/content/engine'

interface RouteParams {
  params: Promise<{ slug: string }>
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { slug } = await params

  const config = await loadConfig()
  const resolvedConfig = resolveConfigPaths(config, process.cwd())

  const fs = new NodeFileSystemAdapter()
  const parser = new MarkdownYamlParser()
  const cache = new InMemoryContentCache()
  const blueprintLoader = new BlueprintLoader(fs, parser, resolvedConfig.resourcesPath)
  const blueprintRegistry = new BlueprintRegistry(blueprintLoader)

  const engine = new MadoriContentEngine(
    resolvedConfig,
    fs,
    parser,
    cache,
    blueprintRegistry
  )

  const entry = await engine.getEntry('docs', slug)

  if (!entry) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Build markdown with title as heading
  const markdown = `# ${entry.title}\n\n${entry.content}`

  return new NextResponse(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}.md"`,
    },
  })
}
