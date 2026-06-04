---
title: Collections
slug: collections
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Collections

Collections are groups of content entries that share a structure. A blog, a set of pages, a product catalog — each is a collection. Every collection is backed by a blueprint that defines its fields, and entries are stored as flat Markdown files with YAML frontmatter.

Collections are the primary way content is organised in Madori. Each collection appears in the Control Panel sidebar and generates REST and GraphQL API endpoints automatically.

---

## Configuration Reference

### Collection Definition

Collection definitions live at `resources/collections/{handle}.yaml`. The handle becomes the collection's identifier throughout the system.

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `title` | `string` | Yes | — | Display name shown in the Control Panel sidebar |
| `blueprint` | `string` | Yes | — | Handle of the blueprint that defines the field schema |
| `blueprints` | `string[]` | No | — | Array of blueprint handles (for multi-type collections) |
| `route` | `string` | No | — | Frontend URL pattern for entries (e.g. `/blog/{slug}`) |
| `sortable` | `boolean` | No | `false` | Allow manual drag-and-drop ordering of entries |
| `dated` | `boolean` | No | `false` | Use date-based file organisation |
| `defaultStatus` | `string` | No | `draft` | Default status for new entries: `published` or `draft` |
| `icon` | `string` | No | — | Lucide icon name for the Control Panel sidebar |
| `sortDirection` | `string` | No | `desc` | Default sort direction: `asc` or `desc` |
| `taxonomies` | `string[]` | No | `[]` | Array of taxonomy handles to associate with this collection |

### Entry Storage

Entries are stored as Markdown files at `content/collections/{collection}/{slug}.md`. The YAML frontmatter holds metadata and custom field values; the body is the `content` field.

```yaml
# Frontmatter fields (auto-managed)
title: string        # Entry title
slug: string         # URL-safe identifier (filename)
status: string       # "published" or "draft"
createdAt: string    # ISO 8601 timestamp
updatedAt: string    # ISO 8601 timestamp
```

### Route Patterns

The `route` option supports these placeholders:

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{slug}` | Entry slug | `/blog/hello-world` |
| `{year}` | Year from createdAt | `/blog/2026/hello-world` |
| `{month}` | Month from createdAt | `/blog/2026/01/hello-world` |
| `{day}` | Day from createdAt | `/blog/2026/01/15/hello-world` |

### Related Configuration

Collections reference these other configuration files:

| Resource | Path | Description |
|----------|------|-------------|
| Blueprint | `resources/blueprints/collections/{handle}.yaml` | Field schema |
| Taxonomy | `resources/taxonomies/{handle}.yaml` | Category/tag definitions |
| Content | `content/collections/{handle}/` | Entry files |

---

## Usage Examples

### Basic Blog Collection

**Definition** (`resources/collections/blog.yaml`):

```yaml
title: Blog
blueprint: blog
route: /blog/{slug}
defaultStatus: draft
icon: pen-line
sortDirection: desc
taxonomies:
  - tags
  - categories
```

### Creating Entries via the Control Panel

1. Navigate to your collection in the CP sidebar
2. Click **Create Entry**
3. Fill in the fields defined by the blueprint
4. Click **Save**

The entry is stored immediately as a flat file.

### Creating Entries via Files

Create a Markdown file at `content/collections/{collection}/{slug}.md`:

```markdown
---
title: Hello World
slug: hello-world
status: published
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
tags:
  - javascript
  - tutorials
---

Your markdown content here.
```

### Querying via GraphQL

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

### Querying via REST API

```
GET /api/entries/{collection}           # List entries
GET /api/entries/{collection}/{slug}    # Get single entry
POST /api/entries/{collection}          # Create entry
PUT /api/entries/{collection}/{slug}    # Update entry
DELETE /api/entries/{collection}/{slug} # Delete entry
```

### Filtering and Sorting

GraphQL list queries accept these arguments:

| Argument | Type | Description |
|----------|------|-------------|
| `filter` | `object` | Key-value object matching field values |
| `limit` | `number` | Maximum entries to return |
| `offset` | `number` | Skip N entries (for pagination) |
| `sort` | `string` | `"fieldName:asc"` or `"fieldName:desc"` |

```graphql
{
  blogs(
    filter: { status: "published", author: "admin" }
    limit: 5
    offset: 0
    sort: "createdAt:desc"
  ) {
    title
    slug
  }
}
```

---

## Common Patterns

### Multi-Blueprint Collections

A collection can support multiple entry types by referencing multiple blueprints:

```yaml
# resources/collections/pages.yaml
title: Pages
blueprints:
  - page
  - landing-page
  - documentation
route: /{slug}
```

When creating a new entry, the editor chooses which blueprint to use.

### Date-Based Organisation

For collections with time-sensitive content:

```yaml
title: Blog
blueprint: blog
route: /blog/{year}/{month}/{slug}
dated: true
sortDirection: desc
defaultStatus: draft
```

### Manual Ordering

For collections where order matters (team members, portfolio items):

```yaml
title: Team
blueprint: team-member
sortable: true
sortDirection: asc
```

Editors can drag and drop entries in the list view to set their display order.

### Taxonomy Integration

Associate taxonomies with a collection to enable categorisation:

```yaml
# resources/collections/blog.yaml
title: Blog
blueprint: blog
taxonomies:
  - categories
  - tags
```

Then include taxonomy fields in your blueprint:

```yaml
- handle: categories
  field:
    type: taxonomy
    display: Categories
    required: true

- handle: tags
  field:
    type: taxonomy
    display: Tags
```

### Content in Version Control

Since entries are flat Markdown files, commit them to Git for:

- Version history of all content changes
- Pull request workflows for content review
- Easy rollback if something goes wrong
- Consistent content across environments (dev/staging/production)

```bash
git add content/collections/blog/new-post.md
git commit -m "Add blog post: Getting Started with Madori"
```

