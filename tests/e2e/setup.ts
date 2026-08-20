import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashPassword } from '../../src/lib/auth/password'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const fixtureRoot = path.join(projectRoot, 'tests/e2e/.madori')

async function write(relativePath: string, content: string) {
  const target = path.join(fixtureRoot, relativePath)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content, 'utf8')
}

async function main() {
  await rm(fixtureRoot, { recursive: true, force: true })
  await cp(path.join(projectRoot, 'resources/roles'), path.join(fixtureRoot, 'resources/roles'), { recursive: true })
  await cp(path.join(projectRoot, 'madori.config.ts'), path.join(fixtureRoot, 'madori.config.ts'))

  const passwordHash = await hashPassword('e2e-password')
  await write('users/e2e-admin.yaml', `id: e2e-admin\nemail: e2e@example.test\nname: E2E Admin\nroles:\n  - admin\npassword_hash: ${passwordHash}\ncreated_at: 2026-01-01T00:00:00.000Z\n`)
  await write('resources/roles/e2e-scoped-editor.yaml', `handle: e2e-scoped-editor\ndisplay: E2E Scoped Editor\npermissions:\n  - resource: collections\n    actions: [view]\n  - resource: entries\n    actions: [view, create, edit]\n    scope: e2e-assigned\n`)
  await write('users/e2e-scoped-editor.yaml', `id: e2e-scoped-editor\nemail: scoped@example.test\nname: E2E Scoped Editor\nroles:\n  - e2e-scoped-editor\npassword_hash: ${passwordHash}\ncreated_at: 2026-01-01T00:00:00.000Z\n`)
  await write('content/settings.yaml', 'site_name: Madori E2E\nlocale: en-GB\ntimezone: Europe/London\n')
  await write('resources/collections/pages.yaml', 'title: Pages\nblueprint: pages\nroute: /{slug}\n')
  await write('resources/blueprints/collections/pages.yaml', `tabs:\n  main:\n    fields:\n      - handle: title\n        field:\n          type: text\n          required: true\n`)
  await write('content/collections/pages/home.md', `---\ntitle: Madori E2E\nslug: home\nstatus: published\ncreatedAt: 2026-01-01T00:00:00.000Z\nupdatedAt: 2026-01-01T00:00:00.000Z\nform_handle: e2e-contact\nseo:\n  title:\n    kind: literal\n    value: SEO Browser Title\n  description:\n    kind: literal\n    value: Public metadata from the SEO cascade.\n---\n\nBrowser workflow test site.\n`)
  await write('content/navigation/main.yaml', 'items:\n  - label: E2E article\n    entry: e2e-articles/sitemap-entry\n')
  await write('public/assets/e2e-asset.txt', 'E2E asset metadata test\n')
  await write('content/seo/redirects/legacy-e2e.yaml', 'version: 1\nid: legacy-e2e\nsite: default\nsource: /legacy-e2e\ndestination: /\nstatus: 308\nenabled: true\n')
  await write('resources/collections/e2e-articles.yaml', 'title: E2E Articles\nblueprint: e2e-articles\nroute: /e2e/{slug}\n')
  await write('resources/collections/e2e-assigned.yaml', 'title: Assigned Blueprint\nblueprint: shared-entry\nroute: /assigned/{slug}\n')
  await write('resources/collections/e2e-rich.yaml', 'title: Rich Entries\nblueprint: e2e-rich\nroute: /rich/{slug}\n')
  await write('resources/blueprints/collections/e2e-rich.yaml', `tabs:
  main:
    fields:
      - handle: content
        field:
          type: tiptap
          display: Body
          required: true
`)
  await write('resources/blueprints/collections/shared-entry.yaml', `tabs:
  main:
    display: Main
    fields:
      - handle: title
        field:
          type: text
          required: true
      - handle: hero
        field:
          type: asset
          display: Hero
    sections:
      details:
        display: Details
        fields:
          - handle: summary
            field:
              type: text
              instructions: A short summary
`)
  await write('content/collections/e2e-assigned/roundtrip.md', `---
title: Assigned entry
slug: roundtrip
status: draft
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
summary: Before
---
`)
  await write('resources/blueprints/collections/e2e-articles.yaml', `tabs:\n  main:\n    fields:\n      - handle: content\n        field:\n          type: textarea\n          display: Content\n`)
  await write('content/collections/e2e-articles/sitemap-entry.md', `---
title: Sitemap Collection Entry
slug: sitemap-entry
status: published
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
---

Collection route rendered from its configured URL.
`)
  await write('resources/taxonomies/e2e-topics.yaml', 'title: E2E Topics\nroute: /topics/{slug}\n')
  await write('content/taxonomies/e2e-topics/releases.yaml', `title: Releases
slug: releases
description: Taxonomy route rendered from its configured URL.
status: published
`)
  await write('resources/forms/e2e-contact.yaml', 'title: E2E Contact\nhoneypot: true\nstore_submissions: true\n')
  await write('resources/blueprints/forms/e2e-contact.yaml', `tabs:\n  main:\n    fields:\n      - handle: name\n        field:\n          type: text\n          required: true\n      - handle: age\n        field:\n          type: number\n          required: true\n      - handle: consent\n        field:\n          type: toggle\n          required: true\n      - handle: topics\n        field:\n          type: multiselect\n          options:\n            options: [news, events]\n`)
}

void main()
