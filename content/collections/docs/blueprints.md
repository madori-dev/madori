---
title: Blueprints
slug: blueprints
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-06-07T09:00:00.000Z
---

# Blueprints

Blueprints define the content schema for your entries, globals, taxonomies, and forms. They describe which fields appear in the Control Panel, how those fields are organised into tabs and sections, and what validation and visibility rules apply.

A blueprint is a YAML file that maps directly to the editing experience — every tab, section, and field you configure becomes a real interface element in the Control Panel.

---

## Configuration Reference

### File Location

Blueprints live at `resources/blueprints/{type}/{handle}.yaml` where `{type}` is one of:

| Type | Path | Used By |
|------|------|---------|
| `collections` | `resources/blueprints/collections/{handle}.yaml` | Collection entries |
| `globals` | `resources/blueprints/globals/{handle}.yaml` | Global data sets |
| `taxonomies` | `resources/blueprints/taxonomies/{handle}.yaml` | Taxonomy terms |
| `forms` | `resources/blueprints/forms/{handle}.yaml` | Form definitions |

### Top-Level Structure

A blueprint consists of named **tabs**, each containing **fields** and optional **sections**:

```yaml
tabs:
  <tab_handle>:
    display: <Tab Label>
    fields:
      - handle: <field_handle>
        field:
          type: <field_type>
          # ...field config
    sections:
      <section_handle>:
        display: <Section Label>
        fields:
          - handle: <field_handle>
            field:
              type: <field_type>
```

---

## Tabs

Tabs divide the editing interface into logical groups. Each tab renders as a clickable tab in the Control Panel. The tab handle is used internally; the `display` value is shown to editors.

```yaml
tabs:
  content:
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

  metadata:
    display: Metadata
    fields:
      - handle: published_at
        field:
          type: date
          display: Publish Date

      - handle: status
        field:
          type: select
          display: Status
          options:
            options:
              - draft
              - published
              - archived
```

Tabs render in the order they appear in the YAML. Place the most-used fields in the first tab so editors land on them by default.

---

## Sections

Sections provide visual grouping within a tab. They render as labelled groups with a heading, useful when a single tab contains many fields that benefit from logical separation.

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
          display: URL Slug
          required: true

    sections:
      seo:
        display: SEO Settings
        fields:
          - handle: meta_title
            field:
              type: text
              display: Meta Title
              validate:
                - max:60
              options:
                placeholder: Override the page title for search engines

          - handle: meta_description
            field:
              type: text
              display: Meta Description
              validate:
                - max:160
              options:
                placeholder: Brief description for search results

      social:
        display: Social Sharing
        fields:
          - handle: og_image
            field:
              type: asset
              display: Social Image
              options:
                max_files: 1

          - handle: og_description
            field:
              type: text
              display: Social Description
              validate:
                - max:200
```

Fields defined directly under the tab appear first, followed by sections in definition order.

---

## Field Configuration

Each field in a blueprint is defined with a `handle` (the storage key) and a `field` object containing its configuration.

### Field Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | `string` | Yes | One of the 18 field type identifiers |
| `display` | `string` | No | Label shown in the CP. Auto-generated from handle if omitted |
| `required` | `boolean` | No | Whether the field must have a value. Default: `false` |
| `default` | `any` | No | Default value pre-populated on create forms |
| `validate` | `string[]` | No | Array of validation rule strings |
| `options` | `object` | No | Type-specific configuration options |
| `visibility` | `object` | No | Conditional display rules |

### Field Handle

The `handle` becomes the key in your content files. Use snake_case for handles:

```yaml
- handle: featured_image    # stored as featured_image in content YAML
  field:
    type: asset
    display: Featured Image  # shown to editors in the CP
```

### Default Values

Set default values to pre-populate fields when creating new entries:

```yaml
- handle: status
  field:
    type: select
    display: Status
    default: draft
    options:
      options:
        - draft
        - published

- handle: featured
  field:
    type: toggle
    display: Featured
    default: false

- handle: author_name
  field:
    type: text
    display: Author
    default: Editorial Team
```

Default values appear in create forms only. Edit forms show the persisted entry data.

### Help Text

Add instructions below a field using the `instructions` property within options:

```yaml
- handle: slug
  field:
    type: slug
    display: URL Slug
    required: true
    options:
      placeholder: e.g. my-page-title
```

### The 18 Field Types

Madori supports these built-in field types:

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
| `replicator` | `object[]` | Flexible page blocks (explicit sets) |
| `blocks` | `object[]` | Page blocks (auto-discovers `is_block` fieldsets) |
| `grid` | `object[]` | Tabular repeatable data |
| `yaml` | `string` | Arbitrary structured data |
| `code` | `string` | Code snippets, embeds |
| `hidden` | `any` | Internal metadata |

See [Field Types](/docs/field-types) for detailed configuration options per type.

---

## Visibility Conditions

Visibility conditions show or hide fields based on another field's current value. When a field is hidden, its value is excluded from the submission payload.

### Configuration

```yaml
- handle: field_handle
  field:
    type: text
    visibility:
      field: <other_field_handle>
      operator: <operator>
      value: <comparison_value>
```

### Operators

| Operator | Description | Value Required |
|----------|-------------|----------------|
| `equals` | Field value exactly matches the comparison value | Yes |
| `not_equals` | Field value does not match the comparison value | Yes |
| `contains` | Field value (string) contains the comparison value as a substring | Yes |
| `empty` | Field value is undefined, null, or empty string | No |
| `not_empty` | Field value is defined and not empty | No |

### Examples

**Show a field when a toggle is enabled:**

```yaml
- handle: show_cta
  field:
    type: toggle
    display: Show Call to Action
    default: false

- handle: cta_text
  field:
    type: text
    display: CTA Button Text
    visibility:
      field: show_cta
      operator: equals
      value: true

- handle: cta_url
  field:
    type: text
    display: CTA Link URL
    validate:
      - url
    visibility:
      field: show_cta
      operator: equals
      value: true
```

**Show a field based on a select value:**

```yaml
- handle: link_type
  field:
    type: select
    display: Link Type
    default: internal
    options:
      options:
        - internal
        - external

- handle: external_url
  field:
    type: text
    display: External URL
    validate:
      - url
    visibility:
      field: link_type
      operator: equals
      value: external

- handle: entry_reference
  field:
    type: entries
    display: Linked Entry
    visibility:
      field: link_type
      operator: equals
      value: internal
```

**Show a field only when another field has content:**

```yaml
- handle: subtitle
  field:
    type: text
    display: Subtitle

- handle: subtitle_style
  field:
    type: select
    display: Subtitle Style
    options:
      options:
        - normal
        - italic
        - highlighted
    visibility:
      field: subtitle
      operator: not_empty
```

### Payload Behaviour

When a visibility condition evaluates to `false`:

1. The field is hidden from the editor in the Control Panel
2. The field's value is **excluded** from the submission payload
3. Validation rules on the hidden field are not enforced

When a visibility condition evaluates to `true` (or when no condition is set):

1. The field is displayed normally
2. The field's value is **included** in the submission payload
3. All validation rules are enforced

---

## Validation Rules

Validation rules enforce data constraints on field values. Rules are checked on both client-side (as the editor types) and server-side (on form submission). Invalid data returns structured field-level errors adjacent to the offending field.

### Configuration

Validation rules are defined as an array of strings in the `validate` property:

```yaml
- handle: email
  field:
    type: text
    display: Email Address
    validate:
      - required
      - email
      - max:254
```

### Available Rules

| Rule | Syntax | Description |
|------|--------|-------------|
| `required` | `required` | Field must have a non-empty value |
| `min` | `min:<n>` | Minimum character length (text types) or minimum value (number) |
| `max` | `max:<n>` | Maximum character length (text types) or maximum value (number) |
| `regex` | `regex:<pattern>` | Value must match the regular expression pattern |
| `url` | `url` | Value must be a valid URL |
| `email` | `email` | Value must be a valid email address |
| `numeric_range` | `numeric_range:<min>,<max>` | Number must be within the specified range |

### Rule Compatibility

Not all rules apply to all field types. Incompatible rules are silently ignored with a console warning.

| Rule | Compatible Field Types |
|------|----------------------|
| `required` | All types |
| `min`, `max` | text, slug, markdown, tiptap, code, number |
| `regex`, `url`, `email` | text, slug, markdown, tiptap, code |
| `numeric_range` | number |

### Validation Error Messages

Each rule produces a specific error message:

| Rule | Error Message |
|------|--------------|
| `required` | "This field is required" |
| `min:<n>` (text) | "Must be at least {n} characters" |
| `max:<n>` (text) | "Must be at most {n} characters" |
| `min:<n>` (number) | "Must be at least {n}" |
| `max:<n>` (number) | "Must be at most {n}" |
| `regex:<pattern>` | "Must match pattern {pattern}" |
| `url` | "Must be a valid URL" |
| `email` | "Must be a valid email address" |
| `numeric_range:<min>,<max>` | "Must be at least {min}" / "Must be at most {max}" |

### Required vs. Validate

The `required` field property and the `required` validation rule both enforce non-empty values. You can use either:

```yaml
# Using the field property
- handle: title
  field:
    type: text
    required: true

# Using the validation rule
- handle: title
  field:
    type: text
    validate:
      - required
```

Both approaches produce the same result. Using `required: true` is the simpler convention for most fields.

---

## Usage Examples

### Blog Post Blueprint

A typical blog post with content, metadata, and SEO fields organised into tabs:

```yaml
tabs:
  content:
    display: Content
    fields:
      - handle: title
        field:
          type: text
          display: Title
          required: true
          validate:
            - required
            - min:3
            - max:120

      - handle: slug
        field:
          type: slug
          display: URL Slug
          required: true
          validate:
            - required
            - regex:^[a-z0-9-]+$

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

  sidebar:
    display: Sidebar
    fields:
      - handle: status
        field:
          type: select
          display: Status
          required: true
          default: draft
          options:
            options:
              - draft
              - published
              - archived

      - handle: published_at
        field:
          type: date
          display: Publish Date

      - handle: featured
        field:
          type: toggle
          display: Featured
          default: false

      - handle: author
        field:
          type: entries
          display: Author

    sections:
      seo:
        display: SEO
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
```

### Page Builder Blueprint

A flexible page blueprint using Replicator blocks for composing layouts:

```yaml
tabs:
  main:
    display: Page
    fields:
      - handle: title
        field:
          type: text
          display: Title
          required: true

      - handle: slug
        field:
          type: slug
          display: URL Slug
          required: true

      - handle: blocks
        field:
          type: replicator
          display: Page Blocks
          options:
            sets:
              - hero
              - features_grid
              - rich_text
              - basic_cta
              - testimonials

  settings:
    display: Settings
    fields:
      - handle: template
        field:
          type: select
          display: Page Template
          default: default
          options:
            options:
              - default
              - full-width
              - sidebar

      - handle: show_navigation
        field:
          type: toggle
          display: Show Navigation
          default: true

      - handle: custom_css
        field:
          type: code
          display: Custom CSS
          visibility:
            field: template
            operator: equals
            value: full-width
```

### Product Blueprint with Conditional Fields

A product schema that reveals different fields based on the product type:

```yaml
tabs:
  details:
    display: Product Details
    fields:
      - handle: name
        field:
          type: text
          display: Product Name
          required: true
          validate:
            - required
            - max:200

      - handle: slug
        field:
          type: slug
          required: true

      - handle: product_type
        field:
          type: select
          display: Product Type
          required: true
          default: physical
          options:
            options:
              - physical
              - digital
              - subscription

      - handle: price
        field:
          type: number
          display: Price
          required: true
          validate:
            - required
            - numeric_range:0,999999
          options:
            min: 0
            step: 0.01

      - handle: weight
        field:
          type: number
          display: Weight (kg)
          visibility:
            field: product_type
            operator: equals
            value: physical
          options:
            min: 0
            step: 0.1

      - handle: download_url
        field:
          type: text
          display: Download URL
          validate:
            - url
          visibility:
            field: product_type
            operator: equals
            value: digital

      - handle: billing_interval
        field:
          type: select
          display: Billing Interval
          default: monthly
          options:
            options:
              - monthly
              - yearly
          visibility:
            field: product_type
            operator: equals
            value: subscription

      - handle: description
        field:
          type: tiptap
          display: Description

      - handle: images
        field:
          type: asset
          display: Product Images
          options:
            max_files: 10
```

### Form Blueprint

A contact form with honeypot protection:

```yaml
tabs:
  fields:
    display: Form Fields
    fields:
      - handle: name
        field:
          type: text
          display: Full Name
          required: true
          validate:
            - required
            - min:2
            - max:100

      - handle: email
        field:
          type: text
          display: Email Address
          required: true
          validate:
            - required
            - email

      - handle: subject
        field:
          type: select
          display: Subject
          required: true
          options:
            options:
              - General Inquiry
              - Support
              - Feedback
              - Partnership

      - handle: message
        field:
          type: markdown
          display: Message
          required: true
          validate:
            - required
            - min:10
            - max:5000

      - handle: website
        field:
          type: hidden
```

---

## Common Patterns

### Tab Organisation Strategy

Organise tabs by editing frequency. Primary content goes in the first tab. Secondary concerns (SEO, settings, advanced options) go in subsequent tabs:

```yaml
tabs:
  content:     # Main content (title, body, media)
  sidebar:     # Status, dates, taxonomy
  seo:         # Meta titles and descriptions
  advanced:    # Developer-facing options
```

### Reusable SEO Section

Add consistent SEO fields across blueprints by defining a section:

```yaml
sections:
  seo:
    display: SEO
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

Or use [Fieldsets](/docs/fieldsets) to share field groups across blueprints.

### Progressive Disclosure with Visibility

Use toggles to reveal advanced options, keeping the default editing experience clean:

```yaml
- handle: show_advanced
  field:
    type: toggle
    display: Show Advanced Options
    default: false

- handle: custom_class
  field:
    type: text
    display: CSS Class
    visibility:
      field: show_advanced
      operator: equals
      value: true

- handle: custom_id
  field:
    type: text
    display: HTML ID
    visibility:
      field: show_advanced
      operator: equals
      value: true
```

### Combining Required + Custom Validation

Layer validation rules for thorough input checking:

```yaml
- handle: website
  field:
    type: text
    display: Website URL
    required: true
    validate:
      - required
      - url
      - max:500

- handle: phone
  field:
    type: text
    display: Phone Number
    validate:
      - regex:^\+?[\d\s\-()]+$
      - min:7
      - max:20
```

### Status and Publishing Workflow

A common pattern for collection entries with a publish workflow:

```yaml
- handle: status
  field:
    type: select
    display: Status
    required: true
    default: draft
    options:
      options:
        - draft
        - review
        - published
        - archived

- handle: published_at
  field:
    type: date
    display: Publish Date
    visibility:
      field: status
      operator: equals
      value: published

- handle: archived_reason
  field:
    type: text
    display: Archive Reason
    visibility:
      field: status
      operator: equals
      value: archived
```

---

## Managing Blueprints

### Control Panel

Navigate to **Blueprints** in the CP sidebar to manage blueprints visually:

- Create new blueprints for any entity type
- Add, remove, and reorder fields with drag-and-drop
- Configure field options, validation, and visibility
- Add and organise tabs

### API

```
GET    /api/blueprints/{type}           # List all blueprints of a type
GET    /api/blueprints/{type}/{handle}  # Get a specific blueprint
PUT    /api/blueprints/{type}/{handle}  # Create or update a blueprint
DELETE /api/blueprints/{type}/{handle}  # Delete a blueprint
```

### File-Based Management

Edit blueprint YAML files directly for version control and collaboration:

```bash
resources/blueprints/
├── collections/
│   ├── blog.yaml
│   ├── pages.yaml
│   └── products.yaml
├── globals/
│   └── site-settings.yaml
├── taxonomies/
│   └── categories.yaml
└── forms/
    └── contact.yaml
```

Changes to blueprint files are reflected immediately in the Control Panel on the next page load.
