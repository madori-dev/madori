---
title: CLI
slug: cli
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# CLI

Madori includes command-line tools for common development and administration tasks. The CLI handles user creation, definition migration, and other operations that are easier to script than perform through the Control Panel.

---

## Configuration Reference

### Running CLI Commands

The CLI is included in the `madori` package. Run commands with:

```bash
pnpm madori <command>
```

### Available Commands

| Command | Description |
|---------|-------------|
| `make:user` | Create a new user account interactively |
| `migrate:definitions` | Migrate legacy entity definitions from config to flat files |

### make:user Options

The `make:user` command prompts interactively and has no flags. It collects:

| Prompt | Type | Validation |
|--------|------|------------|
| Email address | `string` | Must be valid email, must not already exist |
| Display name | `string` | Required, non-empty |
| Password | `string` | Required, minimum 8 characters |
| Roles | `string[]` | Comma-separated list of role handles |

Output: Creates a YAML file at `users/{id}.yaml` with a bcrypt-hashed password.

### migrate:definitions Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--config <path>` | `string` | `./madori.config.ts` | Path to the config file to migrate from |
| `--resources <path>` | `string` | `./resources` | Output directory for generated definition files |

Migrates `taxonomies`, `globals`, and `navigations` arrays from the config file into individual YAML files under `resources/`. Existing files are skipped (non-destructive).

---

## Usage Examples

### Creating a User

```bash
pnpm madori make:user
```

Interactive prompts:

```
? Email address: editor@example.com
? Display name: Jane Editor
? Password: ********
? Roles (comma-separated): editor

✓ Created user at users/editor.yaml
```

The command validates for duplicate emails before creating the user file.

### Migrating Definitions

```bash
pnpm madori migrate:definitions
```

Example output:

```
Migrating definitions from: ./madori.config.ts
Writing to: ./resources

Created:
  ✓ resources/taxonomies/tags.yaml
  ✓ resources/globals/site-settings.yaml

Skipped (already exist):
  ⊘ resources/taxonomies/categories.yaml

Summary: Created: 2 files, Skipped: 1 files, Warnings: 0
```

### Migrating from a Custom Config Path

```bash
pnpm madori migrate:definitions --config ./config/madori.config.ts --resources ./data/resources
```

### Creating an Admin User for Fresh Installations

After scaffolding a new project, create the initial admin account:

```bash
cd my-site
pnpm madori make:user
# Enter: admin@example.com, Admin, your-secure-password, admin
```

---

## Common Patterns

### Scripting User Creation

For CI/CD or staging environment setup, create users non-interactively by writing the YAML file directly:

```yaml
# users/staging-admin.yaml
id: staging-admin
email: staging@example.com
name: Staging Admin
password_hash: <bcrypt hash>
roles:
  - admin
created_at: 2026-01-01T00:00:00.000Z
```

Generate the password hash with:

```bash
pnpm dlx bcryptjs-cli hash "your-password"
```

### Post-Deploy User Setup

Include user creation in your deployment script for fresh environments:

```bash
#!/bin/bash
git pull origin main
pnpm install --frozen-lockfile
pnpm build

# Create admin user if users directory is empty
if [ -z "$(ls -A users/)" ]; then
  echo "No users found — creating default admin"
  pnpm madori make:user
fi

pm2 restart madori
```

### Migration Workflow

When upgrading from an older Madori version that stored definitions inline:

1. Run `pnpm madori migrate:definitions` to extract definitions to files
2. Review the generated files in `resources/`
3. Remove the migrated arrays from `madori.config.ts`
4. Commit the new files and updated config

The migration is non-destructive — existing files are never overwritten.

