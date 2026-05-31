---
title: Assets
slug: docs/assets
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Assets

MADORI includes a full asset management system for uploading, organizing, and browsing files.

## Storage

Assets are stored in `public/assets/` by default (configurable via `assetsPath` in `madori.config.ts`). Since they're in the `public/` directory, they're served directly by Next.js at `/assets/...`.

## Asset Manager

The Control Panel includes a full asset browser at **Assets** in the sidebar:

- **Upload** — Drag and drop or click to upload
- **Folders** — Create, rename, and delete directories
- **Browse** — Grid view with image thumbnails
- **Multi-select** — Shift/Cmd-click to select multiple files
- **Bulk operations** — Move or delete multiple files at once
- **Context menus** — Right-click for quick actions

## Asset Fields

Use the `asset` field type in blueprints to let editors pick files:

```yaml
- handle: hero_image
  field:
    type: asset
    display: Hero Image
    options:
      max_files: 1
```

The field renders an asset picker that supports:
- Clicking to open the full asset browser modal
- Drag and drop to upload directly into the field
- Image preview for selected files
- Replace and remove actions

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/assets` | List assets (optional `?directory=` param) |
| POST | `/api/assets/upload` | Upload a single file (`file` field) |
| POST | `/api/assets/upload-multiple` | Upload multiple files (`files` field) |
| POST | `/api/assets/move` | Move/rename a file |
| POST | `/api/assets/bulk-move` | Move multiple files |
| POST | `/api/assets/bulk-delete` | Delete multiple files |
| DELETE | `/api/assets/{path}` | Delete a single file |
| POST | `/api/assets/directories` | Create a directory |
| POST | `/api/assets/directories/delete` | Delete a directory |
| POST | `/api/assets/directories/rename` | Rename a directory |

## Supported File Types

Images, documents, video, audio, fonts, archives, and more. MIME types are auto-detected from file extensions.
