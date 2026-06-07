---
title: Fieldsets
slug: fieldsets
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-06-07T09:00:00.000Z
---

# Fieldsets

Fieldsets are reusable groups of fields that can be shared across blueprints. They serve two purposes: defining block types for Replicator fields and providing importable field groups to avoid duplicating field definitions across multiple blueprints.

When you define a fieldset, it becomes available as a Replicator block type and can be imported into any blueprint's tab or section.

---

## Configuration Reference

### File Location

Fieldsets live at `resources/fieldsets/{handle}.yaml`. The handle is used to reference the fieldset in Replicator `sets` arrays and blueprint `import` statements.

### Fieldset Structure

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `fields` | `FieldConfig[]` | Yes | Array of field definitions (same format as blueprint fields) |
| `display` | `string` | No | Display name shown in the Replicator block picker. Auto-generated from handle if omitted |
| `is_block` | `boolean` | No | When `true`, the fieldset is automatically available in `blocks` fields without explicit configuration |

### Field Configuration

Each field within a fieldset follows the same structure as blueprint fields:

```yaml
fields:
  - handle: <field_handle>
    field:
      type: <field_type>
      display: <Human Label>
      required: <boolean>
      default: <default_value>
      validate: <string[]>
      options: <object>
      visibility: <object>
```

All [field types](/docs/field-types) and [validation rules](/docs/blueprints#validation-rules) available in blueprints work identically in fieldsets.

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fieldsets` | List all fieldsets |
| GET | `/api/fieldsets/{handle}` | Get a single fieldset |
| PUT | `/api/fieldsets/{handle}` | Create or update a fieldset |
| DELETE | `/api/fieldsets/{handle}` | Delete a fieldset |

---

## Usage Examples

### Defining a Hero Block Fieldset

```yaml
# resources/fieldsets/hero.yaml
is_block: true
fields:
  - handle: title
    field:
      type: text
      display: Title
      required: true
      validate:
        - required
        - max:120

  - handle: subtitle
    field:
      type: text
      display: Subtitle

  - handle: background_image
    field:
      type: asset
      display: Background Image
      options:
        max_files: 1

  - handle: button_text
    field:
      type: text
      display: Button Text

  - handle: button_link
    field:
      type: text
      display: Button Link
      validate:
        - url
```

### Using Fieldsets as Blocks

Fieldsets with `is_block: true` are automatically available when using the `blocks` field type:

```yaml
# In a blueprint — no sets configuration needed
- handle: page_content
  field:
    type: blocks
    display: Page Content
```

All fieldsets marked `is_block: true` become available block types. This is the simplest way to build page builders — just add a `blocks` field and create block fieldsets.

### Using Fieldsets in Replicators

Reference fieldsets by handle in a Replicator field's `sets` option:

```yaml
# In a blueprint
- handle: blocks
  field:
    type: replicator
    display: Page Blocks
    options:
      sets:
        - hero
        - features_grid
        - basic_cta
        - rich_text
```

Each block stored in entry data includes a `_type` field matching the fieldset handle:

```yaml
blocks:
  - _type: hero
    title: Welcome to Madori
    subtitle: A flat-file CMS for Next.js
    button_text: Get Started
    button_link: /docs/getting-started
  - _type: basic_cta
    title: Ready to start?
    button_text: Sign Up
    button_link: /signup
```

### Importing Fieldsets into Blueprints

Include a fieldset's fields directly in a blueprint using the `import` key:

```yaml
tabs:
  main:
    display: Content
    fields:
      - handle: title
        field:
          type: text
          display: Title
          required: true

      - handle: body
        field:
          type: tiptap
          display: Body

  seo:
    display: SEO
    fields:
      - import: seo
```

This resolves the `seo` fieldset and injects its fields at that position in the tab.

### Managing Fieldsets in the Control Panel

Navigate to **Fieldsets** in the CP sidebar to:

1. View all defined fieldsets
2. Create new fieldsets with the visual field editor
3. Add, remove, and reorder fields within a fieldset
4. Delete unused fieldsets

---

## Common Patterns

### Shared SEO Fields

Define SEO fields once and import them across all collection blueprints:

```yaml
# resources/fieldsets/seo.yaml
fields:
  - handle: meta_title
    field:
      type: text
      display: Meta Title
      validate:
        - max:60
      options:
        placeholder: Override page title for search engines

  - handle: meta_description
    field:
      type: text
      display: Meta Description
      validate:
        - max:160
      options:
        placeholder: Brief description for search results

  - handle: og_image
    field:
      type: asset
      display: Social Share Image
      options:
        max_files: 1
```

Import into any blueprint:

```yaml
sections:
  seo:
    display: SEO
    fields:
      - import: seo
```

### Building a Block Library

Create a library of reusable page-building blocks:

```
resources/fieldsets/
├── hero.yaml              # Full-width hero with image
├── rich_text.yaml         # Simple text content block
├── features_grid.yaml     # Feature cards in a grid
├── basic_cta.yaml         # Call-to-action with button
├── testimonials.yaml      # Customer quotes
├── image_gallery.yaml     # Grid of images
├── video_embed.yaml       # Video player embed
└── pricing_table.yaml     # Pricing comparison
```

Then compose page builders by selecting which blocks are available:

```yaml
# Landing pages get all blocks
- handle: blocks
  field:
    type: replicator
    options:
      sets:
        - hero
        - features_grid
        - basic_cta
        - testimonials
        - pricing_table

# Blog posts get simpler blocks
- handle: blocks
  field:
    type: replicator
    options:
      sets:
        - rich_text
        - image_gallery
        - video_embed
        - basic_cta
```

### Nested Fieldsets

Fieldsets can import other fieldsets for composition. A CTA block might reuse a button fieldset:

```yaml
# resources/fieldsets/button.yaml
fields:
  - handle: text
    field:
      type: text
      display: Button Text
      required: true

  - handle: url
    field:
      type: text
      display: Button URL
      validate:
        - url

  - handle: style
    field:
      type: select
      display: Button Style
      default: primary
      options:
        options:
          - primary
          - secondary
          - outline
```

Circular references between fieldsets are detected and produce an error at load time.

### Consistent Block Naming

Use a consistent naming convention for fieldset handles:

- Use snake_case for multi-word handles: `features_grid`, `image_gallery`
- Group related blocks with prefixes: `card_basic`, `card_featured`, `card_pricing`
- Keep handles short but descriptive — they appear in content YAML as `_type` values

