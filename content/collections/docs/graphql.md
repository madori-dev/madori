---
title: GraphQL API
slug: graphql
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# GraphQL API

Madori auto-generates a GraphQL schema from your blueprints and definitions. Every collection, global, taxonomy, and navigation becomes queryable without writing any schema code. The API updates automatically whenever you add or modify blueprints.

In development, a GraphiQL interface is available at the endpoint URL for exploring and testing queries interactively.

---

## Configuration Reference

### Endpoint Configuration

Configure GraphQL behaviour in `madori.config.ts`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `graphql.enabled` | `boolean` | `true` | Enable or disable the GraphQL API |
| `graphql.path` | `string` | `/api/graphql` | URL path for the GraphQL endpoint |
| `graphql.introspection` | `boolean` | `true` in dev, `false` in prod | Allow schema introspection queries |

```ts
// madori.config.ts
graphql: {
  enabled: true,
  path: '/api/graphql',
  introspection: process.env.NODE_ENV !== 'production',
}
```

### Schema Generation Rules

For each collection with a blueprint, Madori generates:

| Generated Item | Naming | Description |
|----------------|--------|-------------|
| Type | PascalCase of handle | Type with all entry + blueprint fields |
| Singular query | camelCase of handle | Returns a single entry by slug |
| Plural query | camelCase plural of handle | Returns a filtered list |
| Filter input | `{Type}Filter` | Filter fields for list queries |

### Standard Entry Fields

Every collection type includes these built-in fields:

| Field | GraphQL Type | Description |
|-------|--------------|-------------|
| `title` | `String` | Entry title |
| `slug` | `String` | URL slug identifier |
| `status` | `String` | `published` or `draft` |
| `author` | `String` | Author identifier |
| `content` | `String` | Markdown body content |
| `createdAt` | `String` | ISO 8601 timestamp |
| `updatedAt` | `String` | ISO 8601 timestamp |

### Blueprint Field Type Mapping

| Blueprint Type | GraphQL Type |
|---------------|--------------|
| `text`, `slug`, `markdown`, `tiptap`, `select`, `date`, `asset` (single), `yaml`, `code` | `String` |
| `number` | `Float` (or `Int` with `options.integer: true`) |
| `toggle` | `Boolean` |
| `multiselect`, `entries`, `taxonomy`, `asset` (multiple) | `[String]` |
| `replicator`, `grid` | `String` (serialized JSON) |

### List Query Arguments

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `filter` | `{Type}Filter` | — | Key-value object matching field values |
| `limit` | `Int` | all | Maximum entries to return |
| `offset` | `Int` | `0` | Skip N entries (for pagination) |
| `sort` | `String` | — | Format: `"fieldName:direction"` (e.g. `"createdAt:desc"`) |

### Additional Queries

| Query | Arguments | Returns | Description |
|-------|-----------|---------|-------------|
| `global(handle: String!)` | handle | `Global` | Get a global's data |
| `globals` | none | `[Global]` | List all globals |
| `terms(taxonomy: String!)` | taxonomy | `[Term]` | Get taxonomy terms |
| `navigation(handle: String!)` | handle | `Navigation` | Get a navigation tree |
| `navigations` | none | `[Navigation]` | List all navigations |

---

## Usage Examples

### Single Entry Query

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

### List with Filtering and Pagination

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
    featured_image
  }
}
```

### Multiple Filters

```graphql
{
  blogs(
    filter: { status: "published", author: "admin" }
    limit: 5
    sort: "createdAt:desc"
  ) {
    title
    slug
  }
}
```

### Querying Globals

```graphql
{
  global(handle: "site-settings") {
    data
  }
}
```

### Querying Navigation Trees

```graphql
{
  navigation(handle: "main") {
    handle
    items {
      label
      url
      entry
      external
      children {
        label
        url
        entry
        external
        children {
          label
          url
        }
      }
    }
  }
}
```

### Querying Taxonomy Terms

```graphql
{
  terms(taxonomy: "tags") {
    title
    slug
  }
}
```

### Using with graphql-request

```ts
import { gql, request } from 'graphql-request'

const POSTS_QUERY = gql`
  query GetPosts($limit: Int, $offset: Int) {
    blogs(
      filter: { status: "published" }
      limit: $limit
      offset: $offset
      sort: "createdAt:desc"
    ) {
      title
      slug
      content
      createdAt
      featured_image
    }
  }
`

const data = await request('http://localhost:3000/api/graphql', POSTS_QUERY, {
  limit: 10,
  offset: 0,
})
```

### Using with Apollo Client

```ts
import { ApolloClient, InMemoryCache, gql } from '@apollo/client'

const client = new ApolloClient({
  uri: 'http://localhost:3000/api/graphql',
  cache: new InMemoryCache(),
})

const { data } = await client.query({
  query: gql`
    {
      blogs(filter: { status: "published" }, limit: 10, sort: "createdAt:desc") {
        title
        slug
        createdAt
      }
    }
  `,
})
```

### Using with fetch (No Library)

```ts
async function queryGraphQL(query: string, variables?: Record<string, unknown>) {
  const response = await fetch('http://localhost:3000/api/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })

  const json = await response.json()
  if (json.errors) throw new Error(json.errors[0].message)
  return json.data
}

const data = await queryGraphQL(`
  {
    blogs(limit: 5, sort: "createdAt:desc") {
      title
      slug
    }
  }
`)
```

### Next.js Server Component Integration

```tsx
async function getPublishedPosts() {
  const response = await fetch(`${process.env.SITE_URL}/api/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `{
        blogs(filter: { status: "published" }, sort: "createdAt:desc") {
          title
          slug
          createdAt
          featured_image
        }
      }`,
    }),
    next: { revalidate: 60 }, // ISR: revalidate every 60 seconds
  })

  const json = await response.json()
  return json.data.blogs
}

export default async function BlogList() {
  const posts = await getPublishedPosts()

  return (
    <ul>
      {posts.map((post) => (
        <li key={post.slug}>
          <a href={`/blog/${post.slug}`}>{post.title}</a>
        </li>
      ))}
    </ul>
  )
}
```

---

## Common Patterns

### Pagination

Implement offset-based pagination using `limit` and `offset`:

```graphql
# Page 1 (items 1-10)
{ blogs(limit: 10, offset: 0) { title slug } }

# Page 2 (items 11-20)
{ blogs(limit: 10, offset: 10) { title slug } }

# Page 3 (items 21-30)
{ blogs(limit: 10, offset: 20) { title slug } }
```

### Sort Patterns

The `sort` argument uses `"field:direction"` format:

```graphql
# Newest first
{ blogs(sort: "createdAt:desc") { title } }

# Alphabetical
{ blogs(sort: "title:asc") { title } }

# By update date
{ blogs(sort: "updatedAt:desc") { title } }
```

### Combining Queries

Request data from multiple sources in a single query:

```graphql
{
  siteSettings: global(handle: "site-settings") {
    data
  }

  mainNav: navigation(handle: "main") {
    items {
      label
      url
      children { label url }
    }
  }

  recentPosts: blogs(limit: 3, sort: "createdAt:desc") {
    title
    slug
  }
}
```

### Draft Preview

Query draft entries for preview functionality (requires authentication):

```graphql
{
  blog(slug: "upcoming-post") {
    title
    content
    status
  }
}
```

### Disabling Introspection in Production

Prevent schema exposure in production by setting introspection to `false`:

```ts
// madori.config.ts
graphql: {
  enabled: true,
  path: '/api/graphql',
  introspection: false,
}
```

This disables the `__schema` and `__type` queries while leaving all other queries functional.

### Static Site Generation with GraphQL

Pre-render all pages at build time using GraphQL:

```tsx
// app/blog/[slug]/page.tsx
export async function generateStaticParams() {
  const data = await queryGraphQL(`{
    blogs(filter: { status: "published" }) {
      slug
    }
  }`)

  return data.blogs.map((post) => ({ slug: post.slug }))
}
```

