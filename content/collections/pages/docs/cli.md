---
title: CLI
slug: docs/cli
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# CLI

MADORI includes command-line tools for common tasks.

## Installation

The CLI is included in the `madori` package. Run commands with:

```bash
pnpm madori <command>
```

## Commands

### make:user

Create a new user account interactively:

```bash
pnpm madori make:user
```

Prompts for:
- Email address
- Display name
- Password
- Roles to assign

Validates for duplicate emails before creating the user file.

### migrate:definitions

Migrate legacy entity definitions from `madori.config.ts` to flat files:

```bash
pnpm madori migrate:definitions
```

Options:

| Flag | Default | Description |
|------|---------|-------------|
| `--config <path>` | `./madori.config.ts` | Path to config file |
| `--resources <path>` | `./resources` | Output directory |

This migrates `taxonomies`, `globals`, and `navigations` arrays from the config file into individual YAML files under `resources/`. Existing files are skipped (non-destructive).

**Example output:**

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
