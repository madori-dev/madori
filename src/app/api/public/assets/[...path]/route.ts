import { loadConfig, resolveConfigPaths } from '@/lib/config/loader'
import { serveAssetFile } from '@/lib/content/asset-serving'

async function assetsRoot(): Promise<string> {
  const config = resolveConfigPaths(await loadConfig(), process.cwd())
  return config.assetsPath
}

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  return serveAssetFile(await assetsRoot(), (await context.params).path.join('/'))
}

export async function HEAD(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  return serveAssetFile(await assetsRoot(), (await context.params).path.join('/'), true)
}
