import * as fs from 'fs/promises'
import * as path from 'path'

export interface ExportManifest {
  version: string
  exportedAt: string
  resources: {
    blueprints: string[]
    collections: string[]
    fieldsets: string[]
    content: string[]
  }
}

const MADORI_VERSION = '0.1.0'

/**
 * Creates a new export manifest with the current version and timestamp.
 */
export function createManifest(resources: ExportManifest['resources']): ExportManifest {
  return {
    version: MADORI_VERSION,
    exportedAt: new Date().toISOString(),
    resources,
  }
}

/**
 * Reads and parses a manifest.json file, validating its structure.
 */
export async function readManifest(filePath: string): Promise<ExportManifest> {
  const raw = await fs.readFile(filePath, 'utf-8')
  const parsed: unknown = JSON.parse(raw)

  if (!isValidManifest(parsed)) {
    throw new Error(`Invalid manifest at ${filePath}: missing or malformed required fields`)
  }

  return parsed
}

/**
 * Writes a manifest as formatted JSON to the specified path.
 */
export async function writeManifest(filePath: string, manifest: ExportManifest): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(manifest, null, 2), 'utf-8')
}

function isValidManifest(value: unknown): value is ExportManifest {
  if (typeof value !== 'object' || value === null) return false

  const obj = value as Record<string, unknown>

  if (typeof obj.version !== 'string') return false
  if (typeof obj.exportedAt !== 'string') return false
  if (typeof obj.resources !== 'object' || obj.resources === null) return false

  const resources = obj.resources as Record<string, unknown>

  if (!Array.isArray(resources.blueprints)) return false
  if (!Array.isArray(resources.collections)) return false
  if (!Array.isArray(resources.fieldsets)) return false
  if (!Array.isArray(resources.content)) return false

  if (!resources.blueprints.every((v: unknown) => typeof v === 'string')) return false
  if (!resources.collections.every((v: unknown) => typeof v === 'string')) return false
  if (!resources.fieldsets.every((v: unknown) => typeof v === 'string')) return false
  if (!resources.content.every((v: unknown) => typeof v === 'string')) return false

  return true
}
