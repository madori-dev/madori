---
title: Assets
slug: assets
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Assets

Madori includes a full asset management system for uploading, organising, and browsing files. Assets are stored on the filesystem and served directly by Next.js — no external storage service required. The Asset Manager provides a visual interface in the Control Panel and a REST API for programmatic access.

The system supports any file type: images, documents, videos, audio, fonts, and archives. Images get thumbnail previews; other files display type-appropriate icons.

---

## Configuration Reference

### Storage Configuration

Asset storage is configured in `madori.config.ts`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `assetsPath` | `string` | `./public/assets` | Directory where uploaded assets are stored |

```ts
// madori.config.ts
const config: MadoriConfigInput = {
  assetsPath: './public/assets',
}
```

Since assets live in the `public/` directory, they're served directly by Next.js at `/assets/...` URLs.

### Asset Field Configuration

Use the `asset` field type in blueprints to let editors pick files:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `max_files` | `number` | `0` (unlimited) | Maximum number of files. `1` = single file mode |

```yaml
- handle: hero_image
  field:
    type: asset
    display: Hero Image
    options:
      max_files: 1
```

### Asset Metadata Storage

Metadata is stored alongside files as `.meta.yaml`:

```yaml
# public/assets/images/hero.jpg.meta.yaml
alt: "Homepage hero banner"
uploaded_at: "2026-01-15T10:30:00.000Z"
```

| Property | Type | Description |
|----------|------|-------------|
| `alt` | `string` | Alt text for accessibility |
| `uploaded_at` | `string` | ISO 8601 upload timestamp |

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/assets` | List assets (optional `?directory=` param) |
| POST | `/api/assets/upload` | Upload a single file (`file` field) |
| POST | `/api/assets/upload-multiple` | Upload multiple files (`files` field) |
| PATCH | `/api/assets/{path}` | Update asset metadata (alt text, filename) |
| DELETE | `/api/assets/{path}` | Delete a single file |
| POST | `/api/assets/move` | Move/rename a file |
| POST | `/api/assets/bulk-move` | Move multiple files to a folder |
| POST | `/api/assets/bulk-delete` | Delete multiple files |
| POST | `/api/assets/directories` | Create a directory |
| POST | `/api/assets/directories/delete` | Delete a directory |
| POST | `/api/assets/directories/rename` | Rename a directory |

### Display Modes

Assets are displayed based on their MIME type:

| MIME Type Pattern | Display Mode | Visual |
|-------------------|--------------|--------|
| `image/*` | Thumbnail | Image preview |
| `application/pdf` | Icon | Document icon |
| `video/*` | Icon | Video icon |
| `audio/*` | Icon | Music icon |
| `application/zip` | Icon | Archive icon |
| Other | Icon | Generic file icon |

---

## Usage Examples

### Uploading Files via the Control Panel

1. Navigate to **Assets** in the CP sidebar
2. Drag and drop files onto the page, or click **Upload** and select files
3. Multiple files can be uploaded simultaneously — each shows individual progress
4. Uploaded files appear in the grid immediately upon completion

### Creating Folders

1. In the Asset Manager, click **Create Folder**
2. Enter a folder name (e.g. "Blog Images")
3. Navigate into the folder by clicking it
4. Use the breadcrumb trail to go back to parent folders

### Editing Asset Metadata

1. Click any asset in the grid to open its detail panel
2. Edit the **Alt text** field (important for image accessibility)
3. Edit the **Filename** if needed
4. Changes persist immediately without page reload

### Using Asset Fields in Blueprints

**Single image:**

```yaml
- handle: featured_image
  field:
    type: asset
    display: Featured Image
    required: true
    options:
      max_files: 1
```

**Multiple images (gallery):**

```yaml
- handle: gallery
  field:
    type: asset
    display: Photo Gallery
    options:
      max_files: 10
```

**Unlimited attachments:**

```yaml
- handle: attachments
  field:
    type: asset
    display: Attachments
```

### Programmatic Upload

```ts
const formData = new FormData()
formData.append('file', fileBlob, 'photo.jpg')

const response = await fetch('/api/assets/upload', {
  method: 'POST',
  body: formData,
})

const { data } = await response.json()
// data.path = "/assets/photo.jpg"
```

### Updating Metadata via API

```ts
await fetch('/api/assets/images/hero.jpg', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    alt: 'Updated alt text for hero image',
  }),
})
```

### Bulk Operations

Select multiple assets in the Control Panel (Shift/Cmd-click), then:

- **Move** — choose a destination folder and move all selected files
- **Delete** — confirm once to delete all selected files

Via API:

```ts
// Bulk move
await fetch('/api/assets/bulk-move', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    paths: ['/assets/photo1.jpg', '/assets/photo2.jpg'],
    destination: '/assets/archive/',
  }),
})

// Bulk delete
await fetch('/api/assets/bulk-delete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    paths: ['/assets/old-file.pdf', '/assets/unused.png'],
  }),
})
```

---

## Common Patterns

### Folder Organisation Strategy

Organise assets by purpose or content type:

```
public/assets/
├── blog/           # Blog post images
├── pages/          # Page-specific assets
├── branding/       # Logos, favicons, brand assets
├── downloads/      # Downloadable documents
└── uploads/        # User-uploaded content
```

Or organise by date for high-volume sites:

```
public/assets/
├── 2026/
│   ├── 01/
│   ├── 02/
│   └── 03/
```

### Image Optimisation

Upload images at the dimensions you need. For responsive images, consider uploading multiple sizes:

```
public/assets/hero/
├── hero-1920.jpg    # Desktop
├── hero-1024.jpg    # Tablet
└── hero-640.jpg     # Mobile
```

Use Next.js Image component with the asset paths:

```tsx
import Image from 'next/image'

<Image src="/assets/hero/hero-1920.jpg" alt="Hero banner" width={1920} height={1080} />
```

### Asset Picker in Forms

When an editor uses an asset field, the picker modal allows:

- Browsing existing folders
- Searching by filename
- Uploading a new file directly into the picker
- Selecting and confirming the choice

The selected asset path is stored in the entry data.

### Alt Text Best Practices

Always add alt text to images for accessibility:

- Describe what the image shows, not what it is ("Team meeting in conference room" not "photo.jpg")
- Keep it concise — aim for under 125 characters
- Use empty alt text for purely decorative images
- Include relevant details that aren't available in surrounding text

### Backing Up Assets

Since assets live on the filesystem, back them up alongside your content:

```bash
# Rsync to backup location
rsync -avz public/assets/ /backups/assets/

# Or include in Git (for smaller sites)
git add public/assets/
git commit -m "Add new blog images"
```

For large sites with many assets, consider excluding them from Git and using a separate backup strategy.

### Referencing Assets in Templates

Assets are served at their filesystem path relative to `public/`:

```tsx
// File at public/assets/logo.svg → accessible at /assets/logo.svg
<img src="/assets/logo.svg" alt="Site logo" />

// File at public/assets/blog/post-image.jpg → accessible at /assets/blog/post-image.jpg
<img src="/assets/blog/post-image.jpg" alt="Blog illustration" />
```

