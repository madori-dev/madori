import { execFile } from 'child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { promisify } from 'util'
import { describe, expect, it } from 'vitest'
import { MadoriConfigSchema } from '@/lib/config/schema'
import { GitSyncRuntime } from '../runtime'
import { ContentMutationBus } from '@/lib/mutations'

const exec = promisify(execFile)

describe('GitSyncRuntime', () => {
  it('commits only configured content path and returns opaque repository IDs', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'madori-git-runtime-'))
    try {
      await exec('git', ['init'], { cwd: root })
      await exec('git', ['config', 'user.name', 'Test User'], { cwd: root })
      await exec('git', ['config', 'user.email', 'test@example.test'], { cwd: root })
      await mkdir(path.join(root, 'content'), { recursive: true })
      await writeFile(path.join(root, 'content', 'welcome.md'), '---\ntitle: Welcome\n---\nHello\n')
      await writeFile(path.join(root, 'unrelated.txt'), 'do not commit\n')

      const config = MadoriConfigSchema.parse({
        contentPath: path.join(root, 'content'), resourcesPath: path.join(root, 'resources'),
        usersPath: path.join(root, 'users'), assetsPath: path.join(root, 'assets'),
        git: { enabled: true, automatic: false, trackedPaths: [{ root: 'content', exclude: [] }], statePath: path.join(root, '.state') },
      })
      const runtime = new GitSyncRuntime(config, root)
      await runtime.start(new ContentMutationBus())

      const before = await runtime.status()
      expect(before).toHaveLength(1)
      expect(before[0].id).toMatch(/^[a-f0-9]{64}$/)
      expect(JSON.stringify(before)).not.toContain(root)

      const result = await runtime.sync(before[0].id)
      expect(result[0].committed).toBe(true)
      expect(JSON.stringify(result)).not.toContain(root)
      expect(result[0].repository).toBe(before[0].id)
      const committed = await exec('git', ['show', '--name-only', '--format='], { cwd: root })
      expect(committed.stdout).toContain('content/welcome.md')
      expect(committed.stdout).not.toContain('unrelated.txt')
      expect((await runtime.status())[0].status).toBe('clean')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
