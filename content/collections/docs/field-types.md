---
title: Field Types
slug: field-types
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Field Types

Madori includes 17 built-in field types for constructing content schemas via blueprints. Each field type defines how content is captured in the Control Panel and how data is stored in flat-file entries.

This reference documents every field type with its configuration options, supported validation rules, stored value format, and example YAML configuration.

---

## Configuration Reference

All field types share a common configuration structure defined in blueprints:

```yaml
- handle: field_handle
  field:
    type: <field_type>
    display: Human Label
    required: true
    default: <default_value>
    validate:
      - required
      - min:5
      - max:200
    options:
      # type-specific options
    visibility:
      field: another_field
      operator: equals
      value: show_this
```

### Common Properties

| Property | Type | Description |
|----------|------|-------------|
| `type` | `string` | One of the 17 field type identifiers (required) |
| `display` | `string` | Label shown in the Control Panel. Auto-generated from handle if omitted |
| `required` | `boolean` | Whether the field must have a value. Default: `false` |
| `default` | `any` | Default value pre-populated on create forms |
| `validate` | `string[]` | Array of validation rule strings |
| `options` | `object` | Type-specific configuration options |
| `visibility` | `object` | Conditional visibility based on another field's value |

### Validation Rules

Madori supports the following validation rules. Each rule is only enforced on compatible field types — incompatible rules are silently ignored with a console warning.

| Rule | Syntax | Compatible Types | Description |
|------|--------|------------------|-------------|
| `required` | `required` | All types | Field must have a non-empty value |
| `min` | `min:<n>` | text, slug, markdown, tiptap, code, number | Minimum character length (text) or minimum value (number) |
| `max` | `max:<n>` | text, slug, markdown, tiptap, code, number | Maximum character length (text) or maximum value (number) |
| `regex` | `regex:<pattern>` | text, slug, markdown, tiptap, code | Value must match the regular expression |
| `url` | `url` | text, slug, markdown, tiptap, code | Value must be a valid URL |
| `email` | `email` | text, slug, markdown, tiptap, code | Value must be a valid email address |
| `numeric_range` | `numeric_range:<min>,<max>` | number | Value must be within the specified range |

### Visibility Conditions

Any field can be conditionally shown or hidden based on another field's value:

```yaml
visibility:
  field: category
  operator: equals
  value: premium
```

Supported operators: `equals`, `not_equals`, `contains`, `empty`, `not_empty`.

When a field is hidden, its value is excluded from the submission payload.

---

## Text

A single-line text input for short-form content such as titles, names, and labels.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `placeholder` | `string` | — | Placeholder text displayed when the field is empty |

### Supported Validation

`required`, `min`, `max`, `regex`, `url`, `email`

### Value Format

Stored as a `string`.

### Example

```yaml
- handle: title
  field:
    type: text
    display: Page Title
    required: true
    default: Untitled
    validate:
      - required
      - min:3
      - max:120
    options:
      placeholder: Enter a page title...
```

---

## Slug

An auto-formatted URL-friendly identifier. Renders with a monospace font and provides guidance to use lowercase letters, numbers, and hyphens.

### Configuration Options

No type-specific options. Inherits common properties.

### Supported Validation

`required`, `min`, `max`, `regex`, `url`, `email`

The built-in pattern `[a-z0-9-]+` is recommended via the `regex` rule for strict enforcement.

### Value Format

Stored as a `string`. Expected pattern: `[a-z0-9-]+`.

### Example

```yaml
- handle: slug
  field:
    type: slug
    display: URL Slug
    required: true
    validate:
      - required
      - regex:^[a-z0-9-]+$
```

---

## Markdown

A multi-line plain-text editor for writing Markdown content. Renders as a resizable textarea.

### Configuration Options

No type-specific options. Inherits common properties.

### Supported Validation

`required`, `min`, `max`, `regex`, `url`, `email`

When `min` or `max` is used, it applies to character count of the raw Markdown text.

### Value Format

Stored as a `string` containing raw Markdown.

### Example

```yaml
- handle: body
  field:
    type: markdown
    display: Body Content
    validate:
      - min:50
```

---

## Tiptap

A full WYSIWYG rich-text editor powered by TipTap. Supports headings, lists, links, images, tables, code blocks, and text alignment. Content is stored as TipTap JSON and can be converted to/from Markdown and HTML.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `placeholder` | `string` | — | Placeholder text displayed in the empty editor |

### Supported Validation

`required`, `min`, `max`, `regex`, `url`, `email`

Validation applies to the text content extracted from the structured JSON.

### Value Format

Stored as a TipTap JSON object (structured document tree). Accepts JSON objects, JSON strings, or legacy Markdown strings on read.

### Example

```yaml
- handle: content
  field:
    type: tiptap
    display: Rich Content
    required: true
    options:
      placeholder: Start writing...
```

---

## Number

A numeric input field. Supports integer restriction, min/max bounds, and step increments via HTML number input attributes.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `min` | `number` | — | Minimum allowed value (HTML input constraint) |
| `max` | `number` | — | Maximum allowed value (HTML input constraint) |
| `step` | `number` | — | Step increment for the input control |
| `integer` | `boolean` | `false` | When `true`, restricts to whole numbers |

### Supported Validation

`required`, `min`, `max`, `numeric_range`

The `min` and `max` validation rules enforce server-side/client-side minimum and maximum values. The `numeric_range` rule combines both into a single declaration.

### Value Format

Stored as a `number`. Returns `null` when empty.

### Example

```yaml
- handle: price
  field:
    type: number
    display: Price
    required: true
    default: 0
    validate:
      - required
      - numeric_range:0,10000
    options:
      min: 0
      max: 10000
      step: 0.01
```

---

## Toggle

A boolean on/off switch rendered as a sliding toggle button. Includes ARIA `role="switch"` and keyboard accessibility.

### Configuration Options

No type-specific options. Inherits common properties. Typically configured with a `default` value.

### Supported Validation

`required`

### Value Format

Stored as a `boolean` (`true` or `false`).

### Example

```yaml
- handle: featured
  field:
    type: toggle
    display: Featured Article
    default: false

- handle: published
  field:
    type: toggle
    display: Published
    default: true
```

---

## Select

A dropdown selector for choosing a single value from a predefined list of options.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `options` | `string[]` | `[]` | Array of selectable option values |
| `choices` | `string[]` | `[]` | Alias for `options` |

Both `options` and `choices` keys are supported — use whichever reads better in context.

### Supported Validation

`required`

### Value Format

Stored as a `string` (the selected option value). Empty string when no selection.

### Example

```yaml
- handle: status
  field:
    type: select
    display: Status
    required: true
    default: draft
    validate:
      - required
    options:
      options:
        - draft
        - published
        - archived
```

---

## Multiselect

A checkbox-based selector for choosing multiple values from a predefined list.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `options` | `string[]` | `[]` | Array of selectable option values |
| `choices` | `string[]` | `[]` | Alias for `options` |

### Supported Validation

`required`

### Value Format

Stored as an array of `string` values (selected option values). Empty array when no selections.

### Example

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
        - nodejs
```

---

## Date

A date picker using the browser's native date input.

### Configuration Options

No type-specific options. Inherits common properties.

### Supported Validation

`required`

### Value Format

Stored as a `string` in `YYYY-MM-DD` format.

### Example

```yaml
- handle: published_at
  field:
    type: date
    display: Publish Date
    required: true
    validate:
      - required
```

---

## Asset

A file picker that integrates with the Asset Manager. Supports single or multiple file selection, drag-and-drop upload, and the asset browser modal for file selection.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `max_files` | `number` | `0` | Maximum number of files. `1` = single file, `0` = unlimited |

### Behaviour by `max_files` Value

| Value | Behaviour | Stored Format |
|-------|-----------|---------------|
| `1` | Single file selection with replace button | `string` (file path) |
| `> 1` | Multiple files up to limit, shows counter | `string[]` (array of paths) |
| `0` (or omitted) | Unlimited file selection | `string[]` (array of paths) |

### Supported Validation

`required`

### Value Format

Single: stored as a `string` path (e.g. `/assets/images/hero.jpg`).
Multiple: stored as a `string[]` array of paths.

### Example

```yaml
# Single image
- handle: featured_image
  field:
    type: asset
    display: Featured Image
    required: true
    options:
      max_files: 1

# Multiple images (up to 5)
- handle: gallery
  field:
    type: asset
    display: Photo Gallery
    options:
      max_files: 5

# Unlimited attachments
- handle: attachments
  field:
    type: asset
    display: Attachments
```

---

## Entries

A relationship field for referencing other collection entries by slug. Stores cross-references between entries.

### Configuration Options

No type-specific options currently. A visual relationship picker is planned — the current implementation accepts comma-separated slugs.

### Supported Validation

`required`

### Value Format

Stored as an array of `string` slugs referencing other entries.

### Example

```yaml
- handle: related_posts
  field:
    type: entries
    display: Related Posts

- handle: author
  field:
    type: entries
    display: Author
    required: true
```

---

## Taxonomy

A field for assigning taxonomy terms to an entry. Connects entries to taxonomy term hierarchies.

### Configuration Options

No type-specific options currently. A visual term picker is planned — the current implementation accepts comma-separated term slugs.

### Supported Validation

`required`

### Value Format

Stored as an array of `string` term slugs.

### Example

```yaml
- handle: categories
  field:
    type: taxonomy
    display: Categories
    required: true
    validate:
      - required
```

---

## Replicator

A flexible, repeatable block builder for composing structured page content. Each block is backed by a fieldset definition, enabling editors to build complex layouts from a library of block types.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sets` | `string[]` | `[]` | Array of fieldset handles available as block types |

Fieldsets are defined at `resources/fieldsets/{handle}.yaml`. See the [Fieldsets](/docs/fieldsets) documentation for details.

### Features

- Add blocks from configured fieldset types
- Collapse and expand individual blocks
- Preview summary showing block type and primary text field
- Reorder blocks via up/down buttons (keyboard-accessible)
- Drag handle for mouse-based reordering
- Duplicate and delete individual blocks
- Supports nesting (replicator within replicator) up to 3 levels
- Default values from fieldset field definitions are pre-populated

### Supported Validation

`required`

### Value Format

Stored as an array of objects. Each object includes a `_type` field identifying the fieldset, plus all field handle values:

```yaml
blocks:
  - _type: hero
    title: Welcome to Madori
    subtitle: A flat-file CMS for Next.js
  - _type: features_grid
    heading: Features
    columns: 3
```

### Example

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
        - rich_text
```

---

## Grid

A structured repeatable field where every row shares the same field structure. Unlike Replicator (which supports multiple block types), Grid is designed for tabular data where each row has identical columns.

### Configuration Options

The Grid field currently accepts JSON array data directly. A visual row editor with drag-and-drop reordering is planned.

### Supported Validation

`required`

### Value Format

Stored as an array of objects (JSON). Each object represents a row with consistent keys:

```yaml
pricing_tiers:
  - name: Starter
    price: 9
    features: "5 projects, 1GB storage"
  - name: Pro
    price: 29
    features: "Unlimited projects, 10GB storage"
```

### Example

```yaml
- handle: pricing_tiers
  field:
    type: grid
    display: Pricing Tiers
    required: true
```

---

## YAML

A raw YAML editor rendered as a monospace textarea. Allows developers to enter arbitrary structured data that doesn't fit other field types.

### Configuration Options

No type-specific options. Inherits common properties.

### Supported Validation

`required`

Note: YAML syntax validation is not currently enforced — editors are responsible for valid YAML.

### Value Format

Stored as a `string` containing raw YAML content. Parsed at read-time by consuming applications.

### Example

```yaml
- handle: metadata
  field:
    type: yaml
    display: Custom Metadata
    default: "key: value"
```

---

## Code

A code editor rendered as a monospace textarea with spell-check disabled. Designed for entering code snippets, embed codes, or structured text that should not be spell-checked.

### Configuration Options

No type-specific options. Inherits common properties.

### Supported Validation

`required`, `min`, `max`, `regex`, `url`, `email`

### Value Format

Stored as a `string` containing the raw code content.

### Example

```yaml
- handle: snippet
  field:
    type: code
    display: Code Snippet
    validate:
      - max:5000
```

---

## Hidden

A hidden field that is not displayed in the Control Panel interface. Used for internal metadata, computed values, or system-managed data that editors should not modify directly.

### Configuration Options

No type-specific options. Typically used with a `default` value.

### Supported Validation

None. Hidden fields are not validated since editors cannot interact with them.

### Value Format

Stored as any type (`unknown`). Commonly a `string`.

### Example

```yaml
- handle: internal_id
  field:
    type: hidden
    default: auto-generated

- handle: schema_version
  field:
    type: hidden
    default: "1.0"
```

---

## Common Patterns

### Combining Validation Rules

Multiple validation rules can be applied to a single field:

```yaml
- handle: email
  field:
    type: text
    display: Email Address
    required: true
    validate:
      - required
      - email
      - max:254
```

### Conditional Fields with Visibility

Show a field only when another field has a specific value:

```yaml
- handle: has_cta
  field:
    type: toggle
    display: Show Call to Action
    default: false

- handle: cta_text
  field:
    type: text
    display: CTA Button Text
    visibility:
      field: has_cta
      operator: equals
      value: true

- handle: cta_url
  field:
    type: text
    display: CTA Link URL
    validate:
      - url
    visibility:
      field: has_cta
      operator: equals
      value: true
```

### SEO Fields Group

A common pattern for page-level SEO metadata:

```yaml
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

### Blog Post Blueprint

A complete example combining multiple field types:

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
          validate:
            - required
            - max:120
      - handle: slug
        field:
          type: slug
          required: true
      - handle: published_at
        field:
          type: date
          display: Publish Date
          required: true
      - handle: featured_image
        field:
          type: asset
          display: Featured Image
          options:
            max_files: 1
      - handle: body
        field:
          type: tiptap
          display: Body
          required: true
      - handle: categories
        field:
          type: taxonomy
          display: Categories
      - handle: featured
        field:
          type: toggle
          display: Featured
          default: false
  seo:
    display: SEO
    fields:
      - handle: meta_title
        field:
          type: text
          display: Meta Title
          validate:
            - max:60
      - handle: meta_description
        field:
          type: text
          display: Meta Description
          validate:
            - max:160
```

### Field Type Quick Reference

| Type | Stores | Best For |
|------|--------|----------|
| `text` | `string` | Titles, names, short text |
| `slug` | `string` | URL identifiers |
| `markdown` | `string` | Long-form plain Markdown |
| `tiptap` | `object` (JSON) | Rich text with formatting |
| `number` | `number` | Prices, counts, measurements |
| `toggle` | `boolean` | On/off flags |
| `select` | `string` | Single choice from options |
| `multiselect` | `string[]` | Multiple choices from options |
| `date` | `string` (YYYY-MM-DD) | Dates |
| `asset` | `string` or `string[]` | Files and images |
| `entries` | `string[]` | Cross-references to entries |
| `taxonomy` | `string[]` | Term assignments |
| `replicator` | `object[]` | Flexible page blocks |
| `grid` | `object[]` | Tabular repeatable data |
| `yaml` | `string` | Arbitrary structured data |
| `code` | `string` | Code snippets, embeds |
| `hidden` | `any` | Internal metadata |
