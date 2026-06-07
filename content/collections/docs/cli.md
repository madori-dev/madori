---
title: CLI
slug: cli
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-06-07T09:00:00.000Z
---

# CLI

Madori includes command-line tools for scaffolding, content migration, code generation, and administration. The CLI handles everything from creating collections and blueprints to migrating WordPress content and generating typed SDKs.

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
| `make:blueprint <handle>` | Generate a blueprint from content, schema, or interactively |
| `make:collection <handle>` | Scaffold a complete collection with blueprint and example entry |
| `migrate:definitions` | Migrate legacy entity definitions from config to flat files |
| `migrate:wordpress <export-file>` | Migrate content from a WordPress WXR export file |
| `migrate:markdown <source-directory>` | Migrate Markdown files from a directory into a collection |
| `export <path>` | Export blueprints, collections, fieldsets, and content as an archive |
| `import <archive-path>` | Import resources and content from an archive |
| `init:preset <preset-name>` | Initialise project with an opinionated preset structure |
| `registry:pull <repository-url>` | Pull resources from a shared Git registry |
| `registry:push <repository-url>` | Push local resources to a shared Git registry |
| `generate` | Generate TypeScript types, schemas, and SDK from blueprints |
| `check` | Validate project structure and configuration |

---

## Scaffolding Commands

### make:blueprint

Generate a blueprint from existing content, a JSON Schema file, or interactively.

```bash
pnpm madori make:blueprint <handle> [options]
```

| Flag | Type | Description |
|------|------|-------------|
| `--from-content <path>` | `string` | Infer blueprint from a Markdown file's frontmatter |
| `--from-schema <path>` | `string` | Generate blueprint from a JSON Schema file |

When run without flags, the command runs interactively. Fields inferred with low confidence default to `text` and are flagged in the output.

**Example — infer from content:**

```bash
pnpm madori make:blueprint blog --from-content content/collections/blog/hello.md
```

```
✓ Blueprint "blog" created successfully!

  Output: resources/blueprints/collections/blog.yaml
  Fields: 6

⚠ 1 field(s) defaulted to "text" (low confidence):
    - custom_meta
```

**Example — from JSON Schema:**

```bash
pnpm madori make:blueprint products --from-schema schemas/product.json
```

### make:collection

Scaffold a complete collection in one step — creates the collection definition, blueprint, and an example entry.

```bash
pnpm madori make:collection <handle> [options]
```

| Flag | Type | Description |
|------|------|-------------|
| `--fields <fields>` | `string` | Comma-separated field definitions: `handle:type[:required]` |
| `--route <route>` | `string` | Route pattern for the collection |

**Example:**

```bash
pnpm madori make:collection products --fields "name:text:required,price:number:required,description:tiptap,image:asset" --route "/products/{slug}"
```

```
✓ Collection "products" created successfully!

Files created:
  - resources/collections/products.yaml
  - resources/blueprints/collections/products.yaml
  - content/collections/products/example.md
```

### init:preset

Initialise a project with an opinionated preset structure for common use cases.

```bash
pnpm madori init:preset <preset-name> [options]
```

| Flag | Description |
|------|-------------|
| `--force` | Skip conflict prompts and overwrite existing resources |

**Available presets:**

| Preset | Description |
|--------|-------------|
| `marketing-site` | Pages, sections, and team members |
| `blog` | Blog posts with categories and tags |
| `documentation` | Documentation pages with navigation |
| `saas-landing` | SaaS marketing with features and pricing |
| `agency-portfolio` | Portfolio with case studies and team |

**Example:**

```bash
pnpm madori init:preset blog
```

```
✓ Preset "blog" applied successfully!

Files created:
  - resources/collections/posts.yaml
  - resources/blueprints/collections/posts.yaml
  - resources/taxonomies/categories.yaml
  - resources/taxonomies/tags.yaml
  - content/navigation/main.yaml

Next steps:
  Run `madori check` to validate your project.
```

---

## Migration Commands

### migrate:wordpress

Migrate content from a WordPress WXR export file into Madori entries. Converts HTML to Markdown, preserves categories and tags as taxonomy terms, and maps WordPress statuses.

```bash
pnpm madori migrate:wordpress <export-file> [options]
```

| Flag | Type | Description |
|------|------|-------------|
| `--collection <handle>` | `string` | Target collection handle (default: `posts` for posts, `pages` for pages) |

**Example:**

```bash
pnpm madori migrate:wordpress wordpress-export.xml --collection blog
```

```
Migrating WordPress content from: /path/to/wordpress-export.xml

Migration complete!

  Total processed: 142
  Entries created:  138
  Skipped:          4

Taxonomies:
  Categories: 8 terms → resources/taxonomies/categories.yaml
  Tags:       23 terms → resources/taxonomies/tags.yaml

Summary: 142 processed, 138 created, 4 skipped, 0 warnings
```

The migration:
- Converts HTML content to Markdown
- Maps `publish` → `published`, `draft`/`private` → `draft`
- Preserves author, categories, and tags
- Auto-creates taxonomy definition files

### migrate:markdown

Migrate a directory of Markdown files into a Madori collection. Preserves existing frontmatter and generates slugs from filenames.

```bash
pnpm madori migrate:markdown <source-directory> [options]
```

| Flag | Type | Description |
|------|------|-------------|
| `--collection <handle>` | `string` | Target collection handle (prompted if not provided) |

**Example:**

```bash
pnpm madori migrate:markdown ./old-blog-posts --collection blog
```

```
Migrating Markdown files from: /path/to/old-blog-posts
Target collection: blog

Migration complete!

  Files processed:  47
  Entries created:  47
  Skipped:          0

Summary: 47 processed, 47 created, 0 skipped, 0 warnings
```

### migrate:definitions

Migrates `taxonomies`, `globals`, and `navigations` arrays from the config file into individual YAML files under `resources/`.

```bash
pnpm madori migrate:definitions [options]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--config <path>` | `string` | `./madori.config.ts` | Path to the config file to migrate from |
| `--resources <path>` | `string` | `./resources` | Output directory for generated definition files |

---

## Portability Commands

### export

Export project resources and content as a portable archive.

```bash
pnpm madori export <output-path> [options]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--format <format>` | `string` | `zip` | Archive format: `zip` or `tar` |
| `--resources <types>` | `string` | all | Comma-separated resource types to include |

Resource types: `blueprints`, `collections`, `fieldsets`, `content`

**Example:**

```bash
pnpm madori export ./backup.zip --format zip --resources "blueprints,fieldsets"
```

```
✓ Export completed successfully!

  Archive: ./backup.zip
  Size:    24.3 KB
  Files:   18
```

### import

Import resources and content from a previously exported archive.

```bash
pnpm madori import <archive-path>
```

**Example:**

```bash
pnpm madori import ./backup.zip
```

```
✓ Import completed successfully!

  Total files: 18
  Imported:    16
  Skipped:     2
  Conflicts:   0
```

Existing files are skipped by default to prevent accidental overwrites.

### registry:pull

Pull shared resources from a Git repository into your local project.

```bash
pnpm madori registry:pull <repository-url> [options]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--resources <types>` | `string` | all | Comma-separated resource types to pull |
| `--branch <branch>` | `string` | `main` | Git branch to pull from |

**Example:**

```bash
pnpm madori registry:pull https://github.com/my-agency/shared-blueprints.git --resources "blueprints,fieldsets"
```

### registry:push

Push local resources to a shared Git registry.

```bash
pnpm madori registry:push <repository-url> [options]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--resources <types>` | `string` | all | Comma-separated resource types to push |
| `--branch <branch>` | `string` | `main` | Git branch to push to |

---

## Code Generation

### generate

Generate TypeScript types, Zod schemas, and a typed GraphQL SDK from your blueprints. Output goes to `.madori/generated/` by default.

```bash
pnpm madori generate [options]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-o, --output <path>` | `string` | `.madori/generated` | Output directory for generated files |
| `-w, --watch` | `boolean` | `false` | Watch blueprint files and regenerate on change |

**Example:**

```bash
pnpm madori generate
```

```
✓ Generate complete: 3 blueprint(s) processed, 4 file(s) generated in 42ms
```

**Watch mode:**

```bash
pnpm madori generate --watch
```

Regenerates automatically when blueprint files change. Uses a 300ms debounce to batch rapid edits.

The generated output includes:
- TypeScript interfaces for each collection's entries
- Zod schemas for runtime validation
- A typed GraphQL SDK with operations for each collection
- A barrel `index.ts` for convenient imports
- A `tsconfig.paths.json` for path alias configuration

---

## Administration Commands

### make:user

Create a new user account interactively.

```bash
pnpm madori make:user
```

| Prompt | Type | Validation |
|--------|------|------------|
| Email address | `string` | Must be valid email, must not already exist |
| Display name | `string` | Required, non-empty |
| Password | `string` | Required, minimum 8 characters |
| Roles | `string[]` | Comma-separated list of role handles |

Output: Creates a YAML file at `users/{id}.yaml` with a bcrypt-hashed password.

### check

Validate your project structure, blueprints, and configuration.

```bash
pnpm madori check
```

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

### Full Agency Workflow

Set up a new client project from a preset, then customise:

```bash
# Start from a preset
pnpm madori init:preset marketing-site

# Add a blog collection
pnpm madori make:collection blog --fields "title:text:required,slug:slug:required,body:tiptap,image:asset"

# Validate everything
pnpm madori check

# Generate typed SDK
pnpm madori generate
```

### Migrating from WordPress

```bash
# Export from WordPress (WXR format)
# Then import into Madori:
pnpm madori migrate:wordpress wordpress-export.xml

# Generate blueprint from migrated content
pnpm madori make:blueprint posts --from-content content/collections/posts/first-post.md
```

### Sharing Resources Between Projects

```bash
# Push blueprints and fieldsets to a shared registry
pnpm madori registry:push https://github.com/my-agency/shared-resources.git --resources "blueprints,fieldsets"

# Pull into another project
pnpm madori registry:pull https://github.com/my-agency/shared-resources.git
```

### Backup and Restore

```bash
# Export everything
pnpm madori export ./project-backup.zip

# Restore on another machine
pnpm madori import ./project-backup.zip
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

### Code Generation in CI

Add generation to your build pipeline to ensure types stay fresh:

```json
{
  "scripts": {
    "prebuild": "pnpm madori generate",
    "build": "next build"
  }
}
```

### Migration Workflow

When upgrading from an older Madori version that stored definitions inline:

1. Run `pnpm madori migrate:definitions` to extract definitions to files
2. Review the generated files in `resources/`
3. Remove the migrated arrays from `madori.config.ts`
4. Commit the new files and updated config

The migration is non-destructive — existing files are never overwritten.

