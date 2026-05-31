---
title: Fieldsets
slug: docs/fieldsets
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Fieldsets

Fieldsets are reusable groups of fields. They power replicator blocks and can be imported into blueprints.

## Defining a Fieldset

Create a YAML file at `resources/fieldsets/{handle}.yaml`:

```yaml
fields:
  - handle: title
    field:
      type: text
      display: Title
      required: true

  - handle: subtitle
    field:
      type: text
      display: Subtitle

  - handle: button_text
    field:
      type: text
      display: Button Text

  - handle: button_link
    field:
      type: text
      display: Button Link
```

## Using Fieldsets in Replicators

Reference fieldsets by handle in a replicator field's `sets` option:

```yaml
- handle: blocks
  field:
    type: replicator
    display: Page Blocks
    options:
      sets:
        - hero
        - features_grid
        - basic_cta
```

Each block stored in the entry data includes a `_type` field matching the fieldset handle:

```yaml
blocks:
  - _type: hero
    title: Welcome
    subtitle: Get started today
    button_text: Learn More
    button_link: /docs
  - _type: basic_cta
    title: Ready to start?
    button_text: Sign Up
    button_link: /signup
```

## Importing Fieldsets into Blueprints

You can include a fieldset's fields directly in a blueprint using the `import` key:

```yaml
tabs:
  main:
    fields:
      - handle: title
        field:
          type: text
      - import: seo
```

This resolves the `seo` fieldset and injects its fields at that position.

## Nested Imports

Fieldsets can import other fieldsets. Circular references are detected and will throw an error.

## Managing Fieldsets

### Control Panel

Navigate to **Fieldsets** in the CP sidebar to create, edit, and delete fieldsets visually.

### API

```
GET    /api/fieldsets
GET    /api/fieldsets/{handle}
PUT    /api/fieldsets/{handle}
DELETE /api/fieldsets/{handle}
```
