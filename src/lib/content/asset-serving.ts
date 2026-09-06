import { stat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { getMimeType, isActiveAssetPath } from './assets'

const SVG_EXTENSIONS = new Set(['svg'])

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

export async function serveAssetFile(rootPath: string, requestPath: string, head = false): Promise<Response> {
  if (!requestPath || requestPath.includes('\0') || requestPath.includes('\\') || requestPath.toLowerCase().endsWith('.meta.yaml')) return new Response('Not Found', { status: 404 })
  const root = path.resolve(rootPath)
  const candidate = path.resolve(root, requestPath)
  if (!isContained(root, candidate)) return new Response('Not Found', { status: 404 })
  let filePath: string
  try {
    const physicalRoot = await realpath(root)
    filePath = await realpath(candidate)
    if (filePath.toLowerCase().endsWith('.meta.yaml') || !isContained(physicalRoot, filePath) || !(await stat(filePath)).isFile()) return new Response('Not Found', { status: 404 })
  } catch {
    return new Response('Not Found', { status: 404 })
  }
  const extension = path.extname(requestPath).slice(1)
  const active = isActiveAssetPath(requestPath)
  const svg = SVG_EXTENSIONS.has(extension.toLowerCase())
  const headers = new Headers({ 'Content-Type': getMimeType(extension), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' })
  if (active || svg) {
    headers.set('Content-Disposition', `attachment; filename="${path.basename(requestPath).replace(/[^\x20-\x7e]|["\\]/g, '_')}"`)
    headers.set('Content-Security-Policy', 'sandbox')
  }
  const info = await stat(filePath)
  headers.set('Content-Length', String(info.size))
  return new Response(head ? null : await readFile(filePath), { status: 200, headers })
}
