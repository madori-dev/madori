import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { MadoriConfigService, rewriteConfigFile } from '@/lib/settings/config'

const roots: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('configuration source edits', () => {
  it('keeps environment expressions private across unrelated settings saves', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'madori-config-source-'))
    roots.push(root)
    const file = path.join(root, 'madori.config.ts')
    vi.stubEnv('MADORI_TEST_PRIVATE', 'test-only-secret')
    await writeFile(file, `export default {
  auth: { driver: 'password', driverConfig: { secret: process.env.MADORI_TEST_PRIVATE } },
  graphql: { introspection: process.env.NODE_ENV !== 'production' },
  cp: { enabled: true, path: '/cp' },
}\n`)
    const service = new MadoriConfigService(file)
    const publicConfig = await service.readPublic()
    await service.write({ ...publicConfig, cp: { ...publicConfig.cp, enabled: false } })
    const source = await readFile(file, 'utf8')
    expect(source).toContain('process.env.MADORI_TEST_PRIVATE')
    expect(source).not.toContain('test-only-secret')
    expect(source).toContain("process.env.NODE_ENV !== 'production'")
    expect((await service.read()).cp.enabled).toBe(false)
  })

  it('retains alternate export bindings, comments and unrelated code', () => {
    const source = `// Keep this explanation\nconst settings = { cp: { enabled: true, path: '/cp' } } satisfies Record<string, unknown>\nexport default settings\n`
    const edited = rewriteConfigFile(source, { cp: { enabled: false } })
    expect(edited).toContain('export default settings')
    expect(edited).toContain('// Keep this explanation')
    expect(edited).toContain("path: '/cp'")
    expect(edited).toContain('enabled: false')
  })

  it('rejects edits that a later spread would silently override', () => {
    const source = "const overrides = { enabled: true }; export default { cp: { enabled: true, ...overrides } }"
    expect(() => rewriteConfigFile(source, { cp: { enabled: false } })).toThrow(/overridden by a spread/)
  })

  it('preserves concurrent independent settings edits across service instances', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'madori-config-concurrent-'))
    roots.push(root)
    const file = path.join(root, 'madori.config.ts')
    await writeFile(file, 'export default {}')
    await Promise.all([
      new MadoriConfigService(file).write({ cp: { enabled: false } }),
      new MadoriConfigService(file).write({ graphql: { introspection: false } }),
    ])
    const config = await new MadoriConfigService(file).read()
    expect(config.cp.enabled).toBe(false)
    expect(config.graphql.introspection).toBe(false)
  })

  it('fails safely for computed configuration rather than reconstructing evaluated secrets', () => {
    expect(() => rewriteConfigFile('export default buildConfig()\n', { cp: { enabled: false } })).toThrow(/object literal/i)
  })
})
