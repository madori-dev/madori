import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { parse as parseYaml } from 'yaml'
import { migrateSeoFiles, rollbackSeoMigration } from '../../../packages/madori-cli/src/seo/migrate-seo.js'
import { migrateSeo, scanLegacySeo, translateLegacySeo } from '@/lib/seo/migration'

describe('SEO legacy migration', () => {
  it('translates fixture fields while preserving legacy values and unknown frontmatter', async () => {
    const legacy = {
      id: 'entry-1',
      title: 'Entry',
      meta_title: 'Legacy title',
      meta_description: 'Legacy description',
      og_image: 'assets::legacy/social.jpg',
      custom: { keep: true },
    }
    const result = translateLegacySeo(legacy)
    expect(result.changed).toBe(true)
    expect(result.document).toMatchObject({
      id: 'entry-1',
      custom: { keep: true },
      meta_title: 'Legacy title',
      seo: { title: 'Legacy title', description: 'Legacy description', social: { image: 'assets::legacy/social.jpg' } },
    })
    expect(legacy).not.toHaveProperty('seo')
  })

  it('never overwrites nested values, including explicit null', () => {
    const result = translateLegacySeo({
      meta_title: 'legacy',
      meta_description: 'legacy description',
      seo: { title: 'author title', description: null },
    })
    expect(result.document.seo).toEqual({ title: 'author title', description: null })
    expect(result.migrated.map((item) => item.legacyKey)).toEqual([])
    expect(result.preserved.map((item) => item.legacyKey)).toEqual(['meta_title', 'meta_description'])
    expect(result.changed).toBe(false)
  })

  it('is idempotent and leaves documents without legacy fields byte-equivalent in meaning', () => {
    const first = translateLegacySeo({ title: 'modern', seo: { title: 'modern' }, custom: ['x'] })
    const second = translateLegacySeo(first.document)
    expect(first.changed).toBe(false)
    expect(second.changed).toBe(false)
    expect(second.document).toEqual(first.document)
  })

  it('produces dry-run operations without invoking write or backup', async () => {
    const write = vi.fn()
    const backup = vi.fn()
    const result = await migrateSeo([{ path: 'entry.md', adapter: { read: () => ({ meta_title: 'legacy' }), write, backup } }], { dryRun: true })
    expect(result.filesChanged).toBe(1)
    expect(write).not.toHaveBeenCalled()
    expect(backup).not.toHaveBeenCalled()
    expect(result.operations[0]?.afterHash).toBeDefined()
  })

  it('scans report counts and warnings without mutating input', () => {
    const documents = [{ path: 'a.md', data: { meta_title: 'A' } }, { path: 'b.md', data: { seo: 'bad', meta_title: 'B' } }]
    const report = scanLegacySeo(documents)
    expect(report).toMatchObject({ filesScanned: 2, filesChanged: 1, fieldsMigrated: 1 })
    expect(report.warnings).toHaveLength(1)
    expect(documents[0].data).not.toHaveProperty('seo')
  })

  it('migrates Markdown atomically with per-file backup and remains readable by YAML parsers', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-seo-'))
    const file = path.join(root, 'entry.md')
    await fs.writeFile(file, `---\nmeta_title: Legacy\ncustom: keep\n---\n\nBody\n`, 'utf8')
    const result = await migrateSeoFiles({ root })
    expect(result.filesChanged).toBe(1)
    expect(result.rollbackPlan[0]?.backup).toBeDefined()
    const migrated = await fs.readFile(file, 'utf8')
    expect(migrated).toContain('seo:')
    expect(migrated).toContain('meta_title: Legacy')
    expect(migrated).toContain('Body')
    const backups = (await fs.readdir(root)).filter((name) => name.includes('.seo-migration.bak'))
    expect(backups).toHaveLength(1)
    expect(parseYaml((await fs.readFile(file, 'utf8')).split('---')[1])).toMatchObject({ seo: { title: 'Legacy' } })
    const rollback = await rollbackSeoMigration(result)
    expect(rollback.restored).toEqual([file])
    expect(await fs.readFile(file, 'utf8')).toContain('meta_title: Legacy')
    expect(await fs.readFile(file, 'utf8')).not.toContain('seo:')
  })

  it('rejects a configured root that does not exist as a safe scan boundary', async () => {
    await expect(migrateSeoFiles({ root: path.join(os.tmpdir(), 'missing-madori-seo-root') })).rejects.toThrow()
  })
})
