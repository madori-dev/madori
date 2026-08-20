import { describe, expect, it } from 'vitest'
import { GitConfigSchema, MadoriConfigSchema } from '@/lib/config/schema'

describe('GitConfigSchema', () => {
  it('provides safe disabled defaults', () => {
    const config = MadoriConfigSchema.parse({}).git

    expect(config).toMatchObject({
      enabled: false,
      automatic: true,
      push: false,
      debounceMs: 2000,
      remote: 'origin',
      commitPrefix: '[Madori]',
      commandTimeoutMs: 30_000,
      lockTimeoutMs: 120_000,
      statePath: './storage/git-sync',
    })
    expect(config.trackedPaths).toEqual([
      { root: 'content', exclude: ['forms/**'] },
      { root: 'resources', exclude: [] },
    ])
    expect(config.author).toEqual({ useAuthenticated: true, name: 'Madori', email: 'madori@localhost' })
  })

  it('supports external repositories and opt-in roots', () => {
    const config = GitConfigSchema.parse({
      trackedPaths: [
        { root: '/srv/content-repository/content', exclude: ['forms/**'] },
        { root: 'assets' },
        { root: 'users' },
      ],
      branch: 'main',
    })

    expect(config.trackedPaths.map(({ root }) => root)).toEqual([
      '/srv/content-repository/content', 'assets', 'users',
    ])
    expect(config.branch).toBe('main')
  })

  it('rejects unsafe path and commit-prefix values', () => {
    expect(GitConfigSchema.safeParse({ statePath: 'bad\0path' }).success).toBe(false)
    expect(GitConfigSchema.safeParse({ trackedPaths: [{ root: ' ' }] }).success).toBe(false)
    expect(GitConfigSchema.safeParse({ commitPrefix: 'bad\nheader' }).success).toBe(false)
  })
})
