---
title: Configuration
slug: docs/configuration
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Configuration

MADORI is configured via `madori.config.ts` at your project root.

## Default Configuration

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
}

export default config
```

## Options

### Paths

| Option | Default | Description |
|--------|---------|-------------|
| `contentPath` | `./content` | Where content entries, globals, forms, and navigation are stored |
| `resourcesPath` | `./resources` | Where blueprints, fieldsets, roles, and definitions live |
| `usersPath` | `./users` | Where user YAML files are stored |
| `assetsPath` | `./public/assets` | Where uploaded assets are stored |

### Control Panel

| Option | Default | Description |
|--------|---------|-------------|
| `cp.enabled` | `true` | Enable or disable the control panel |
| `cp.path` | `/cp` | URL path for the control panel |

### GraphQL

| Option | Default | Description |
|--------|---------|-------------|
| `graphql.enabled` | `true` | Enable or disable the GraphQL API |
| `graphql.path` | `/api/graphql` | URL path for the GraphQL endpoint |
| `graphql.introspection` | `true` in dev | Allow schema introspection |

### Authentication

| Option | Default | Description |
|--------|---------|-------------|
| `auth.driver` | `password` | Authentication driver (validates credentials) |
| `auth.store` | `file` | Session storage backend |
| `auth.provider` | `yaml` | User data provider |

The auth system is fully pluggable. You can register custom drivers, stores, and providers.

## Directory Structure

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
│   ├── fieldsets/        # Reusable field groups
│   ├── roles/            # Permission roles
│   └── taxonomies/       # Taxonomy definitions
├── users/                # User accounts
├── public/assets/        # Uploaded files
└── madori.config.ts
```
