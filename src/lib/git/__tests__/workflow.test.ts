import { execFile } from 'child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import { afterEach, describe, expect, it } from 'vitest'
import { MadoriConfigSchema } from '@/lib/config/schema'
import { ContentMutationBus } from '@/lib/mutations'
import { GitSyncCoordinator } from '../coordinator'
import { GitSyncRuntime } from '../runtime'

const exec = promisify(execFile)
const temporary: string[] = []
const git = (cwd: string, ...args: string[]) => exec('git', args, { cwd })

async function repository(name: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `madori-git-workflow-${name}-`))
  temporary.push(root)
  await git(root, 'init')
  await git(root, 'config', 'user.name', 'Test User')
  await git(root, 'config', 'user.email', 'test@example.test')
  return root
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((folder) => rm(folder, { recursive: true, force: true })))
})

describe('Git sync workflows', () => {
  it('automatically commits an external content repository and honours exclusions', async () => {
    const app = await repository('app')
    const external = await repository('external')
    const content = path.join(external, 'content')
    await mkdir(path.join(content, 'forms'), { recursive: true })
    const entry = path.join(content, 'entry.md')
    const submission = path.join(content, 'forms', 'private.yaml')
    await writeFile(entry, 'entry')
    await writeFile(submission, 'private')

    const config = MadoriConfigSchema.parse({
      contentPath: content,
      git: {
        enabled: true,
        automatic: true,
        debounceMs: 20,
        trackedPaths: [{ root: 'content', exclude: ['forms/**'] }],
        statePath: path.join(app, '.state'),
      },
    })
    const bus = new ContentMutationBus()
    const runtime = new GitSyncRuntime(config, app)
    await runtime.start(bus)
    await runtime.reportMutation({
      action: 'create',
      // Directory mutations must expand to concrete files before staging,
      // otherwise this scope would commit excluded form submissions too.
      paths: [content],
      resource: { type: 'entry', id: 'entry' },
      message: 'Created external entry',
      source: 'system',
      timestamp: Date.now(),
    })

    await new Promise((resolve) => setTimeout(resolve, 300))
    expect((await git(external, 'log', '-1', '--format=%s')).stdout.trim()).toContain('Created external entry')
    expect((await runtime.status())[0]).toMatchObject({ status: 'clean' })
    const committed = (await git(external, 'show', '--name-only', '--format=')).stdout
    expect(committed).toContain('content/entry.md')
    expect(committed).not.toContain('content/forms/private.yaml')
    runtime.stop()
  })

  it('manual sync commits both sides of a rename', async () => {
    const root = await repository('rename')
    const content = path.join(root, 'content')
    await mkdir(content, { recursive: true })
    await writeFile(path.join(content, 'before.md'), 'before')
    await git(root, 'add', '.')
    await git(root, 'commit', '-m', 'Initial')
    await git(root, 'mv', 'content/before.md', 'content/after.md')

    const config = MadoriConfigSchema.parse({
      contentPath: content,
      git: { enabled: true, automatic: false, trackedPaths: [{ root: 'content', exclude: [] }], statePath: path.join(root, '.state') },
    })
    const runtime = new GitSyncRuntime(config, root)
    await runtime.start(new ContentMutationBus())
    const [status] = await runtime.status()
    await runtime.sync(status.id)

    const names = (await git(root, 'show', '--name-status', '--format=')).stdout
    expect(names).toContain('content/before.md')
    expect(names).toContain('content/after.md')
    await expect(git(root, 'show', 'HEAD:content/after.md')).resolves.toBeDefined()
    await expect(git(root, 'show', 'HEAD:content/before.md')).rejects.toBeDefined()
    runtime.stop()
  })

  it('restores pending work without committing when automatic sync is disabled', async () => {
    const root = await repository('manual-recovery')
    const content = path.join(root, 'content')
    const state = path.join(root, '.state')
    await mkdir(content, { recursive: true })
    const entry = path.join(content, 'pending.md')
    await writeFile(entry, 'pending')
    const coordinator = new GitSyncCoordinator({ statePath: state, debounceMs: 100_000 })
    await coordinator.enqueue({ paths: [entry], message: 'Pending manual change' })
    coordinator.stop()

    const config = MadoriConfigSchema.parse({
      contentPath: content,
      git: { enabled: true, automatic: false, trackedPaths: [{ root: 'content', exclude: [] }], statePath: state },
    })
    const runtime = new GitSyncRuntime(config, root)
    await runtime.start(new ContentMutationBus())
    await expect(git(root, 'log', '-1', '--format=%s')).rejects.toBeDefined()
    const [status] = await runtime.status()
    expect(status.status).toBe('pending')
    await runtime.sync(status.id)
    expect((await git(root, 'log', '-1', '--format=%s')).stdout).toContain('Pending manual change')
    runtime.stop()
  })
})
