import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export async function readCacheGeneration(storagePath: string): Promise<string> {
  try {
    return await fs.readFile(path.join(storagePath, '.generation'), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  }
}

export async function advanceCacheGeneration(storagePath: string): Promise<string> {
  await fs.mkdir(storagePath, { recursive: true })
  const generation = randomUUID()
  const marker = path.join(storagePath, '.generation')
  const temporary = `${marker}.${generation}.tmp`
  try {
    await fs.writeFile(temporary, generation, 'utf8')
    await fs.rename(temporary, marker)
  } finally {
    await fs.unlink(temporary).catch(() => undefined)
  }
  return generation
}
