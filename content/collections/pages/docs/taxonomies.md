---
title: Taxonomies
slug: docs/taxonomies
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Taxonomies

Taxonomies let you categorize and tag content. Tags, categories, topics — any way you want to group entries.

## Defining a Taxonomy

Create a definition at `resources/taxonomies/{handle}.yaml`:

```yaml
title: Tags
blueprint: tags
```

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Display name |
| `blueprint` | No | Blueprint for term fields (optional) |

## Creating Terms

Terms live at `content/taxonomies/{taxonomy}/{slug}.yaml`:

```yaml
title: JavaScript
slug: javascript
description: Posts about the JavaScript language
```

You can also create terms via the Control Panel under **Taxonomies → {taxonomy} → Create Term**.

## Associating with Collections

Add a `taxonomies` array to your collection definition:

```yaml
# resources/collections/blog.yaml
title: Blog
blueprint: blog
taxonomies:
  - tags
  - categories
```

Then add a `taxonomy` field to your blueprint:

```yaml
- handle: tags
  field:
    type: taxonomy
    display: Tags
```

## Querying Taxonomy Terms

### GraphQL

```graphql
{
  terms(taxonomy: "tags") {
    title
    slug
  }
}
```

### REST API

```
GET /api/taxonomies
GET /api/taxonomies/{handle}/terms
```
