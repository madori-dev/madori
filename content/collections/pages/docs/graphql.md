---
title: GraphQL API
slug: docs/graphql
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# GraphQL API

MADORI auto-generates a GraphQL schema from your blueprints. No manual schema writing required.

## Endpoint

```
http://localhost:3000/api/graphql
```

In development, a GraphiQL interface is available at this URL for exploring and testing queries.

## Schema Generation

For each collection with a blueprint, MADORI generates:

- **A type** with all standard entry fields plus blueprint-defined fields
- **A singular query** (e.g. `blog(slug: "...")`) returning a single entry
- **A plural query** (e.g. `blogs(...)`) returning a filtered list

### Standard Entry Fields

Every collection type includes:

| Field | Type | Description |
|-------|------|-------------|
| `title` | String | Entry title |
| `slug` | String | URL slug |
| `status` | String | `published` or `draft` |
| `author` | String | Author identifier |
| `content` | String | Markdown body content |
| `createdAt` | String | ISO timestamp |
| `updatedAt` | String | ISO timestamp |

### Blueprint Field Mapping

| Blueprint Type | GraphQL Type |
|---------------|--------------|
| text, slug, markdown, tiptap, select, date, asset, yaml, code | String |
| number | Float (or Int with `options.integer`) |
| toggle | Boolean |
| multiselect, entries, taxonomy | [String] |
| replicator, grid | String (JSON) |

## Query Examples

### Single Entry

```graphql
{
  blog(slug: "hello-world") {
    title
    content
    createdAt
    featured_image
    tags
  }
}
```

### List with Filtering

```graphql
{
  blogs(
    filter: { status: "published" }
    limit: 10
    offset: 0
    sort: "createdAt:desc"
  ) {
    title
    slug
    createdAt
  }
}
```

### Sort Format

The `sort` argument uses the format `"field:direction"`:

- `"createdAt:desc"` — newest first
- `"title:asc"` — alphabetical

## Filter Input

Each collection gets a generated filter input type. All filter fields accept String values for simplicity:

```graphql
{
  blogs(filter: { author: "admin", status: "published" }) {
    title
  }
}
```

## Configuration

Control GraphQL behavior in `madori.config.ts`:

```ts
graphql: {
  enabled: true,
  path: '/api/graphql',
  introspection: process.env.NODE_ENV !== 'production',
}
```

Set `introspection: false` in production to hide your schema from public inspection.
