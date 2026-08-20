import { execFile } from 'child_process'
import { mkdtemp, mkdir, realpath, readdir, rm, stat, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import { afterEach, describe, expect, it } from 'vitest'
import { GitSyncCoordinator, getScopedStatus, groupPathsByRepository, pushRepository, redactGitText } from '..'

const exec = promisify(execFile)
const temporary: string[] = []
async function git(cwd: string, ...args: string[]) { return exec('git', args, { cwd }) }
async function repository(name: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `madori-git-${name}-`)); temporary.push(root)
  await git(root, 'init'); await git(root, 'config', 'user.name', 'Test User'); await git(root, 'config', 'user.email', 'test@example.test')
  return root
}
afterEach(async () => { await Promise.all(temporary.splice(0).map(folder => rm(folder, { recursive: true, force: true }))) })

describe('Git core', () => {
  it('groups paths from one and separate repositories', async () => {
    const app = await repository('app'); const content = await repository('content')
    const appFile = path.join(app, 'content', 'one.md'); const contentFile = path.join(content, 'two.md')
    await mkdir(path.dirname(appFile), { recursive: true }); await writeFile(appFile, 'one')
    await writeFile(contentFile, 'two')
    const grouped = await groupPathsByRepository([appFile, contentFile])
    expect(grouped.get(await realpath(app))).toEqual(['content/one.md'])
    expect(grouped.get(await realpath(content))).toEqual(['two.md'])
    expect((await groupPathsByRepository([app])).get(await realpath(app))).toEqual(['.'])
  })

  it('commits modifications and deletions only within submitted paths', async () => {
    const root = await repository('scoped'); const state = path.join(root, '.madori-state')
    const tracked = path.join(root, 'content', 'one.md'); const unrelated = path.join(root, 'unrelated.md')
    await mkdir(path.dirname(tracked), { recursive: true }); await writeFile(tracked, 'before'); await writeFile(unrelated, 'before')
    await git(root, 'add', '.'); await git(root, 'commit', '-m', 'initial')
    await writeFile(tracked, 'after'); await rm(tracked); await writeFile(unrelated, 'changed')
    const sync = new GitSyncCoordinator({ statePath: state, debounceMs: 100_000, botAuthor: { name: 'Madori', email: 'bot@example.test' } })
    await sync.enqueue({ paths: [tracked], message: 'Deleted one' }); const result = await sync.syncAll()
    expect(result[0].committed).toBe(true)
    expect((await getScopedStatus(root, ['unrelated.md'])).length).toBe(1)
    expect((await git(root, 'show', '--name-only', '--format=').then(value => value.stdout)).trim()).toBe('content/one.md')
  })

  it('excludes pre-staged unrelated files and leaves their index state untouched', async () => {
    const root = await repository('prestaged'); const state = path.join(root, '.state')
    const tracked = path.join(root, 'content', 'entry.md'); const sensitive = path.join(root, 'sensitive.env')
    await mkdir(path.dirname(tracked), { recursive: true }); await writeFile(tracked, 'before'); await writeFile(sensitive, 'before')
    await git(root, 'add', '.'); await git(root, 'commit', '-m', 'initial')
    await writeFile(sensitive, 'SECRET=must-not-commit'); await git(root, 'add', 'sensitive.env')
    await writeFile(tracked, 'after')
    const sync = new GitSyncCoordinator({ statePath: state, debounceMs: 100_000 })
    await sync.enqueue({ paths: [tracked], message: 'Updated entry' }); await sync.syncAll()
    const committed = (await git(root, 'show', '--name-only', '--format=').then(value => value.stdout)).trim().split('\n')
    expect(committed).toEqual(['content/entry.md'])
    expect((await git(root, 'diff', '--cached', '--name-only').then(value => value.stdout)).trim()).toBe('sensitive.env')
    expect((await git(root, 'show', 'HEAD:sensitive.env').then(value => value.stdout)).trim()).toBe('before')
  })

  it('coalesces concurrent changes into one commit with co-authors', async () => {
    const root = await repository('coalesce'); const state = path.join(root, '.state')
    const first = path.join(root, 'first.md'); const second = path.join(root, 'second.md')
    await writeFile(first, '1'); await writeFile(second, '2')
    const sync = new GitSyncCoordinator({ statePath: state, debounceMs: 100_000 })
    await Promise.all([
      sync.enqueue({ paths: [first], message: 'First', author: { name: 'Ada', email: 'ada@test' } }),
      sync.enqueue({ paths: [second], message: 'Second', author: { name: 'Lin', email: 'lin@test' } }),
    ])
    const [result] = await sync.syncAll()
    expect(result.committed).toBe(true)
    const log = await git(root, 'log', '-1', '--format=%B').then(value => value.stdout)
    expect(log).toContain('Co-authored-by: Lin <lin@test>')
  })

  it('restores durable pending work after a process restart', async () => {
    const root = await repository('recovery'); const state = path.join(root, '.state'); const file = path.join(root, 'recovered.md')
    await writeFile(file, 'pending')
    const first = new GitSyncCoordinator({ statePath: state, debounceMs: 100_000 })
    await first.enqueue({ paths: [file], message: 'Recovered change' })
    const restarted = new GitSyncCoordinator({ statePath: state, debounceMs: 100_000 })
    const results = await restarted.recover()
    expect(results[0].committed).toBe(true)
    expect((await git(root, 'log', '-1', '--format=%s').then(value => value.stdout)).trim()).toContain('Recovered change')
  })

  it('ignores corrupt or tampered durable state and protects state directory permissions', async () => {
    const root = await repository('corrupt-state'); const state = path.join(root, '.state'); const file = path.join(root, 'pending.md')
    await writeFile(file, 'pending')
    const first = new GitSyncCoordinator({ statePath: state, debounceMs: 100_000 })
    await first.enqueue({ paths: [file], message: 'Safe change' })
    expect((await stat(state)).mode & 0o777).toBe(0o700)
    const [stateFile] = (await readdir(state)).filter((name) => name.endsWith('.json'))
    await writeFile(path.join(state, stateFile), JSON.stringify({ repository: root, paths: ['../outside'], messages: ['bad'], authors: [], pushPending: false }))

    const restarted = new GitSyncCoordinator({ statePath: state, debounceMs: 100_000 })
    await restarted.restore()
    expect(await restarted.listPending()).toEqual([])
    expect(await restarted.syncAll()).toEqual([])
    await expect(git(root, 'rev-parse', 'HEAD')).rejects.toBeDefined()
  })

  it('keeps meaningful pending message when manual sync re-enqueues paths', async () => {
    const root = await repository('manual-message'); const state = path.join(root, '.state'); const file = path.join(root, 'entry.md')
    await writeFile(file, 'content')
    const automatic = new GitSyncCoordinator({ statePath: state, debounceMs: 100_000 })
    await automatic.enqueue({ paths: [file], message: 'Updated entry: welcome' }); automatic.stop()
    const manual = new GitSyncCoordinator({ statePath: state, debounceMs: 100_000 })
    await manual.enqueue({ paths: [file], message: 'Manual Git sync' }); await manual.syncAll()
    expect((await git(root, 'log', '-1', '--format=%s').then(value => value.stdout)).trim()).toBe('[Madori] Updated entry: welcome')
  })

  it('serialises independent coordinators and keeps both mutations', async () => {
    const root = await repository('multi-process'); const state = path.join(root, '.state')
    const firstFile = path.join(root, 'first.md'); const secondFile = path.join(root, 'second.md')
    await writeFile(firstFile, 'first'); await writeFile(secondFile, 'second')
    const first = new GitSyncCoordinator({ statePath: state, debounceMs: 100_000 })
    const second = new GitSyncCoordinator({ statePath: state, debounceMs: 100_000 })
    await Promise.all([first.enqueue({ paths: [firstFile], message: 'First' }), second.enqueue({ paths: [secondFile], message: 'Second' })])
    const [result] = await first.syncAll()
    expect(result.paths.sort()).toEqual(['first.md', 'second.md'])
  })

  it('reports a successful retry, redacts failures, and exposes only safe pending status', async () => {
    const root = await repository('retry'); const state = path.join(root, '.state'); const remote = await mkdtemp(path.join(os.tmpdir(), 'madori-git-retry-')); temporary.push(remote)
    await git(remote, 'init', '--bare'); await git(root, 'remote', 'add', 'origin', 'https://secret-token@example.test/repo.git')
    const file = path.join(root, 'queued.md'); await writeFile(file, 'queued')
    const sync = new GitSyncCoordinator({ statePath: state, debounceMs: 100_000, push: true })
    await sync.enqueue({ paths: [file], message: 'Queue push' })
    await expect(sync.syncAll()).rejects.toMatchObject({ code: 'PUSH_FAILED' })
    const [pending] = await sync.listPending()
    expect(pending.id).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(pending)).not.toContain(root)
    expect(pending.lastError).not.toContain('secret-token')
    await git(root, 'remote', 'set-url', 'origin', remote)
    const retried = await sync.retryPush(pending.id)
    expect(retried.pushed).toBe(true)
    expect(redactGitText('fatal: https://secret-token@example.test/repo')).not.toContain('secret-token')
  })

  it('preserves porcelain rename destination and source paths', async () => {
    const root = await repository('rename'); await writeFile(path.join(root, 'before.md'), 'before'); await git(root, 'add', '.'); await git(root, 'commit', '-m', 'initial')
    await git(root, 'mv', 'before.md', 'after.md')
    const [entry] = await getScopedStatus(root, ['.'])
    expect(entry).toMatchObject({ path: 'after.md', originalPath: 'before.md', status: 'renamed' })
  })

  it('rejects option-like and control-character Git inputs before persisting work', async () => {
    const root = await repository('validation'); const file = path.join(root, 'safe.md'); await writeFile(file, 'safe')
    expect(() => new GitSyncCoordinator({ statePath: path.join(root, '.state'), remote: '--upload-pack=bad' })).toThrow('Invalid Git remote')
    const sync = new GitSyncCoordinator({ statePath: path.join(root, '.state') })
    await expect(sync.enqueue({ paths: [file], message: 'bad\nmessage' })).rejects.toThrow('Invalid Git mutation message')
    await expect(sync.enqueue({ paths: [file], message: 'safe', author: { name: 'bad\nname', email: 'bad@test' } })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('cancels scheduled debounce work when stopped', async () => {
    const root = await repository('stop'); const file = path.join(root, 'pending.md'); await writeFile(file, 'pending')
    const sync = new GitSyncCoordinator({ statePath: path.join(root, '.state'), debounceMs: 10 })
    await sync.enqueue({ paths: [file], message: 'Must remain pending' })
    sync.stop()
    await new Promise(resolve => setTimeout(resolve, 40))
    await expect(git(root, 'rev-parse', 'HEAD')).rejects.toBeDefined()
    expect((await sync.listPending())[0].pendingPathCount).toBe(1)
  })

  it('pushes to a local bare remote and does not retry a rejected divergent push destructively', async () => {
    const source = await repository('source'); const remote = await mkdtemp(path.join(os.tmpdir(), 'madori-git-remote-')); temporary.push(remote)
    await git(remote, 'init', '--bare'); await git(source, 'remote', 'add', 'origin', remote)
    await writeFile(path.join(source, 'one.md'), 'one'); await git(source, 'add', '.'); await git(source, 'commit', '-m', 'initial'); await pushRepository(source)
    const other = await mkdtemp(path.join(os.tmpdir(), 'madori-git-other-')); temporary.push(other)
    await git(process.cwd(), 'clone', remote, other); await git(other, 'config', 'user.name', 'Other'); await git(other, 'config', 'user.email', 'other@test')
    await writeFile(path.join(other, 'other.md'), 'remote'); await git(other, 'add', '.'); await git(other, 'commit', '-m', 'remote'); await git(other, 'push')
    await writeFile(path.join(source, 'local.md'), 'local'); await git(source, 'add', '.'); await git(source, 'commit', '-m', 'local')
    await expect(pushRepository(source)).rejects.toMatchObject({ code: 'PUSH_FAILED' })
    expect((await git(source, 'status', '--porcelain').then(value => value.stdout)).trim()).toBe('')
  })
})
