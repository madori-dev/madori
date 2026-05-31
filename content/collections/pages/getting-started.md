---
title: Getting Started
slug: getting-started
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
meta_title: "Getting Started — MADORI"
meta_description: "Create a new MADORI project in under two minutes. Install, configure, and start building content immediately."
---

# Getting Started with MADORI

Get a new MADORI project running in under two minutes.

## Prerequisites

- **Node.js 18+**
- **pnpm** (recommended) — install with `npm install -g pnpm`

## Create a new project

```bash
pnpm dlx create-madori-app@latest my-site
```

Or with npx:

```bash
npx create-madori-app@latest my-site
```

This scaffolds a complete MADORI project into `./my-site`.

## Install and run

```bash
cd my-site
pnpm install
pnpm dev
```

Your site is now running at [http://localhost:3000](http://localhost:3000).

## Log in to the Control Panel

Visit [http://localhost:3000/cp](http://localhost:3000/cp) and sign in with:

- **Email:** `admin@example.com`
- **Password:** `changeme`

> ⚠️ Change the default password after your first login.

## What's in your project

```
my-site/
├── content/              # Your content (Markdown + YAML)
│   └── collections/      # Collection entries
├── resources/            # Schema definitions
│   ├── blueprints/       # Field schemas
│   ├── fieldsets/        # Reusable field groups
│   └── roles/            # Permission roles
├── public/assets/        # Uploaded files
├── users/                # User accounts
├── src/                  # Application source
└── madori.config.ts      # Project configuration
```

## Create your first collection

1. Go to **Control Panel → Blueprints → Create**
2. Choose "Collection" type, give it a handle (e.g. `blog`)
3. Add fields: title (text), slug (slug), content (tiptap)
4. Go to **Collections → Create**, link it to your blueprint
5. Start creating entries

## Create your first entry

1. Navigate to your collection in the Control Panel
2. Click **Create Entry**
3. Fill in the fields and save
4. Your content is stored as a Markdown file in `content/collections/`

## Query content with GraphQL

MADORI auto-generates a GraphQL schema from your blueprints. Visit [http://localhost:3000/api/graphql](http://localhost:3000/api/graphql) to explore it.

Example query:

```graphql
{
  entries(collection: "blog") {
    title
    slug
    content
  }
}
```

## Deploy

MADORI runs anywhere Node.js runs. No database required.

- **Vercel** — connect your repo, auto-deploys on push (read-only CP)
- **VPS** — `pnpm build && pnpm start` behind nginx (full CP support)
- **Railway / Render** — persistent filesystem, full CP support

For full CP functionality (content editing, asset uploads), use a host with a persistent filesystem.

## Next steps

- Explore the [source on GitHub](https://github.com/madori-dev/madori)
- Create custom blueprints with the visual editor
- Add taxonomies to categorize content
- Build page templates with replicator fields and fieldsets
