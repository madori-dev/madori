<p align="center">
  <img src="public/madori_logo.svg" alt="Madori" width="200" />
</p>

# MADORI

A flat-file CMS for React/Next.js applications. Inspired by Statamic, powered by TypeScript.

No database. No complex hosting. Just content as files — Markdown, YAML, and JSON — versioned alongside your code.

## Quick Start

```bash
pnpm dlx create-madori-app@latest my-site
cd my-site
pnpm install
pnpm dev
```

Visit `http://localhost:3000/cp` to access the control panel.

**Default credentials:**
- Email: `admin@example.com`
- Password: `password`

## Features

- **Control Panel** — A polished admin interface for content editors, built with React and shadcn/ui
- **Flat-file storage** — All content stored as Markdown and YAML. Version control friendly, no database needed
- **Blueprints** — Define flexible content schemas with a visual editor or YAML configuration
- **Collections** — Organize content into structured collections with custom blueprints and fields
- **Taxonomies** — Tag and categorize content with hierarchical taxonomy systems
- **Globals** — Site-wide configuration and content sets
- **Forms** — Collect submissions with configurable form blueprints
- **Navigation** — Manage site navigation structures
- **Asset management** — Upload, organise, and browse files with drag-and-drop, folders, and bulk operations
- **GraphQL API** — Auto-generated schema from your blueprints. Query content with type safety
- **Authentication & roles** — Built-in user management with role-based permissions
- **Rich text editing** — TipTap-powered editor with images, tables, code blocks, and more
- **Replicator fields** — Flexible page-building with repeatable block sets (fieldsets)

## Project Structure

```
my-site/
├── content/                  # Your content (Markdown + YAML frontmatter)
│   ├── collections/          # Collection entries
│   ├── globals/              # Global data sets
│   ├── forms/                # Form submissions
│   ├── navigation/           # Navigation structures
│   └── taxonomies/           # Taxonomy terms
├── resources/                # Schema definitions
│   ├── blueprints/           # Field schemas for collections, globals, taxonomies
│   ├── collections/          # Collection definitions
│   ├── fieldsets/            # Reusable field groups for replicators
│   ├── roles/                # Permission roles
│   └── taxonomies/           # Taxonomy definitions
├── public/assets/            # Uploaded files
├── users/                    # User accounts (YAML)
├── src/                      # Application source
│   ├── app/(cp)/             # Control panel routes
│   ├── app/api/              # API routes (GraphQL)
│   ├── components/           # UI components
│   └── lib/                  # Core CMS library
└── madori.config.ts          # Project configuration
```

## Configuration

`madori.config.ts` controls paths and feature toggles:

```ts
const config = {
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
```

## Requirements

- Node.js 18+
- pnpm (recommended)

## Development

```bash
pnpm install
pnpm dev
```

Run tests:

```bash
pnpm test
```

## License

See [LICENSE.md](LICENSE.md) for details.
