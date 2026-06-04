---
title: Taxonomies
slug: taxonomies
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Taxonomies

Taxonomies let you categorise and tag content. Tags, categories, topics, genres — any way you want to group entries across collections. Each taxonomy contains terms that can be assigned to collection entries via the `taxonomy` field type.

Taxonomies are defined as flat files, managed visually in the Control Panel, and queryable via REST and GraphQL APIs.

---

## Configuration Reference

### Taxonomy Definition

Taxonomy definitions live at `resources/taxonomies/{handle}.yaml`. The handle is the taxonomy's identifier used in collection associations and API endpoints.

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `title` | `string` | Yes | — | Display name shown in the Control Panel sidebar |
| `blueprint` | `string` | No | — | Handle of a blueprint for term fields (optional) |

**Example definition:**

```yaml
# resources/taxonomies/tags.yaml
title: Tags
blueprint: tags
```

### Term Storage

Terms are stored as YAML files at `content/taxonomies/{taxonomy}/{slug}.yaml`:

```yaml
# content/taxonomies/tags/javascript.yaml
title: JavaScript
slug: javascript
description: Posts about the JavaScript language
```

### Term Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `title` | `string` | Yes | Display name for the term |
| `slug` | `string` | Yes | URL-safe identifier (matches filename) |
| Additional fields | varies | No | Defined by the taxonomy's blueprint |

### Blueprint Fields for Terms

When a taxonomy references a blueprint, terms gain additional fields beyond title and slug:

```yaml
# resources/blueprints/taxonomies/tags.yaml
tabs:
  main:
    fields:
      - handle: description
        field:
          type: text
          display: Description
          validate:
            - max:200

      - handle: color
        field:
          type: text
          display: Color
          options:
            placeholder: "#3b82f6"
```

### Collection Association

Associate taxonomies with collections via the `taxonomies` array in collection definitions:

```yaml
# resources/collections/blog.yaml
title: Blog
blueprint: blog
taxonomies:
  - tags
  - categories
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/taxonomies` | List all taxonomy definitions |
| GET | `/api/taxonomies/{handle}/terms` | List all terms for a taxonomy |
| GET | `/api/taxonomies/{handle}/terms/{slug}` | Get a single term |
| POST | `/api/taxonomies/{handle}/terms` | Create a term |
| PUT | `/api/taxonomies/{handle}/terms/{slug}` | Update a term |
| DELETE | `/api/taxonomies/{handle}/terms/{slug}` | Delete a term |

### File Structure

```
resources/
├── taxonomies/
│   ├── tags.yaml              # Definition
│   └── categories.yaml        # Definition
├── blueprints/taxonomies/
│   ├── tags.yaml              # Blueprint (optional)
│   └── categories.yaml        # Blueprint (optional)
content/
└── taxonomies/
    ├── tags/
    │   ├── javascript.yaml    # Term
    │   ├── typescript.yaml    # Term
    │   └── react.yaml         # Term
    └── categories/
        ├── tutorials.yaml     # Term
        └── news.yaml          # Term
```

---

## Usage Examples

### Creating a Taxonomy

**Step 1:** Create the definition:

```yaml
# resources/taxonomies/categories.yaml
title: Categories
blueprint: categories
```

**Step 2:** (Optional) Create a blueprint for term fields:

```yaml
# resources/blueprints/taxonomies/categories.yaml
tabs:
  main:
    fields:
      - handle: description
        field:
          type: text
          display: Description

      - handle: icon
        field:
          type: text
          display: Icon Name
          options:
            placeholder: e.g. book, code, globe
```

**Step 3:** Create terms via the Control Panel or as files.

### Creating Terms via the Control Panel

1. Navigate to **Taxonomies** in the sidebar
2. Click the taxonomy (e.g. "Tags")
3. Click **Create Term**
4. Enter a title (slug auto-generates)
5. Fill any additional blueprint fields
6. Save

### Creating Terms via Files

```yaml
# content/taxonomies/tags/nextjs.yaml
title: Next.js
slug: nextjs
description: Content related to the Next.js framework
color: "#000000"
```

### Using Taxonomy Fields in Blueprints

Add a `taxonomy` field to your collection blueprint:

```yaml
- handle: tags
  field:
    type: taxonomy
    display: Tags

- handle: categories
  field:
    type: taxonomy
    display: Categories
    required: true
    validate:
      - required
```

Editors select terms from the associated taxonomy when creating or editing entries.

### Querying Terms via GraphQL

```graphql
{
  terms(taxonomy: "tags") {
    title
    slug
  }
}
```

### Querying Terms via REST API

```bash
# List all terms
curl http://localhost:3000/api/taxonomies/tags/terms

# Get single term
curl http://localhost:3000/api/taxonomies/tags/terms/javascript
```

---

## Common Patterns

### Tags vs Categories

Use two taxonomies for different grouping strategies:

```yaml
# resources/taxonomies/categories.yaml
title: Categories
# Broad, exclusive grouping (an entry typically has one category)

# resources/taxonomies/tags.yaml
title: Tags
# Narrow, inclusive labelling (an entry can have many tags)
```

### Hierarchical Categories

While Madori taxonomies are flat (terms don't nest), you can simulate hierarchy with naming conventions:

```yaml
# content/taxonomies/categories/
frontend.yaml          # title: Frontend
frontend-react.yaml    # title: Frontend > React
frontend-vue.yaml      # title: Frontend > Vue
backend.yaml           # title: Backend
backend-node.yaml      # title: Backend > Node.js
```

### Filtering Entries by Taxonomy

Query entries that have specific taxonomy terms assigned:

```graphql
{
  blogs(filter: { tags: "javascript" }) {
    title
    slug
  }
}
```

### Taxonomy Landing Pages

Build pages that list all entries for a specific term:

```tsx
// app/tags/[slug]/page.tsx
export default async function TagPage({ params }) {
  const { slug } = params

  const data = await queryGraphQL(`
    query GetTaggedPosts($tag: String!) {
      blogs(filter: { tags: $tag, status: "published" }) {
        title
        slug
        createdAt
      }
    }
  `, { tag: slug })

  return (
    <div>
      <h1>Posts tagged: {slug}</h1>
      <ul>
        {data.blogs.map(post => (
          <li key={post.slug}>
            <a href={`/blog/${post.slug}`}>{post.title}</a>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

### Displaying Term Metadata

If your taxonomy has a blueprint with additional fields, use the terms API to fetch metadata:

```tsx
async function getTagWithMeta(slug: string) {
  const res = await fetch(`/api/taxonomies/tags/terms/${slug}`)
  return res.json()
}

// Returns: { title: "JavaScript", slug: "javascript", description: "...", color: "#f7df1e" }
```

### Multi-Taxonomy Filtering

Associate multiple taxonomies with a collection for flexible content organisation:

```yaml
# resources/collections/blog.yaml
title: Blog
blueprint: blog
taxonomies:
  - categories    # Broad grouping
  - tags          # Detailed labels
  - authors       # Content by author
```

