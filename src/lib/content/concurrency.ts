import * as crypto from 'crypto'
import type { Entry } from '@/lib/types'
import type { EntryInput } from './engine'
import { ConflictError } from '@/lib/errors'
import * as path from 'path'

export interface HashedEntry {
  entry: Entry
  contentHash: string
}

export interface UpdateWithHash {
  data: Partial<EntryInput>
  contentHash: string
}

// One writable app process may construct multiple engine/store instances. Keep
// each file transaction serialized across all of them.
const fileLocks = new Map<string, Promise<void>>()

export async function withFileLocks<T>(paths: string[], operation: () => Promise<T>): Promise<T> {
  const keys = [...new Set(paths.map((filePath) => path.resolve(filePath)))].sort()
  const previous = keys.map((key) => fileLocks.get(key) ?? Promise.resolve())
  let release!: () => void
  const completion = new Promise<void>((resolve) => { release = resolve })
  for (const key of keys) fileLocks.set(key, completion)
  await Promise.all(previous)
  try {
    return await operation()
  } finally {
    release()
    for (const key of keys) {
      if (fileLocks.get(key) === completion) fileLocks.delete(key)
    }
  }
}

/**
 * Compute a SHA-256 hash of file content for optimistic concurrency.
 * Returns the hex-encoded digest.
 */
export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
}

/**
 * Verify that the submitted hash matches the current file content.
 * Throws ConflictError with both hashes if they differ.
 */
export function verifyContentHash(submittedHash: string, currentContent: string): void {
  const currentHash = computeContentHash(currentContent)

  if (submittedHash !== currentHash) {
    throw new ConflictError(
      `Content has been modified since it was loaded (submitted: ${submittedHash}, current: ${currentHash})`,
      submittedHash,
      currentHash
    )
  }
}
