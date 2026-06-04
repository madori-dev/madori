---
title: Navigation
slug: navigation
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Navigation

Madori provides a navigation management system for building and maintaining site menus, sidebars, and any other link structure. Navigations are stored as flat YAML files, edited visually in the Control Panel with drag-and-drop tree editing, and queried from your frontend via the REST API or GraphQL.

Each navigation is identified by a handle (e.g. `main`, `footer`, `docs`) and contains a nested tree of items. Items can be URLs, references to collection entries, or text-only labels used as group headings.

---

## Configuration Reference

### Navigation Definition

Navigation definitions live at `resources/definitions/navigations/{handle}.yaml` (or `.json`). They configure the behaviour of a navigation in the Control Panel editor.

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `title` | `string` | Yes | — | Display name shown in the CP sidebar and editor |
| `max_depth` | `number` | No | unlimited | Maximum nesting depth allowed. A flat list has depth 0; each level of nesting adds 1 |
| `collections` | `string[]` | No | all | Which collections are available when adding entry reference items |

**Example definition:**

```yaml
# resources/definitions/navigations/main.yaml
title: Main Navigation
max_depth: 3
collections:
  - pages
  - blog
```

### Navigation Data

Navigation content is stored at `content/navigation/{handle}.yaml`. This is the file the editor interface reads and writes.

| Property | Type | Description |
|----------|------|-------------|
| `items` | `NavigationItem[]` | Top-level array of navigation items |

### Item Properties

Each item in the navigation tree supports these properties:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `label` | `string` | Yes | Display text for the navigation item |
| `url` | `string` | No | Link URL (absolute or relative path) |
| `entry` | `string` | No | Reference to a collection entry by slug (e.g. `pages/about`) |
| `external` | `boolean` | No | When `true`, link opens in a new tab |
| `children` | `NavigationItem[]` | No | Nested child items |

An item should have either a `url` or an `entry` — not both. Items with neither serve as text-only group headings in menus.

---

## Creating a Navigation

### Via the Control Panel

1. Navigate to **Navigation** in the CP sidebar
2. Click **Create Navigation**
3. Enter a handle (e.g. `footer`) and title (e.g. "Footer Navigation")
4. Optionally set a `max_depth` to limit nesting
5. Save the definition

The editor interface appears immediately, ready for you to add items.

### Via File

Create both the definition and data files:

```yaml
# resources/definitions/navigations/footer.yaml
title: Footer Navigation
max_depth: 2
collections:
  - pages
```

```yaml
# content/navigation/footer.yaml
items:
  - label: Home
    url: /
  - label: About
    url: /about
  - label: Contact
    url: /contact
```

---

## Editing in the Control Panel

The navigation editor provides a visual tree interface for managing items.

### Adding Items

Click **Add Item** to insert a new navigation item. Choose the item type:

| Type | Use Case |
|------|----------|
| **URL** | Links to any URL (internal path or external) |
| **Entry Reference** | Links to a collection entry — URL resolves automatically |
| **Text** | Non-linking label used as a group heading |

### Nested Editing

Drag items to reorder them within the same level or nest them under a parent item. The editor supports:

- **Reordering**: Drag an item up or down within its current level
- **Nesting**: Drag an item onto another item to make it a child
- **Outdenting**: Drag a nested item to the left to promote it up one level
- **Keyboard reordering**: Use the up/down arrow controls for accessible reordering without drag-and-drop

### Max Depth Enforcement

When a navigation definition specifies `max_depth`, the editor prevents nesting beyond that limit:

- Drop targets disappear when dropping would exceed the depth limit
- Visual feedback indicates when the maximum depth is reached
- The API rejects save operations that would violate the constraint, returning a `DEPTH_EXCEEDED` error

A `max_depth` of `0` means a flat list only (no nesting). A `max_depth` of `1` allows one level of children, and so on.

### Removing Items

When you remove an item that has children, the editor prompts with two options:

- **Delete children**: Removes the item and all its descendants
- **Promote children**: Removes the item but moves its children up to the parent level

### Inline Editing

Each item displays its label and link target inline. Click the label or URL to edit them directly in the tree without opening a separate form.

---

## Item Types

### URL Items

Link to any path or external URL:

```yaml
- label: Blog
  url: /blog

- label: GitHub
  url: https://github.com/my-org/my-repo
  external: true
```

Set `external: true` to indicate the link should open in a new tab. Your frontend template can use this to render a target attribute or external link icon.

### Entry Reference Items

Reference a collection entry by its slug. The URL resolves automatically based on the entry's collection routing:

```yaml
- label: Getting Started
  entry: pages/getting-started

- label: Latest Post
  entry: blog/hello-world
```

Entry references are useful because the link stays valid even if the entry's URL structure changes.

### Text Items

Items with only a `label` (no `url` or `entry`) serve as non-clickable headings:

```yaml
- label: Resources
  children:
    - label: Documentation
      url: /docs
    - label: API Reference
      url: /api
```

Text items are typically used as parent groups in dropdown menus or sidebar sections.

---

## Frontend Rendering

### REST API

Fetch navigation data from the REST API:

```
GET /api/navigation         # List all navigations
GET /api/navigation/{handle} # Get a single navigation tree
```

**Response format:**

```json
{
  "data": {
    "handle": "main",
    "items": [
      { "label": "Home", "url": "/" },
      {
        "label": "Documentation",
        "url": "/docs",
        "children": [
          { "label": "Getting Started", "entry": "pages/getting-started" },
          { "label": "Configuration", "url": "/docs/configuration" }
        ]
      },
      { "label": "GitHub", "url": "https://github.com/example", "external": true }
    ]
  }
}
```

### GraphQL

Query navigation data through the GraphQL API:

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

List all navigations:

```graphql
{
  navigations {
    handle
    items {
      label
      url
    }
  }
}
```

### Save API

Update a navigation tree programmatically:

```
PUT /api/navigation/{handle}
Content-Type: application/json

{
  "items": [
    { "label": "Home", "url": "/" },
    { "label": "About", "url": "/about" }
  ]
}
```

If the tree violates the configured `max_depth`, the API returns:

```json
{
  "error": {
    "code": "DEPTH_EXCEEDED",
    "message": "Navigation tree exceeds maximum allowed depth",
    "maxDepth": 2,
    "actualDepth": 3
  }
}
```

---

## Usage Examples

### Rendering a Navigation in Next.js

Fetch the navigation at build time or request time and render it recursively:

```tsx
import Link from 'next/link'

interface NavItem {
  label: string
  url?: string
  entry?: string
  external?: boolean
  children?: NavItem[]
}

async function getNavigation(handle: string): Promise<NavItem[]> {
  const res = await fetch(`${process.env.SITE_URL}/api/navigation/${handle}`)
  const json = await res.json()
  return json.data.items
}

function NavLink({ item }: { item: NavItem }) {
  const href = item.url ?? `/${item.entry}`

  if (!item.url && !item.entry) {
    return <span className="font-semibold">{item.label}</span>
  }

  if (item.external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {item.label}
      </a>
    )
  }

  return <Link href={href}>{item.label}</Link>
}

function NavTree({ items }: { items: NavItem[] }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.label}>
          <NavLink item={item} />
          {item.children && <NavTree items={item.children} />}
        </li>
      ))}
    </ul>
  )
}

export default async function MainNav() {
  const items = await getNavigation('main')
  return (
    <nav aria-label="Main navigation">
      <NavTree items={items} />
    </nav>
  )
}
```

### Fetching Navigation via GraphQL

Using a GraphQL client like `graphql-request`:

```tsx
import { gql, request } from 'graphql-request'

const NAVIGATION_QUERY = gql`
  query GetNavigation($handle: String!) {
    navigation(handle: $handle) {
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
        }
      }
    }
  }
`

const data = await request('/api/graphql', NAVIGATION_QUERY, { handle: 'main' })
```

### Sidebar Navigation with Active State

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  label: string
  url?: string
  children?: NavItem[]
}

function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Documentation sidebar">
      <ul className="space-y-1">
        {items.map((item) => {
          const isActive = pathname === item.url
          return (
            <li key={item.label}>
              {item.url ? (
                <Link
                  href={item.url}
                  className={isActive ? 'font-bold text-blue-600' : 'text-gray-700'}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              ) : (
                <span className="text-sm font-semibold uppercase text-gray-500">
                  {item.label}
                </span>
              )}
              {item.children && (
                <ul className="ml-4 mt-1 space-y-1">
                  {item.children.map((child) => (
                    <li key={child.label}>
                      <Link
                        href={child.url ?? '#'}
                        className={pathname === child.url ? 'font-bold' : ''}
                      >
                        {child.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```

---

## Common Patterns

### Multi-Level Dropdown Menu

Structure a navigation with grouped sections for a mega-menu or multi-level dropdown:

```yaml
# content/navigation/main.yaml
items:
  - label: Home
    url: /
  - label: Products
    children:
      - label: Software
        children:
          - label: CMS
            url: /products/cms
          - label: Analytics
            url: /products/analytics
      - label: Services
        children:
          - label: Consulting
            url: /services/consulting
          - label: Training
            url: /services/training
  - label: Blog
    url: /blog
  - label: Contact
    url: /contact
```

Set `max_depth: 2` on the definition to allow this structure but prevent deeper nesting.

### Footer with Column Groups

Use text-only items as column headings in a footer layout:

```yaml
# content/navigation/footer.yaml
items:
  - label: Product
    children:
      - label: Features
        url: /features
      - label: Pricing
        url: /pricing
      - label: Changelog
        url: /changelog
  - label: Company
    children:
      - label: About
        url: /about
      - label: Careers
        url: /careers
      - label: Blog
        url: /blog
  - label: Legal
    children:
      - label: Privacy Policy
        url: /privacy
      - label: Terms of Service
        url: /terms
```

Your frontend template renders top-level items as column headings and children as the links within each column.

### Documentation Sidebar

A flat navigation for ordered documentation pages:

```yaml
# resources/definitions/navigations/docs.yaml
title: Documentation Sidebar
max_depth: 1
collections:
  - pages
```

```yaml
# content/navigation/docs.yaml
items:
  - label: Getting Started
    entry: pages/docs/getting-started
  - label: Configuration
    entry: pages/docs/configuration
  - label: Collections
    entry: pages/docs/collections
  - label: Blueprints
    entry: pages/docs/blueprints
  - label: Field Types
    entry: pages/docs/field-types
  - label: Advanced
    children:
      - label: GraphQL API
        entry: pages/docs/graphql
      - label: CLI
        entry: pages/docs/cli
      - label: Deployment
        entry: pages/docs/deployment
```

Setting `max_depth: 1` keeps the sidebar manageable — one level of grouping, no deeper nesting.

### Mixing Internal and External Links

Combine internal paths, entry references, and external links in a single navigation:

```yaml
items:
  - label: Home
    url: /
  - label: Documentation
    entry: pages/docs/getting-started
  - label: API Reference
    url: /api/graphql
  - label: GitHub
    url: https://github.com/my-org/my-project
    external: true
  - label: Discord
    url: https://discord.gg/invite-code
    external: true
```

### Programmatic Navigation Updates

Update navigation trees from build scripts or external integrations:

```ts
async function addNavItem(handle: string, item: { label: string; url: string }) {
  // Fetch current tree
  const res = await fetch(`http://localhost:3000/api/navigation/${handle}`)
  const { data } = await res.json()

  // Append new item
  data.items.push(item)

  // Save updated tree
  await fetch(`http://localhost:3000/api/navigation/${handle}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: data.items }),
  })
}
```

---

## Managing Navigations

### Control Panel

Navigate to **Navigation** in the CP sidebar to:

- Create new navigation definitions
- Edit tree structure with drag-and-drop
- Add, remove, and reorder items
- Configure max depth and available collections

### API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/navigation` | List all navigations |
| GET | `/api/navigation/{handle}` | Get a navigation tree |
| PUT | `/api/navigation/{handle}` | Save/update a navigation tree |

### File-Based Management

Edit navigation YAML directly for version control:

```bash
content/navigation/
├── main.yaml
├── footer.yaml
└── docs.yaml

resources/definitions/navigations/
├── main.yaml
├── footer.yaml
└── docs.yaml
```

Changes to navigation files are reflected immediately on the next API request or page load.
