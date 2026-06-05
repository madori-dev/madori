---
title: Authentication
slug: authentication
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-06-05T10:00:00.000Z
---

# Authentication

Madori includes a complete authentication system with file-based users, session management, and role-based permissions. The system is pluggable — you can swap out the credential validation, session storage, or user provider without changing application code.

Authentication protects the Control Panel and API endpoints. Sessions are managed via cookies (browser) or Bearer tokens (API clients).

---

## Configuration Reference

### Auth Configuration

Authentication is configured in `madori.config.ts`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `auth.driver` | `string` | `password` | Authentication driver — validates credentials |
| `auth.store` | `string` | `file` | Session storage backend |
| `auth.provider` | `string` | `yaml` | User data provider |
| `auth.storeConfig.sessionsDir` | `string` | `./.sessions` | Directory for session files |
| `auth.storeConfig.sessionDurationMs` | `number` | `86400000` (24h) | Session expiry duration in milliseconds |

```ts
// madori.config.ts
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

### User Storage

Users are stored as YAML files in the directory specified by `usersPath` (default: `./users/`):

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

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | Yes | Unique user identifier (matches filename) |
| `email` | `string` | Yes | Login email address (must be unique) |
| `name` | `string` | Yes | Display name |
| `password_hash` | `string` | Yes | bcrypt-hashed password |
| `roles` | `string[]` | No | Array of role handles assigned to this user |
| `created_at` | `string` | No | ISO 8601 creation timestamp |

### Session Management

Sessions use cryptographically random tokens stored as JSON files (SHA-256 hashed filename). Authentication supports two methods:

| Method | Header/Cookie | Description |
|--------|---------------|-------------|
| Cookie | `madori_session` | httpOnly, secure in production. Used by browser-based CP |
| Bearer token | `Authorization: Bearer {token}` | Used by API clients and scripts |

For Control Panel page requests, the Next.js Proxy performs an optimistic cookie-presence check. It does not call an internal HTTP endpoint or session store. Protected API handlers validate the session token and permissions before reading or changing data. An expired or invalid cookie therefore cannot authorize API access; a `401` response sends the browser back to `/cp/login`.

This split keeps route checks fast and avoids loopback HTTP requests when Madori runs behind Nginx, Cloudflare, or another SSL-terminating reverse proxy.

### Roles and Permissions

Roles are defined as YAML files at `resources/roles/{handle}.yaml`:

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

### Available Resources

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

### Available Actions

| Action | Description |
|--------|-------------|
| `view` | Read access |
| `create` | Create new items |
| `edit` | Modify existing items |
| `delete` | Remove items |
| `publish` | Change status to published |

### API Endpoints

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

---

## Usage Examples

### Creating Users via CLI

The simplest way to create a user:

```bash
pnpm madori make:user
```

This prompts for email, name, password, and roles interactively.

### Creating Users via the Control Panel

1. Navigate to **Users** in the CP sidebar
2. Click **Create User**
3. Fill in email, name, password, and assign roles
4. Save

### Creating Users via API

```ts
await fetch('/api/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer <admin-token>',
  },
  body: JSON.stringify({
    email: 'editor@example.com',
    name: 'Jane Editor',
    password: 'secure-password',
    roles: ['editor'],
  }),
})
```

### Logging In via API

```ts
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@example.com',
    password: 'password',
  }),
})

const { token } = await response.json()
// Use token in subsequent requests:
// Authorization: Bearer <token>
```

### Validating a Session

```ts
const response = await fetch('/api/auth/validate', {
  headers: {
    'Authorization': 'Bearer <token>',
  },
})

if (response.ok) {
  const { user } = await response.json()
  // Session is valid, user object contains id, email, name, roles
}
```

### Defining a Custom Role

Create a restricted editor role that can only manage content:

```yaml
# resources/roles/editor.yaml
handle: editor
display: Editor
permissions:
  - resource: entries
    actions: [view, create, edit, publish]
  - resource: assets
    actions: [view, create, edit]
  - resource: globals
    actions: [view, edit]
  - resource: forms
    actions: [view]
  - resource: navigation
    actions: [view, edit]
```

### Logging Out

```ts
await fetch('/api/auth/logout', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
  },
})
```

---

## Common Patterns

### Role Hierarchy

Define roles with increasing permissions for different team members:

```
resources/roles/
├── admin.yaml       # Full access to everything
├── editor.yaml      # Content + assets, no users/settings
├── author.yaml      # Create/edit own entries only
└── viewer.yaml      # Read-only access
```

### Read-Only Viewer Role

For stakeholders who need to see content but not modify it:

```yaml
# resources/roles/viewer.yaml
handle: viewer
display: Viewer
permissions:
  - resource: entries
    actions: [view]
  - resource: assets
    actions: [view]
  - resource: globals
    actions: [view]
  - resource: forms
    actions: [view]
  - resource: navigation
    actions: [view]
```

### Extending Session Duration

For internal teams where frequent re-login is disruptive:

```ts
// madori.config.ts
auth: {
  driver: 'password',
  store: 'file',
  provider: 'yaml',
  storeConfig: {
    sessionsDir: './.sessions',
    sessionDurationMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}
```

### Securing Production

For production environments, tighten session duration:

```ts
auth: {
  storeConfig: {
    sessionDurationMs: 4 * 60 * 60 * 1000, // 4 hours
  },
}
```

### Custom Authentication Drivers

The auth system uses an adapter pattern with three pluggable contracts:

- **AuthDriver** — validates credentials (default: bcrypt password comparison)
- **SessionStore** — manages session tokens (default: file-based JSON)
- **UserProvider** — reads/writes user data (default: YAML files)

Implement custom adapters to integrate with external identity providers, databases, or SSO systems.

### Git-Ignoring Sensitive Files

Add these to `.gitignore` to avoid committing sensitive data:

```gitignore
.sessions/
users/
```

For team environments where users should be consistent across clones, you may choose to commit `users/` but ensure password hashes are strong.

### Multi-Environment User Setup

Create environment-specific user files:

```bash
# Development — relaxed password for convenience
users/dev-admin.yaml

# Staging — real credentials
users/staging-admin.yaml

# Production — managed separately, never committed
```

Use the CLI to create users per environment:

```bash
pnpm madori make:user
```
