import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateSeoFiles, rollbackSeoMigration } from '../migrate-seo.js'

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'madori-seo-migration-'))
  await writeFile(
    path.join(root, 'article.md'),
    [
      '---',
      'title: Launch',
      'meta_title: Launch | Madori',
      'meta_description: A useful description',
      'custom_field: keep-me',
      '---',
      '',
      'Body',
      '',
    ].join('\n'),
  )
  return root
}

describe('SEO migration CLI', () => {
  it('supports dry runs without changing files or creating backups', async () => {
    const root = await fixtureRoot()
    try {
      const before = await readFile(path.join(root, 'article.md'), 'utf8')
      const result = await migrateSeoFiles({ root, dryRun: true })

      expect(result.dryRun).toBe(true)
      expect(result.filesScanned).toBe(1)
      expect(result.filesChanged).toBe(1)
      expect(await readFile(path.join(root, 'article.md'), 'utf8')).toBe(before)
      expect(await readdir(root)).toEqual(['article.md'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('writes nested SEO values, preserves unknown fields, and rolls back', async () => {
    const root = await fixtureRoot()
    const filePath = path.join(root, 'article.md')
    try {
      const before = await readFile(filePath, 'utf8')
      const result = await migrateSeoFiles({ root })
      const migrated = await readFile(filePath, 'utf8')

      expect(result.filesChanged).toBe(1)
      expect(migrated).toContain('seo:')
      expect(migrated).toContain('title: Launch | Madori')
      expect(migrated).toContain('custom_field: keep-me')
      expect(result.rollbackPlan[0]?.backup).toMatch(/\.seo-migration\.bak$/)
      expect(result.rollbackPlan[0]?.migratedContentHash).toMatch(/^[a-f0-9]{64}$/)

      const rollback = await rollbackSeoMigration(result)
      expect(rollback.restored).toEqual([filePath])
      expect(await readFile(filePath, 'utf8')).toBe(before)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses rollback when a migrated file has changed', async () => {
    const root = await fixtureRoot()
    const filePath = path.join(root, 'article.md')
    try {
      const result = await migrateSeoFiles({ root })
      await writeFile(filePath, 'editor changed this after migration', 'utf8')
      const rollback = await rollbackSeoMigration(result)
      expect(rollback.restored).toEqual([])
      expect(rollback.errors[0]?.message).toContain('refusing to overwrite')
      expect(await readFile(filePath, 'utf8')).toBe('editor changed this after migration')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
