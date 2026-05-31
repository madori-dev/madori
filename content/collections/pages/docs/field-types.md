---
title: Field Types
slug: docs/field-types
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Field Types

MADORI includes 17 built-in field types for building content schemas.

## Text

A simple single-line text input.

```yaml
- handle: title
  field:
    type: text
    display: Title
    required: true
```

## Slug

Auto-generates a URL-friendly slug. Validated against `[a-z0-9-]+`.

```yaml
- handle: slug
  field:
    type: slug
```

## Markdown

A plain-text editor for Markdown content.

```yaml
- handle: body
  field:
    type: markdown
    display: Body
```

## TipTap (Rich Text)

A full WYSIWYG editor powered by TipTap. Supports headings, lists, links, images, tables, code blocks, and text alignment.

```yaml
- handle: content
  field:
    type: tiptap
    display: Content
```

Content is stored as TipTap JSON and automatically converted to/from Markdown and HTML.

## Number

Numeric input. Use `options.integer` to restrict to whole numbers.

```yaml
- handle: price
  field:
    type: number
    display: Price
    options:
      integer: false
```

## Toggle

A boolean on/off switch.

```yaml
- handle: featured
  field:
    type: toggle
    display: Featured
    default: false
```

## Select

A dropdown with predefined options.

```yaml
- handle: category
  field:
    type: select
    display: Category
    options:
      options:
        - news
        - tutorials
        - updates
```

## Multiselect

Select multiple values from a list.

```yaml
- handle: tags
  field:
    type: multiselect
    display: Tags
    options:
      options:
        - javascript
        - typescript
        - react
        - nextjs
```

## Date

A date picker.

```yaml
- handle: published_at
  field:
    type: date
    display: Publish Date
```

## Asset

A file picker that opens the asset browser. Supports single or multiple files.

```yaml
- handle: featured_image
  field:
    type: asset
    display: Featured Image
    options:
      max_files: 1
```

### `max_files` option

| Value | Behavior |
|-------|----------|
| `1` | Single file — stores a string path |
| `> 1` | Multiple files up to limit — stores an array |
| `0` or omitted | Unlimited files — stores an array |

## Entries

Reference other collection entries by slug.

```yaml
- handle: related_posts
  field:
    type: entries
    display: Related Posts
```

Stores an array of slug strings.

## Taxonomy

Assign taxonomy terms to an entry.

```yaml
- handle: categories
  field:
    type: taxonomy
    display: Categories
```

Stores an array of term slugs.

## Replicator

A flexible, repeatable block builder. Each block is a fieldset.

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

Fieldsets are defined in `resources/fieldsets/{handle}.yaml`. Each block in the data includes a `_type` field indicating which fieldset it uses.

## Grid

Similar to replicator but each row shares the same field structure (no block types).

```yaml
- handle: pricing_tiers
  field:
    type: grid
    display: Pricing Tiers
```

## YAML

Raw YAML editing in a code editor.

```yaml
- handle: metadata
  field:
    type: yaml
    display: Custom Metadata
```

## Code

A code editor with syntax highlighting.

```yaml
- handle: snippet
  field:
    type: code
    display: Code Snippet
```

## Hidden

A hidden field — not displayed in the CP but stored in the entry data.

```yaml
- handle: internal_id
  field:
    type: hidden
    default: auto-generated
```
