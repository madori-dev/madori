import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as tar from 'tar'

const BACKUP_DIR = 'madori-backup'
const MANIFEST_FILE = 'manifest.json'

export interface BackupRoot {
  name: string
  path: string
}

interface BackupFile {
  path: string
  bytes: number
  sha256: string
}

export interface BackupManifest {
  formatVersion: 1
  createdAt: string
  roots: Array<{
    name: string
    existed: boolean
    kind: 'file' | 'directory'
    files: BackupFile[]
  }>
}

export interface BackupResult {
  archivePath: string
  manifest: BackupManifest
  totalBytes: number
  totalFiles: number
}

export interface RestoreResult {
  restoredRoots: string[]
  rollbackDirectory: string
}

function assertRootName(name: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(`Invalid backup root name: ${name}`)
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function hashFile(filePath: string): Promise<{ bytes: number; sha256: string }> {
  const content = await fs.readFile(filePath)
  return {
    bytes: content.byteLength,
    sha256: createHash('sha256').update(content).digest('hex'),
  }
}

async function collectFiles(rootPath: string, currentPath = rootPath): Promise<BackupFile[]> {
  const stat = await fs.lstat(currentPath)
  if (stat.isSymbolicLink()) throw new Error(`Backup root contains unsupported symbolic link: ${currentPath}`)
  if (stat.isFile()) {
    const hash = await hashFile(currentPath)
    return [{ path: path.relative(rootPath, currentPath) || path.basename(rootPath), ...hash }]
  }
  if (!stat.isDirectory()) return []

  const files: BackupFile[] = []
  const entries = await fs.readdir(currentPath, { withFileTypes: true })
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(currentPath, entry.name)
    if (entry.isSymbolicLink()) {
      throw new Error(`Backup root contains unsupported symbolic link: ${entryPath}`)
    }
    if (entry.isDirectory()) {
      files.push(...await collectFiles(rootPath, entryPath))
    } else if (entry.isFile()) {
      const hash = await hashFile(entryPath)
      files.push({ path: path.relative(rootPath, entryPath).replaceAll(path.sep, '/'), ...hash })
    }
  }
  return files
}

async function copyRoot(source: string, destination: string): Promise<'file' | 'directory'> {
  const stat = await fs.lstat(source)
  if (stat.isSymbolicLink()) throw new Error(`Backup root contains unsupported symbolic link: ${source}`)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  if (stat.isFile()) {
    await fs.copyFile(source, destination)
    return 'file'
  }
  if (!stat.isDirectory()) throw new Error(`Unsupported backup root type: ${source}`)
  await fs.cp(source, destination, { recursive: true, force: false, errorOnExist: true })
  return 'directory'
}

export async function createOperationalBackup(input: {
  outputPath: string
  roots: BackupRoot[]
}): Promise<BackupResult> {
  const archivePath = input.outputPath.endsWith('.tar.gz')
    ? path.resolve(input.outputPath)
    : path.resolve(`${input.outputPath}.tar.gz`)
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-backup-'))
  const contentRoot = path.join(temporary, BACKUP_DIR)
  const dataRoot = path.join(contentRoot, 'data')

  try {
    await fs.mkdir(dataRoot, { recursive: true })
    const names = new Set<string>()
    const roots: BackupManifest['roots'] = []

    for (const root of input.roots) {
      assertRootName(root.name)
      if (names.has(root.name)) throw new Error(`Duplicate backup root: ${root.name}`)
      names.add(root.name)

      const source = path.resolve(root.path)
      if (!await exists(source)) {
        roots.push({ name: root.name, existed: false, kind: 'directory', files: [] })
        continue
      }

      const destination = path.join(dataRoot, root.name)
      const kind = await copyRoot(source, destination)
      const files = await collectFiles(destination)
      roots.push({ name: root.name, existed: true, kind, files })
    }

    const manifest: BackupManifest = {
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      roots,
    }
    await fs.writeFile(path.join(contentRoot, MANIFEST_FILE), JSON.stringify(manifest, null, 2), 'utf8')
    await fs.mkdir(path.dirname(archivePath), { recursive: true })
    const archiveTemporary = await fs.mkdtemp(path.join(path.dirname(archivePath), '.madori-archive-'))
    try {
      const pendingArchive = path.join(archiveTemporary, path.basename(archivePath))
      await tar.create({ cwd: temporary, file: pendingArchive, gzip: true, portable: true }, [BACKUP_DIR])
      await fs.chmod(pendingArchive, 0o600)
      await fs.rename(pendingArchive, archivePath)
    } finally {
      await fs.rm(archiveTemporary, { recursive: true, force: true })
    }

    return {
      archivePath,
      manifest,
      totalFiles: roots.reduce((total, root) => total + root.files.length, 0),
      totalBytes: roots.flatMap((root) => root.files).reduce((total, file) => total + file.bytes, 0),
    }
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
}

function parseManifest(value: unknown): BackupManifest {
  if (!value || typeof value !== 'object') throw new Error('Backup manifest must be an object.')
  const manifest = value as Partial<BackupManifest>
  if (manifest.formatVersion !== 1 || !Array.isArray(manifest.roots)) {
    throw new Error('Unsupported or malformed backup manifest.')
  }
  for (const root of manifest.roots) {
    assertRootName(root.name)
    if (typeof root.existed !== 'boolean' || !['file', 'directory'].includes(root.kind) || !Array.isArray(root.files)) {
      throw new Error(`Malformed backup root: ${root.name}`)
    }
    for (const file of root.files) {
      if (!file.path || path.isAbsolute(file.path) || file.path.split('/').includes('..') || !/^[a-f0-9]{64}$/.test(file.sha256)) {
        throw new Error(`Unsafe or malformed backup file entry in ${root.name}.`)
      }
    }
  }
  return manifest as BackupManifest
}

async function extractAndVerify(archivePath: string): Promise<{ temporary: string; manifest: BackupManifest }> {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-restore-'))
  try {
    await tar.extract({ cwd: temporary, file: path.resolve(archivePath), strict: true, preservePaths: false })
    const contentRoot = path.join(temporary, BACKUP_DIR)
    const raw = await fs.readFile(path.join(contentRoot, MANIFEST_FILE), 'utf8')
    const manifest = parseManifest(JSON.parse(raw) as unknown)

    for (const root of manifest.roots) {
      if (!root.existed) continue
      const source = path.join(contentRoot, 'data', root.name)
      if (!await exists(source)) throw new Error(`Backup data missing for root: ${root.name}`)
      const actualFiles = await collectFiles(source)
      if (actualFiles.length !== root.files.length) throw new Error(`Backup file count mismatch for root: ${root.name}`)
      const expected = new Map(root.files.map((file) => [file.path, file]))
      for (const file of actualFiles) {
        const expectedFile = expected.get(file.path)
        if (!expectedFile || expectedFile.bytes !== file.bytes || expectedFile.sha256 !== file.sha256) {
          throw new Error(`Backup checksum mismatch: ${root.name}/${file.path}`)
        }
      }
    }
    return { temporary, manifest }
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true })
    throw error
  }
}

export async function verifyOperationalBackup(archivePath: string): Promise<BackupManifest> {
  const verified = await extractAndVerify(archivePath)
  await fs.rm(verified.temporary, { recursive: true, force: true })
  return verified.manifest
}

export async function restoreOperationalBackup(input: {
  archivePath: string
  roots: BackupRoot[]
  rollbackDirectory: string
}): Promise<RestoreResult> {
  const verified = await extractAndVerify(input.archivePath)
  const destinations = new Map(input.roots.map((root) => [root.name, path.resolve(root.path)]))
  const rollbackDirectory = path.resolve(input.rollbackDirectory)
  const restoredRoots: string[] = []
  const attemptedRoots: string[] = []

  try {
    await fs.mkdir(rollbackDirectory, { recursive: true })
    for (const root of verified.manifest.roots) {
      const destination = destinations.get(root.name)
      if (!destination) throw new Error(`Restore destination missing for root: ${root.name}`)
      const rollback = path.join(rollbackDirectory, root.name)
      if (await exists(destination)) await copyRoot(destination, rollback)

      attemptedRoots.push(root.name)
      await fs.rm(destination, { recursive: true, force: true })
      if (root.existed) {
        await copyRoot(path.join(verified.temporary, BACKUP_DIR, 'data', root.name), destination)
      }
      restoredRoots.push(root.name)
    }
    return { restoredRoots, rollbackDirectory }
  } catch (error) {
    for (const name of [...attemptedRoots].reverse()) {
      const destination = destinations.get(name)
      if (!destination) continue
      await fs.rm(destination, { recursive: true, force: true })
      const rollback = path.join(rollbackDirectory, name)
      if (await exists(rollback)) await copyRoot(rollback, destination)
    }
    throw error
  } finally {
    await fs.rm(verified.temporary, { recursive: true, force: true })
  }
}
