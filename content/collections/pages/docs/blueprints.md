---
title: Blueprints
slug: docs/blueprints
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Blueprints

Blueprints define the field schema for your content. They specify which fields appear when editing a collection entry, global, taxonomy, or form.

## Structure

Blueprints live at `resources/blueprints/{type}/{handle}.yaml` and are organized into tabs containing fields:

```yaml
tabs:
  main:
    display: Main
    fields:
      - handle: title
        field:
          type: text
          display: Title
          required: true

      - handle: slug
        field:
          type: slug

      - handle: content
        field:
          type: tiptap
          display: Content

  sidebar:
    display: Sidebar
    fields:
      - handle: status
        field:
          type: select
          options:
            options:
              - published
              - draft
          default: draft
```

## Blueprint Types

| Type | Location | Used By |
|------|----------|---------|
| `collections` | `resources/blueprints/collections/` | Collection entries |
| `globals` | `resources/blueprints/globals/` | Global data sets |
| `taxonomies` | `resources/blueprints/taxonomies/` | Taxonomy terms |
| `forms` | `resources/blueprints/forms/` | Form submissions |

## Field Definition

Each field has a `handle` (the key used in content files) and a `field` config:

```yaml
- handle: featured_image
  field:
    type: asset
    display: Featured Image
    required: false
    options:
      max_files: 1
```

### Common Field Properties

| Property | Type | Description |
|----------|------|-------------|
| `type` | string | The field type (see Field Types) |
| `display` | string | Label shown in the control panel |
| `required` | boolean | Whether the field must have a value |
| `default` | any | Default value for new entries |
| `validate` | string[] | Validation rules |
| `options` | object | Type-specific configuration |
| `visibility` | object | Conditional display rules |

### Visibility Conditions

Fields can be shown or hidden based on other field values:

```yaml
- handle: external_url
  field:
    type: text
    display: External URL
    visibility:
      field: link_type
      operator: equals
      value: external
```

Operators: `equals`, `not_equals`, `contains`, `empty`, `not_empty`

## Sections

Tabs can contain sections for visual grouping:

```yaml
tabs:
  main:
    fields:
      - handle: title
        field:
          type: text
    sections:
      seo:
        display: SEO
        fields:
          - handle: meta_title
            field:
              type: text
          - handle: meta_description
            field:
              type: text
```

## Managing Blueprints

### Control Panel

Navigate to **Blueprints** in the CP sidebar. You can:
- Create new blueprints
- Add/remove/reorder fields visually
- Configure field options
- Add tabs

### API

```
GET    /api/blueprints/{type}
GET    /api/blueprints/{type}/{handle}
PUT    /api/blueprints/{type}/{handle}
DELETE /api/blueprints/{type}/{handle}
```

## Validation

Blueprints auto-generate Zod validation schemas. When an entry is saved, the data is validated against the blueprint. Invalid data returns structured field-level errors.
