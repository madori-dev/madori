---
title: SDK and Content Access
slug: sdk
status: published
createdAt: 2026-09-06T00:00:00.000Z
updatedAt: 2026-09-06T00:00:00.000Z
---

# SDK and Content Access

Choose a content interface according to where code runs and who may read the result. The file SDK, browser hooks and GraphQL client use different transports and do not share an authentication boundary.

## Package availability

`@madori/sdk` and `@madori/cli` are source workspace packages; neither is published in the public package registry as of 6 September 2026. Run CLI commands through `pnpm madori` in a checkout or generated application. The published scaffolder currently omits the SDK workspace.

To use SDK imports in this repository, build and link its workspace package:

```bash
pnpm --filter @madori/sdk build
pnpm add -w '@madori/sdk@workspace:*'
```

These are setup commands for an application that needs the SDK, not prerequisites for running the existing site. For a separate application, build the SDK in its source checkout and add that package directory as a local dependency using `pnpm add /path/to/madori/packages/madori-sdk`. Keep its source revision aligned with the application. A TypeScript path alias alone does not install or link a runtime dependency.

## Server-side file SDK

`createClient` reads local Markdown/YAML files. It imports Node filesystem modules and must stay out of browser bundles. Pass trusted collection/slug identifiers; this API does not authenticate callers or apply Control Panel permissions.

```ts
import { createClient, type MadoriEntryMeta } from '@madori/sdk'

type BlogEntry = MadoriEntryMeta & { summary?: string }
type Collections = { blog: BlogEntry }

const client = createClient<Collections>({
  contentPath: 'content',
  resourcesPath: 'resources',
})

const posts = await client.listEntries('blog', {
  status: 'published',
  sort: '-createdAt',
  limit: 10,
})

const candidate = await client.getEntry('blog', 'hello-world')
const publicPost = candidate?.status === 'published' ? candidate : null
```

List reads default to `status: 'published'`. Trusted server code may request `'draft'` or `'all'`. Single-entry reads return an existing entry regardless of status: check publication before exposing it publicly. Sorting uses `field` or `-field`; filters compare authored field values by equality. These reads provide types, not runtime validation or write APIs. Raw flat-file entries should contain the metadata your types require.

The client also exposes `getGlobal`, `listCollections`, `getTaxonomy` and `listTerms`. Assets remain path strings (or arrays of paths for galleries); entry relationships remain reference strings. They are not automatically expanded to asset or entry objects.

## Browser hooks and public REST

The client-hook entry point has no Node filesystem dependency. It fetches the published-entry API:

```tsx
'use client'

import { useMadoriEntries } from '@madori/sdk/hooks/client'

type Post = { title: string; slug: string; summary?: string }

export function Posts() {
  const { data, isLoading, error } = useMadoriEntries<Post>('blog', {
    limit: 10,
    sort: '-createdAt',
  })

  if (isLoading) return <p>Loading posts…</p>
  if (error) return <p>Could not load posts.</p>
  return <ul>{data.map(post => <li key={post.slug}>{post.title}</li>)}</ul>
}
```

`useMadoriEntry<T>(collection, slug)` reads one entry. Both hooks return `data`, `isLoading` and `error`; changing request identity clears the prior error and starts loading, while cancelled responses are ignored. Previously loaded data can remain during loading, so render using the loading/error state. Stable filter values avoid a fetch on every render.

Defaults are same-origin requests under `/api/public`. `configureMadoriHooks({ apiEndpoint })` changes the base URL. Cross-origin use needs an appropriate deployment/CORS policy; it is not enabled by this option alone.

The public API always filters to published content, including requests that ask for draft/all status. List responses contain `{ data: Entry[] }`; single responses contain `{ data: Entry }`, with custom fields under `Entry.data`. Hooks copy custom fields to the top level while retaining entry metadata. A missing or unpublished single entry returns 404.

```text
GET /api/public/entries/blog?limit=10&sort=-createdAt
GET /api/public/entries/blog/hello-world
```

`filter` is a JSON object encoded as a query parameter. Use `URLSearchParams` instead of assembling JSON into URLs by hand.

## Generated types, schemas and GraphQL operations

```bash
pnpm madori generate
```

Default output is `.madori/generated/`. Generation reads the conventional `resources/collections/`, referenced `resources/blueprints/collections/`, and `resources/fieldsets/` directories. Collection handles determine output filenames/query identities; referenced blueprint handles determine GraphQL filter input names. Blueprint fieldset imports are resolved before output is replaced.

Outputs include:

- `types/`: entry interfaces with metadata and authored field names.
- `schemas/`: Zod field schemas; these are separate from the complete content engine's validation and visibility handling.
- `client.ts`: a file SDK client using `content` and `resources` paths.
- `graphql/`: a configurable HTTP client, parsed GraphQL documents and per-collection get/list helpers.
- `index.ts`, `.gitignore`, `tsconfig.paths.json`: supporting exports and suggested path mappings.

Inspect generated `tsconfig.paths.json` before merging its mappings into your application configuration. It does not edit your main `tsconfig.json`. Do not hand-edit generated output; rerun generation after schema changes. Current watch mode targets blueprints only; explicitly rerun after collection or fieldset edits. The CLI does not derive its generation root from a custom `resourcesPath`.

Generated GraphQL operations require the `graphql` runtime package and valid GraphQL authentication. In a signed-in same-origin browser, fetch sends the session cookie. Server integrations need an absolute endpoint and an authorized token configured through `configureGraphQL({ endpoint, headers })`; never put a privileged token in a browser bundle. The generated client configuration is module-wide, so do not replace its headers with individual users' credentials per server request.

GraphQL uses its own sort syntax, `field:direction`, and filter type names. Its generated convenience list helper accepts `sort` and `order`; this differs from the file SDK's leading-minus sort syntax. GraphQL wire field names are sanitized; generated top-level convenience results map custom fields back to authored names. Nested structured values retain their GraphQL field names. See [GraphQL API](/docs/graphql) for exact operation shapes and permissions.

## Next.js integration and caching

`@madori/sdk/hooks/server` provides `madoriClient`/`getMadoriClient`, React request-cache wrappers (`cachedGetEntry`, `cachedListEntries`), and Next cache wrappers (`taggedGetEntry`, `taggedListEntries`). Tagged wrappers use `madori:collection:{handle}` tags. Integrators must arrange tag invalidation themselves; the application's content/SEO mutation cache is a separate mechanism.

Within this application, `getMadori()` provides the shared content engine, blueprint registry and SEO services. Public route adapters in `src/lib/seo/next/` enforce publication filtering and share SEO resolution between metadata and page rendering. Prefer those adapters for existing public routes, and keep authorization at any new API boundary.

See [CLI](/docs/cli), [collections](/docs/collections), and [SEO architecture](/docs/seo-architecture) for related workflows.
