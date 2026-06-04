---
title: Configuration
slug: configuration
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
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

  cp: {
    enabled: true,
    path: '/cp',
  },

  graphql: {
    enabled: true,
    path: '/api/graphql',
    introspection: process.env.NODE_ENV !== 'production',
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

### Git-Ignored Sessions Directory

Add the sessions directory to `.gitignore` to avoid committing session data:

```gitignore
.sessions/
```

This is included by default in Madori's generated `.gitignore`.

