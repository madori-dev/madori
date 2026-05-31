---
title: Navigation
slug: docs/navigation
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Navigation

MADORI supports structured navigation trees that you can query from your frontend templates.

## Defining a Navigation

Navigation data lives at `content/navigation/{handle}.yaml`:

```yaml
items:
  - label: Home
    url: /
  - label: Blog
    url: /blog
  - label: About
    url: /about
    children:
      - label: Team
        url: /about/team
      - label: Contact
        url: /contact
  - label: Docs
    url: https://docs.example.com
    external: true
```

## Item Properties

| Property | Type | Description |
|----------|------|-------------|
| `label` | string | Display text |
| `url` | string | Link URL |
| `entry` | string | Reference to a collection entry slug |
| `external` | boolean | Opens in new tab |
| `children` | array | Nested navigation items |

## Editing in the Control Panel

Navigate to **Navigation** in the CP sidebar to create and edit navigation structures visually.

## Querying

### REST API

```
GET /api/navigation
GET /api/navigation/{handle}
```

### GraphQL

```graphql
{
  navigation(handle: "main") {
    items {
      label
      url
      children {
        label
        url
      }
    }
  }
}
```

## Using in Templates

Query the navigation data and render it in your Next.js layout:

```tsx
const nav = await fetch('/api/navigation/main').then(r => r.json())

<nav>
  {nav.data.items.map(item => (
    <a key={item.url} href={item.url}>{item.label}</a>
  ))}
</nav>
```
