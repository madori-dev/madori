---
title: Globals
slug: globals
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Globals

Globals are site-wide data sets that exist outside of collections. Use them for content that applies across the entire site — site settings, footer content, social media links, company information, or any data that isn't tied to a specific collection entry.

Unlike collection entries (which have multiple instances), each global has exactly one instance. Editors access globals directly from the Control Panel sidebar.

---

## Configuration Reference

### Global Definition

Global definitions live at `resources/globals/{handle}.yaml`. The definition tells Madori which blueprint provides the editing fields.

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `title` | `string` | Yes | — | Display name shown in the Control Panel sidebar |
| `blueprint` | `string` | Yes | — | Handle of the blueprint that defines the field schema |

**Example definition:**

```yaml
# resources/globals/site-settings.yaml
title: Site Settings
blueprint: site-settings
```

### Global Blueprint

Global blueprints follow the same structure as collection blueprints and live at `resources/blueprints/globals/{handle}.yaml`:

```yaml
# resources/blueprints/globals/site-settings.yaml
tabs:
  main:
    display: General
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

All [field types](/docs/field-types) and [validation rules](/docs/blueprints#validation-rules) are supported in global blueprints.

### Data Storage

Global data is stored as YAML at `content/globals/{handle}.yaml`:

```yaml
# content/globals/site-settings.yaml
site_name: My Awesome Site
tagline: Built with Madori
logo: /assets/logo.svg
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/globals` | List all globals |
| GET | `/api/globals/{handle}` | Get a global's data |
| PUT | `/api/globals/{handle}` | Update a global's data |

### File Structure

```
resources/
├── globals/
│   ├── site-settings.yaml     # Definition
│   └── footer.yaml            # Definition
├── blueprints/globals/
│   ├── site-settings.yaml     # Blueprint (fields)
│   └── footer.yaml            # Blueprint (fields)
content/
└── globals/
    ├── site-settings.yaml     # Data
    └── footer.yaml            # Data
```

---

## Usage Examples

### Creating a Global

**Step 1:** Create the definition:

```yaml
# resources/globals/site-settings.yaml
title: Site Settings
blueprint: site-settings
```

**Step 2:** Create the blueprint:

```yaml
# resources/blueprints/globals/site-settings.yaml
tabs:
  general:
    display: General
    fields:
      - handle: site_name
        field:
          type: text
          display: Site Name
          required: true
          validate:
            - required
            - max:100

      - handle: tagline
        field:
          type: text
          display: Tagline
          validate:
            - max:200

      - handle: logo
        field:
          type: asset
          display: Logo
          options:
            max_files: 1

  social:
    display: Social Links
    fields:
      - handle: twitter_url
        field:
          type: text
          display: Twitter/X URL
          validate:
            - url

      - handle: github_url
        field:
          type: text
          display: GitHub URL
          validate:
            - url
```

**Step 3:** Edit in the Control Panel by navigating to **Globals → Site Settings**.

### Querying via GraphQL

```graphql
{
  global(handle: "site-settings") {
    data
  }
}
```

The `data` field returns the raw YAML content as a JSON object.

### Querying via REST API

```bash
# Get all globals
curl http://localhost:3000/api/globals

# Get specific global
curl http://localhost:3000/api/globals/site-settings

# Update a global
curl -X PUT http://localhost:3000/api/globals/site-settings \
  -H "Content-Type: application/json" \
  -d '{"site_name": "Updated Name", "tagline": "New tagline"}'
```

### Using Global Data in Next.js

```tsx
async function getSiteSettings() {
  const res = await fetch(`${process.env.SITE_URL}/api/globals/site-settings`)
  const json = await res.json()
  return json.data
}

export default async function Layout({ children }) {
  const settings = await getSiteSettings()

  return (
    <html>
      <head>
        <title>{settings.site_name}</title>
      </head>
      <body>
        <header>
          {settings.logo && <img src={settings.logo} alt={settings.site_name} />}
          <h1>{settings.site_name}</h1>
          <p>{settings.tagline}</p>
        </header>
        {children}
      </body>
    </html>
  )
}
```

---

## Common Patterns

### Site Settings Global

The most common global — contains site-wide metadata:

```yaml
# resources/blueprints/globals/site-settings.yaml
tabs:
  general:
    display: General
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

      - handle: favicon
        field:
          type: asset
          display: Favicon
          options:
            max_files: 1
```

### Footer Content Global

Editable footer content without touching templates:

```yaml
# resources/blueprints/globals/footer.yaml
tabs:
  main:
    display: Footer
    fields:
      - handle: copyright_text
        field:
          type: text
          display: Copyright Text
          default: "© 2026 My Company"

      - handle: footer_links
        field:
          type: replicator
          display: Footer Links
          options:
            sets:
              - footer_link

      - handle: show_newsletter
        field:
          type: toggle
          display: Show Newsletter Signup
          default: true
```

### Social Media Links

Centralise social links for use in headers, footers, and metadata:

```yaml
# resources/blueprints/globals/social.yaml
tabs:
  main:
    display: Social Profiles
    fields:
      - handle: twitter
        field:
          type: text
          display: Twitter/X
          validate:
            - url

      - handle: github
        field:
          type: text
          display: GitHub
          validate:
            - url

      - handle: linkedin
        field:
          type: text
          display: LinkedIn
          validate:
            - url

      - handle: youtube
        field:
          type: text
          display: YouTube
          validate:
            - url
```

### Multiple Globals for Separation of Concerns

Split site configuration into logical groups rather than one large global:

```
resources/globals/
├── site-settings.yaml   # Core site identity
├── footer.yaml          # Footer-specific content
├── social.yaml          # Social media links
├── seo-defaults.yaml    # Default meta tags
└── analytics.yaml       # Tracking configuration
```

Each appears as a separate item in the Control Panel sidebar, making it easy for editors to find what they need.

