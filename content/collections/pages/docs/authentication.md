---
title: Authentication
slug: docs/authentication
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Authentication

MADORI includes built-in authentication with users, sessions, roles, and permissions.

## Users

Users are stored as YAML files in the `users/` directory:

```yaml
# users/admin.yaml
id: admin
email: admin@example.com
name: Admin
password_hash: $2b$10$...
roles:
  - admin
created_at: 2026-01-01T00:00:00.000Z
```

### Creating Users

**CLI:**

```bash
pnpm madori make:user
```

This prompts for email, name, password, and roles interactively.

**Control Panel:**

Navigate to **Users → Create** in the CP.

**API:**

```
POST /api/users
```

## Sessions

Sessions are file-based by default. A cryptographically random token is generated on login and stored as a JSON file (SHA-256 hashed filename). Sessions expire after 24 hours.

Authentication uses either:
- **Cookie:** `madori_session` (httpOnly, secure in production)
- **Bearer token:** `Authorization: Bearer {token}` header

## Roles and Permissions

Roles are defined as YAML files in `resources/roles/`:

```yaml
# resources/roles/admin.yaml
handle: admin
display: Administrator
permissions:
  - resource: collections
    actions: [view, create, edit, delete, publish]
  - resource: entries
    actions: [view, create, edit, delete, publish]
  - resource: assets
    actions: [view, create, edit, delete]
  - resource: users
    actions: [view, create, edit, delete]
  - resource: globals
    actions: [view, edit]
  - resource: taxonomies
    actions: [view, create, edit, delete]
  - resource: forms
    actions: [view, create, edit, delete]
  - resource: navigation
    actions: [view, create, edit, delete]
  - resource: settings
    actions: [view, edit]
```

### Resources

| Resource | Description |
|----------|-------------|
| `collections` | Collection definitions and blueprints |
| `entries` | Content entries |
| `assets` | Uploaded files |
| `users` | User accounts |
| `globals` | Global data sets |
| `taxonomies` | Taxonomy definitions and terms |
| `forms` | Form definitions and submissions |
| `navigation` | Navigation structures |
| `settings` | System settings |

### Actions

| Action | Description |
|--------|-------------|
| `view` | Read access |
| `create` | Create new items |
| `edit` | Modify existing items |
| `delete` | Remove items |
| `publish` | Change status to published |

## Pluggable Architecture

The auth system uses an adapter pattern with three contracts:

- **AuthDriver** — validates credentials (default: password with bcrypt)
- **SessionStore** — manages sessions (default: file-based JSON)
- **UserProvider** — reads/writes user data (default: YAML files)

You can register custom implementations for any of these in `madori.config.ts`:

```ts
auth: {
  driver: 'password',
  store: 'file',
  provider: 'yaml',
  storeConfig: {
    sessionsDir: './.sessions',
    sessionDurationMs: 86400000, // 24 hours
  },
}
```

## API Endpoints

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/auth/login` | No | Login with email/password |
| POST | `/api/auth/logout` | Yes | Destroy session |
| GET | `/api/auth/validate` | No | Check if token is valid |
| GET | `/api/users` | Yes | List all users |
| POST | `/api/users` | Yes | Create user |
| GET | `/api/users/{id}` | Yes | Get user |
| PUT | `/api/users/{id}` | Yes | Update user |
| DELETE | `/api/users/{id}` | Yes | Delete user |
