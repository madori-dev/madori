import { createHash } from 'node:crypto'
import * as path from 'node:path'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import { SeoStorageError } from './errors'

export function revisionFor(content: string): string { return createHash('sha256').update(content).digest('hex') }

/** Defends configured roots from traversal even when callers pass untrusted handles. */
export function pathWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/**
 * Verify lexical containment and, where adapter supports it, physical
 * containment after resolving existing symlink ancestors. This deliberately
 * degrades safely for non-node test/adaptor implementations.
 */
export async function assertSafeStoragePath(fs: FileSystemAdapter, root: string, candidate: string): Promise<void> {
  if (path.resolve(root) !== path.resolve(candidate) && !pathWithin(root, candidate)) throw new SeoStorageError('SEO storage path escapes configured root')
  if (!fs.realpath) return

  const realRoot = await fs.realpath(root).catch(() => null)
  if (!realRoot) return
  let existing = candidate
  while (true) {
    const resolved = await fs.realpath(existing).catch(() => null)
    if (resolved) {
      const relative = path.relative(realRoot, resolved)
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new SeoStorageError('SEO storage path escapes configured root through a symlink')
      }
      return
    }
    const parent = path.dirname(existing)
    if (parent === existing || !pathWithin(root, parent)) return
    existing = parent
  }
}

export function immutable<T>(value: T): T {
  if (!value || typeof value !== 'object') return value
  Object.freeze(value)
  for (const item of Object.values(value as Record<string, unknown>)) immutable(item)
  return value
}
