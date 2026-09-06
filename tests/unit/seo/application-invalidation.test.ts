import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { MadoriConfigSchema, type MadoriConfig } from '@/lib/config/schema'
import { getMadori, shutdownMadori } from '@/lib/madori'

let config: MadoriConfig
let root: string
vi.mock('@/lib/config/loader', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/config/loader')>(),
  loadConfig: async () => config,
}))

async function write(relative: string, value: string) {
  const target = path.join(root, relative)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, value)
}
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'madori-seo-invalidation-'))
  config = MadoriConfigSchema.parse({
    contentPath: path.join(root, 'content'), resourcesPath: path.join(root, 'resources'),
    usersPath: path.join(root, 'users'), assetsPath: path.join(root, 'assets'),
    sites: [{handle:'default', url:'https://example.test', locale:'en-GB', default:true}],
    git: {enabled:false}, seo: {operationalStoragePath:path.join(root,'seo')},
  })
  await Promise.all(['content','resources','users','assets'].map(name => mkdir(path.join(root,name))))
  await write('resources/collections/blog.yaml', 'title: Blog\nblueprint: blog\nroute: /blog/{slug}\n')
  await write('content/collections/blog/post.md', '---\ntitle: Before\nstatus: published\n---\nBody\n')
})
afterEach(async () => {
  await shutdownMadori()
  await rm(root, {recursive:true,force:true})
})

it('refreshes cached SEO after external content and route-definition edits', async () => {
  const app = await getMadori()
  const request = {site:'default',collection:'blog',slug:'post'}
  expect((await app.seoRuntime.resolveEntry(request))?.view.title).toBe('Before')
  expect((await app.seoRuntime.sitemap('default')).urls[0].url).toBe('https://example.test/blog/post')
  await write('content/collections/blog/post.md', '---\ntitle: After\nstatus: published\n---\nBody\n')
  await vi.waitFor(async () => expect((await app.seoRuntime.resolveEntry(request))?.view.title).toBe('After'))
  await write('resources/collections/blog.yaml', 'title: Blog\nblueprint: blog\nroute: /journal/{slug}\n')
  await vi.waitFor(async () => expect((await app.seoRuntime.sitemap('default')).urls[0].url).toBe('https://example.test/journal/post'))
})

it('invalidates SEO synchronously when a definition mutation becomes durable', async () => {
  const app = await getMadori()
  await app.seoRuntime.sitemap('default')
  expect(app.seoRuntime.cache.size).toBeGreaterThan(0)
  app.mutationBus.report({action:'update',paths:[path.join(root,'resources/collections/blog.yaml')],resource:{type:'definition',handle:'collections',id:'blog'},message:'Updated route',source:'control-panel',timestamp:Date.now()})
  expect(app.seoRuntime.cache.size).toBe(0)
})
