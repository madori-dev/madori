---
title: Getting Started
slug: getting-started
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Getting Started

Get a Madori project running and create your first content entry in under 10 steps. This guide walks you from zero to a working CMS with content you can query via GraphQL.

---

## Configuration Reference

After scaffolding, your project contains `madori.config.ts` with these defaults:

| Option | Default | Description |
|--------|---------|-------------|
| `contentPath` | `./content` | Where entries, globals, forms, and navigation are stored |
| `resourcesPath` | `./resources` | Where blueprints, fieldsets, and definitions live |
| `usersPath` | `./users` | Where user account files are stored |
| `assetsPath` | `./public/assets` | Where uploaded files are stored |
| `cp.enabled` | `true` | Enables the Control Panel |
| `cp.path` | `/cp` | URL path for the Control Panel |
| `graphql.enabled` | `true` | Enables the GraphQL API |
| `graphql.path` | `/api/graphql` | URL path for the GraphQL endpoint |

You don't need to change any configuration to get started — defaults work out of the box. See the [Configuration](/docs/configuration) guide for customisation options.

---

## Setup Steps

### Prerequisites

Before you begin, make sure you have:

- **Node.js 18+** — [download from nodejs.org](https://nodejs.org)
- **pnpm** — install with `npm install -g pnpm`

### 1. Create a new project

Scaffold a complete MADORI project:

```bash
pnpm dlx create-madori-app@latest my-site
```

This creates a `my-site` directory with all CMS files, blueprints, and configuration ready to go.

### 2. Install dependencies and start the dev server

```bash
cd my-site
pnpm install
pnpm dev
```

Your site is now running at [http://localhost:3000](http://localhost:3000).

### 3. Open the Control Panel

Visit [http://localhost:3000/cp](http://localhost:3000/cp) and sign in with the default credentials:

- **Email:** `admin@example.com`
- **Password:** `password`

> Change the default password after your first login.

### 4. Create a collection

Collections group content that shares a structure — like blog posts, pages, or products.

1. In the Control Panel sidebar, go to **Collections**
2. Click **Create Collection**
3. Enter a title (e.g. "Blog") and a handle (e.g. `blog`)
4. Save the collection

This creates a definition file at `resources/collections/blog.yaml`.

### 5. Create a blueprint

Blueprints define the fields available when editing entries in a collection.

1. Go to **Blueprints** in the sidebar
2. Click **Create Blueprint**
3. Select "Collection" as the type and give it the handle `blog`
4. Add fields:
   - **title** — type: `text`, required
   - **slug** — type: `slug`
   - **content** — type: `tiptap`
5. Save the blueprint

Your blueprint is stored at `resources/blueprints/collections/blog.yaml`.

### 6. Create your first entry

1. Navigate to your **Blog** collection in the sidebar
2. Click **Create Entry**
3. Fill in the title, slug, and content fields
4. Click **Save**

Your entry is now stored as a Markdown file at `content/collections/blog/your-slug.md`.

### 7. View content on the frontend

MADORI auto-generates a GraphQL API from your blueprints. Query your new entry at [http://localhost:3000/api/graphql](http://localhost:3000/api/graphql):

```graphql
{
  blogs {
    title
    slug
    content
  }
}
```

Use the GraphQL endpoint to render content on your frontend pages.

### 8. Explore your project structure

```
my-site/
├── content/              # Your content (Markdown + YAML)
│   └── collections/      # Collection entries
├── resources/            # Schema definitions
│   ├── blueprints/       # Field schemas
│   ├── collections/      # Collection definitions
│   ├── fieldsets/        # Reusable field groups
│   └── taxonomies/       # Taxonomy definitions
├── public/assets/        # Uploaded files
├── users/                # User accounts
├── src/                  # Application source
└── madori.config.ts      # Project configuration
```

All content is stored as flat files — no database required. Your content lives alongside your code and can be version-controlled with Git.

---

## Common Patterns

Now that you have a working project with content, here are common next steps:

### Customise your blueprint

Add more field types to capture richer content — images, dates, select options, and rich text editors. See the [Field Types](/docs/field-types) reference for all 17 types.

### Add validation

Enforce data quality with validation rules like `required`, `min`, `max`, and `email`:

```yaml
- handle: email
  field:
    type: text
    display: Email
    validate:
      - required
      - email
```

### Organise with taxonomies

Add tags or categories to group entries. See [Taxonomies](/docs/taxonomies) for setup.

### Build page layouts

Use Replicator fields with [Fieldsets](/docs/fieldsets) to let editors compose flexible page layouts from reusable blocks.

---

## Next Steps

- [Blueprints](/docs/blueprints) — tabs, sections, visibility conditions, and validation rules
- [Collections](/docs/collections) — routes, sorting, filtering, and multiple blueprints
- [Field Types](/docs/field-types) — all 17 field types with configuration options
- [GraphQL](/docs/graphql) — auto-generated schema, queries, and client library usage
- [Assets](/docs/assets) — uploading, organising, and selecting media files
- [Navigation](/docs/navigation) — managing site navigation structures
- [Forms](/docs/forms) — collecting submissions with validation and export
