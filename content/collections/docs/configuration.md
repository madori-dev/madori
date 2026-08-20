---
title: Configuration
slug: configuration
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-06-07T09:00:00.000Z
---

# Configuration

Madori is configured via a single TypeScript file at your project root: `madori.config.ts`. This file controls content paths, Control Panel settings, GraphQL behaviour, and authentication. All options have sensible defaults — you only need to configure what you want to change.

---

## Configuration Reference

### Full Config Schema

```ts
import type { MadoriConfigInput } from './src/lib/config/schema'

const config: MadoriConfigInput = {
  contentPath: './content',
  resourcesPath: './resources',
  usersPath: './users',
  assetsPath: './public/assets',

  git: {
    enabled: false,
    automatic: true,
    push: false,
    trackedPaths: [
      { root: 'content', exclude: ['forms/**'] },
      { root: 'resources' },
    ],
  },

  cp: {
    enabled: true,
    path: '/cp',
  },

  graphql: {
    enabled: true,
    path: '/api/graphql',
    introspection: process.env.NODE_ENV !== 'production',
  },

  sites: [
    { handle: 'default', url: 'https://www.example.com', locale: 'en-US', default: true },
  ],

  seo: {
    enabled: true,
    metadata: true,
    structuredData: true,
    sitemap: true,
    robots: true,
    humans: true,
    reports: true,
    redirects: true,
    errorTracking: false,
    socialImages: false,
    allowExternalCanonicals: false,
    allowedRedirectOrigins: [],
    trailingSlash: 'never',
    reportRetentionDays: 90,
    reportSnapshotLimit: 50,
    operationalStoragePath: './storage/seo',
  },

  auth: {
    driver: 'password',
    store: 'file',
    provider: 'yaml',
    storeConfig: {
      sessionsDir: './.sessions',
      sessionDurationMs: 86400000,
    },
  },
}

export default config
```

### Path Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `contentPath` | `string` | `./content` | Directory where content entries, globals, forms, and navigation are stored |
| `resourcesPath` | `string` | `./resources` | Directory where blueprints, fieldsets, roles, and definitions live |
| `usersPath` | `string` | `./users` | Directory where user YAML files are stored |
| `assetsPath` | `string` | `./public/assets` | Directory where uploaded assets are stored |

### Git Content Sync

Git sync is disabled by default. When enabled, Madori commits successful content changes to each repository containing a configured tracked root. Pushing to a remote is separately opt-in.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `git.enabled` | `boolean` | `false` | Enable content Git synchronization |
| `git.automatic` | `boolean` | `true` | Queue commits after content changes |
| `git.push` | `boolean` | `false` | Push successful commits to configured remote |
| `git.debounceMs` | `number` | `2000` | Coalesce rapid changes before committing |
| `git.trackedPaths` | `{ root: string, exclude?: string[] }[]` | `content` and `resources` | Built-in roots (`content`, `resources`, `assets`, `users`) or explicit paths; assets and users are opt-in |
| `git.remote` | `string` | `origin` | Existing Git remote name |
| `git.branch` | `string` | unset | Optional branch to push |
| `git.commitPrefix` | `string` | `[Madori]` | Prefix for generated commit messages |
| `git.statePath` | `string` | `./storage/git-sync` | Durable pending-sync state |

Madori never stores Git credentials. Configure authentication in Git itself (for example, an SSH deploy key or credential helper). Tracked paths may point into separate repositories, but only explicitly configured paths are staged. `users` and `assets` remain excluded unless added to `trackedPaths`; consider privacy and large-file storage before enabling them.

For setup, GitHub authentication, separate repositories, recovery, and troubleshooting, see [Git Content Sync](/docs/git-sync).

### Control Panel Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cp.enabled` | `boolean` | `true` | Enable or disable the Control Panel entirely |
| `cp.path` | `string` | `/cp` | URL path prefix for the Control Panel |

### GraphQL Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `graphql.enabled` | `boolean` | `true` | Enable or disable the GraphQL API |
| `graphql.path` | `string` | `/api/graphql` | URL path for the GraphQL endpoint |
| `graphql.introspection` | `boolean` | `true` in dev, `false` in prod | Allow schema introspection queries |

### Sites and SEO Options

`sites` defines public site contexts used by URL resolution, metadata, alternate links, sitemaps, and redirects. Exactly one site must be marked `default`; each URL must be an HTTP(S) origin without credentials, query parameters, or fragments. Use separate handles for domain-based sites or locales served from a shared host.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sites[].handle` | `string` | `default` | Stable site identifier used in SEO documents and API requests |
| `sites[].url` | `string` | `http://localhost:3000` | Public origin for canonical and alternate URLs |
| `sites[].locale` | `string` | `en-US` | Locale emitted in alternate metadata |
| `sites[].default` | `boolean` | `false` | Select exactly one fallback site |
| `seo.enabled` | `boolean` | `true` | Master SEO switch; disables SEO output and endpoints |
| `seo.metadata` | `boolean` | `true` | Emit title, description, canonical, robots, and social metadata |
| `seo.structuredData` | `boolean` | `true` | Emit validated JSON-LD |
| `seo.sitemap` | `boolean` | `true` | Enable `/sitemap.xml` generation |
| `seo.robots` | `boolean` | `true` | Enable `/robots.txt` generation |
| `seo.humans` | `boolean` | `true` | Enable `/humans.txt` generation |
| `seo.reports` | `boolean` | `true` | Enable SEO audit report APIs and snapshots |
| `seo.redirects` | `boolean` | `true` | Enable authored redirect management and runtime redirects |
| `seo.errorTracking` | `boolean` | `false` | Record normalized public 404 observations |
| `seo.socialImages` | `boolean` | `false` | Emit resolved social-image overrides |
| `seo.allowExternalCanonicals` | `boolean` | `false` | Permit explicitly authored external canonical URLs |
| `seo.allowedRedirectOrigins` | `string[]` | `[]` | Exact external origins permitted as redirect destinations; redirects stay local by default |
| `seo.trailingSlash` | `always \| never \| preserve` | `never` | Canonical path normalization policy |
| `seo.reportRetentionDays` | `number` | `90` | Retention window for operational report snapshots |
| `seo.reportSnapshotLimit` | `number` | `50` | Maximum retained report snapshots |
| `seo.operationalStoragePath` | `string` | `./storage/seo` | Runtime SEO storage; keep outside content Git paths |

SEO defaults are authored in versioned files under `resources/seo/`; redirects are versioned under `content/seo/redirects/`. Caches, 404 observations, hit counters, and audit snapshots remain operational data under `seo.operationalStoragePath` and should not be committed to content Git. See [SEO Architecture](/docs/seo-architecture) for the full storage contract.

### Authentication Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `auth.driver` | `string` | `password` | Authentication driver — validates credentials |
| `auth.store` | `string` | `file` | Session storage backend |
| `auth.provider` | `string` | `yaml` | User data provider |
| `auth.storeConfig.sessionsDir` | `string` | `./.sessions` | Directory for session files |
| `auth.storeConfig.sessionDurationMs` | `number` | `86400000` (24h) | Session expiry duration in milliseconds |

### Directory Structure

```
my-site/
├── content/
│   ├── collections/      # Entry files (Markdown + YAML frontmatter)
│   ├── globals/          # Global data (YAML)
│   ├── forms/            # Form submissions (YAML)
│   ├── navigation/       # Navigation trees (YAML)
│   └── taxonomies/       # Taxonomy terms (YAML)
├── resources/
│   ├── blueprints/       # Field schemas
│   │   ├── collections/
│   │   ├── globals/
│   │   ├── taxonomies/
│   │   └── forms/
│   ├── collections/      # Collection definitions
│   ├── definitions/      # Navigation definitions
│   ├── fieldsets/        # Reusable field groups
│   ├── roles/            # Permission roles
│   └── taxonomies/       # Taxonomy definitions
├── users/                # User accounts (YAML)
├── public/assets/        # Uploaded files
└── madori.config.ts      # Project configuration
```

---

## Usage Examples

### Minimal Configuration

The simplest valid config uses all defaults:

```ts
import type { MadoriConfigInput } from './src/lib/config/schema'

const config: MadoriConfigInput = {}

export default config
```

This gives you a fully functional CMS with the Control Panel at `/cp` and GraphQL at `/api/graphql`.

### Custom Paths

Change where content and resources are stored:

```ts
const config: MadoriConfigInput = {
  contentPath: './data/content',
  resourcesPath: './data/resources',
  assetsPath: './public/media',
}

export default config
```

### Disable GraphQL in Production

Keep GraphQL available in development but disable it in production:

```ts
const config: MadoriConfigInput = {
  graphql: {
    enabled: process.env.NODE_ENV !== 'production',
    path: '/api/graphql',
    introspection: false,
  },
}

export default config
```

### Custom Control Panel Path

Mount the Control Panel at a non-default URL:

```ts
const config: MadoriConfigInput = {
  cp: {
    enabled: true,
    path: '/admin',
  },
}

export default config
```

The Control Panel is now accessible at `http://localhost:3000/admin`.

### Extended Session Duration

Keep editors logged in for 7 days instead of the default 24 hours:

```ts
const config: MadoriConfigInput = {
  auth: {
    driver: 'password',
    store: 'file',
    provider: 'yaml',
    storeConfig: {
      sessionsDir: './.sessions',
      sessionDurationMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  },
}

export default config
```

---

## Common Patterns

### Environment-Specific Configuration

Use environment variables to adjust configuration per environment:

```ts
const config: MadoriConfigInput = {
  graphql: {
    enabled: true,
    path: '/api/graphql',
    introspection: process.env.NODE_ENV !== 'production',
  },

  cp: {
    enabled: process.env.DISABLE_CP !== 'true',
    path: '/cp',
  },
}

export default config
```

### Headless Mode (API Only)

Disable the Control Panel entirely for a headless setup where content is managed via files or external tools:

```ts
const config: MadoriConfigInput = {
  cp: {
    enabled: false,
  },

  graphql: {
    enabled: true,
    path: '/api/graphql',
  },
}

export default config
```

### Monorepo Setup

In a monorepo where content lives separately from the application:

```ts
const config: MadoriConfigInput = {
  contentPath: '../../packages/content/data',
  resourcesPath: '../../packages/content/resources',
  usersPath: '../../packages/content/users',
  assetsPath: './public/assets',
}

export default config
```

### Secure Production Defaults

A production-hardened configuration:

```ts
const config: MadoriConfigInput = {
  graphql: {
    enabled: true,
    path: '/api/graphql',
    introspection: false,
  },

  auth: {
    driver: 'password',
    store: 'file',
    provider: 'yaml',
    storeConfig: {
      sessionsDir: './.sessions',
      sessionDurationMs: 4 * 60 * 60 * 1000, // 4 hours
    },
  },
}

export default config
```

### Managing Settings in the Control Panel

The Control Panel includes a **Settings** page at `/cp/settings` where you can view and modify configuration values without editing `madori.config.ts` directly. Changes are validated before being written and take effect on the next request.

### Git-Ignored Sessions Directory

Add the sessions directory to `.gitignore` to avoid committing session data:

```gitignore
.sessions/
```

This is included by default in Madori's generated `.gitignore`.
