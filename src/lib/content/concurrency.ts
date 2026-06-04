import * as crypto from 'crypto'
import type { Entry } from '@/lib/types'
import type { EntryInput } from './engine'
import { ConflictError } from '@/lib/errors'

export interface HashedEntry {
  entry: Entry
  contentHash: string
}

export interface UpdateWithHash {
  data: Partial<EntryInput>
  contentHash: string
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
