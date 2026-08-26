import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  createOperationalBackup,
  restoreOperationalBackup,
  verifyOperationalBackup,
  type BackupRoot,
} from '../backup.js'

describe('operational backup', () => {
  let temporary: string
  let roots: BackupRoot[]

  beforeEach(async () => {
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-operational-backup-test-'))
    roots = [
      { name: 'content', path: path.join(temporary, 'project', 'content') },
      { name: 'config', path: path.join(temporary, 'project', 'madori.config.ts') },
      { name: 'missing', path: path.join(temporary, 'project', 'missing') },
    ]
    await fs.mkdir(path.join(temporary, 'project', 'content', 'collections'), { recursive: true })
    await fs.writeFile(path.join(temporary, 'project', 'content', 'collections', 'home.md'), 'original')
    await fs.writeFile(path.join(temporary, 'project', 'madori.config.ts'), 'export default {}')
  })

  afterEach(async () => {
    await fs.rm(temporary, { recursive: true, force: true })
  })

  it('creates and verifies checksummed file and directory roots', async () => {
    const result = await createOperationalBackup({
      outputPath: path.join(temporary, 'backups', 'release'),
      roots,
    })

    expect(result.archivePath).toBe(path.join(temporary, 'backups', 'release.tar.gz'))
    expect(result.totalFiles).toBe(2)
    expect((await fs.stat(result.archivePath)).mode & 0o777).toBe(0o600)
    expect(result.manifest.roots.find((root) => root.name === 'missing')?.existed).toBe(false)

    const verified = await verifyOperationalBackup(result.archivePath)
    expect(verified.formatVersion).toBe(1)
    expect(verified.roots.find((root) => root.name === 'content')?.files[0]?.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('restores backup data and retains pre-restore rollback copies', async () => {
    const backup = await createOperationalBackup({
      outputPath: path.join(temporary, 'backup'),
      roots,
    })
    await fs.writeFile(path.join(temporary, 'project', 'content', 'collections', 'home.md'), 'changed')
    await fs.writeFile(path.join(temporary, 'project', 'content', 'new.md'), 'remove me')
    await fs.writeFile(path.join(temporary, 'project', 'madori.config.ts'), 'changed config')

    const rollbackDirectory = path.join(temporary, 'rollback')
    const restored = await restoreOperationalBackup({
      archivePath: backup.archivePath,
      roots,
      rollbackDirectory,
    })

    expect(restored.restoredRoots).toEqual(['content', 'config', 'missing'])
    expect(await fs.readFile(path.join(temporary, 'project', 'content', 'collections', 'home.md'), 'utf8')).toBe('original')
    await expect(fs.access(path.join(temporary, 'project', 'content', 'new.md'))).rejects.toThrow()
    expect(await fs.readFile(path.join(rollbackDirectory, 'content', 'new.md'), 'utf8')).toBe('remove me')
    expect(await fs.readFile(path.join(temporary, 'project', 'madori.config.ts'), 'utf8')).toBe('export default {}')
  })

  it('rejects duplicate logical root names', async () => {
    await expect(createOperationalBackup({
      outputPath: path.join(temporary, 'backup'),
      roots: [roots[0]!, roots[0]!],
    })).rejects.toThrow('Duplicate backup root')
  })
})
