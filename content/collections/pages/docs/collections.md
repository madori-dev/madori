---
title: Collections
slug: docs/collections
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Collections

Collections are groups of content entries that share a structure. A blog, a set of pages, a product catalog — each is a collection.

## Defining a Collection

Create a YAML file at `resources/collections/{handle}.yaml`:

```yaml
title: Blog
blueprint: blog
route: /blog/{slug}
defaultStatus: draft
```

### Options

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Display name in the control panel |
| `blueprint` | Yes | Which blueprint defines the field schema |
| `route` | No | Frontend URL pattern for entries |
| `sortable` | No | Allow manual ordering of entries |
| `dated` | No | Use date-based file organization |
| `defaultStatus` | No | `published` or `draft` (default: `draft`) |
| `icon` | No | Lucide icon name for the sidebar |
| `sortDirection` | No | `asc` or `desc` |
| `taxonomies` | No | Array of taxonomy handles to associate |

## Creating Entries

### Via the Control Panel

1. Navigate to your collection in the CP sidebar
2. Click **Create Entry**
3. Fill in the fields defined by the blueprint
4. Save

### Via Files

Create a Markdown file at `content/collections/{collection}/{slug}.md`:

```markdown
---
title: Hello World
slug: hello-world
status: published
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
category: tutorials
---

Your markdown content here.
```

The YAML frontmatter holds metadata and custom field values. The body is the `content` field.

## Querying Entries

### GraphQL

```graphql
{
  blogs(limit: 10, sort: "createdAt:desc") {
    title
    slug
    content
    createdAt
  }
}
```

### REST API

```
GET /api/entries/{collection}
GET /api/entries/{collection}/{slug}
```

## Filtering and Sorting

The GraphQL list queries accept:

- `filter` — key-value object matching field values
- `limit` — maximum entries to return
- `offset` — skip N entries (for pagination)
- `sort` — `"fieldName:asc"` or `"fieldName:desc"`

## Multiple Blueprints

A collection can reference multiple blueprints via the `blueprints` array in its definition, allowing different entry types within the same collection.
