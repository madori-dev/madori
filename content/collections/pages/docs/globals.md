---
title: Globals
slug: docs/globals
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Globals

Globals are site-wide data sets — think site settings, footer content, social links, or any data that isn't tied to a specific collection.

## Defining a Global

Create a definition at `resources/globals/{handle}.yaml`:

```yaml
title: Site Settings
blueprint: site-settings
```

Create a matching blueprint at `resources/blueprints/globals/{handle}.yaml`:

```yaml
tabs:
  main:
    fields:
      - handle: site_name
        field:
          type: text
          display: Site Name
          required: true
      - handle: tagline
        field:
          type: text
          display: Tagline
      - handle: logo
        field:
          type: asset
          display: Logo
          options:
            max_files: 1
```

## Storing Global Data

Global data lives at `content/globals/{handle}.yaml`:

```yaml
site_name: My Awesome Site
tagline: Built with MADORI
logo: /assets/logo.svg
```

## Editing Globals

In the Control Panel, navigate to **Globals → {handle}** to edit global data through the blueprint-defined fields.

## Querying Globals

### REST API

```
GET /api/globals
GET /api/globals/{handle}
PUT /api/globals/{handle}
```

### GraphQL

```graphql
{
  global(handle: "site-settings") {
    data
  }
}
```
