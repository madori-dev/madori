<p align="center">
  <a href="https://madori.dev">
    <img src="public/madori_logo.svg" alt="Madori" width="250" />
  </a>
</p>

<a href="https://madori.dev">
  <h1>MADORI</h1>
</a>

A flat-file CMS for React and Next.js applications, inspired by Statamic and built with TypeScript. Content lives in Markdown and YAML; a browser-based Control Panel manages it alongside reusable field schemas.

Madori is self-hosted and pre-1.0. Its writable CMS runs as one Node.js process with persistent storage. Public frontend code lives in the same Next.js application and can be customised independently of the Control Panel. See [production requirements](docs/operations/production.md) before choosing a deployment platform.

## Quick start

Requirements: Node.js 22 or newer, the repository-pinned pnpm version (currently 11.22.0), and `curl` and `tar` for scaffolding.

```bash
pnpm dlx create-madori-app@latest my-site
cd my-site
pnpm install
pnpm dev
```

Open `http://localhost:3000` for the site and `http://localhost:3000/cp` for the Control Panel. Setup creates `admin@example.com` and prints a random password once. Store it securely, then change the bootstrap account's email and password after signing in.

The scaffolder downloads the repository's current `main` branch. For reproducible deployments, record and test the resulting application revision and lockfile. [Getting started](content/collections/docs/getting-started.md) and [scaffolder details](packages/create-madori-app/README.md) explain the generated project.

## What Madori includes

- **Editorial tools:** collections, taxonomies, globals, forms and navigation, with a Control Panel built from React and shadcn components.
- **Content modelling:** definitions describe content kinds; blueprints describe fields, tabs and sections; fieldsets provide reusable groups and repeatable blocks. Shared validation applies in the editor and content write paths.
- **Assets and rich text:** uploads, folders, metadata, bulk operations, asset selection, and TipTap editing with tables, images and code blocks.
- **Access control:** password sign-in, file-backed sessions, roles, resource scopes and separate publishing permission. Password changes and account deletion revoke sessions.
- **Developer APIs:** a content engine, authenticated GraphQL, public published-entry reads, a typed file-reading SDK, React hooks, and generated TypeScript types, Zod schemas and GraphQL operations.
- **SEO:** site and section defaults, record overrides, previews and provenance, metadata, structured data, sitemap/robots/humans output, redirects and reports.
- **Operations:** optional Git sync, content and SEO caching, optional static HTML caching, health endpoints, backup/restore tools and schema migration commands.

Capabilities and current limits are detailed in [ROADMAP.md](ROADMAP.md). Feature availability does not imply support for multiple writable instances, ephemeral serverless storage, or collaborative real-time editing.

## How the pieces fit

1. **Definitions** in `resources/collections/`, `resources/taxonomies/`, and related directories declare named content kinds and routes.
2. **Blueprints** in `resources/blueprints/{type}/` define fields and editor layouts. A collection references its blueprint by handle; those handles can differ, and collections can share a blueprint.
3. **Content** in `content/` stores entries, terms, globals, navigation trees and submissions. Application services validate writes and publish mutation events for cache invalidation and optional Git sync.
4. **The frontend** renders published content using the application's content/SEO adapters or the appropriate SDK/API. Files remain authoritative; generated types and caches can be rebuilt.

[CONTEXT.md](CONTEXT.md) defines project vocabulary. [SEO architecture](content/collections/docs/seo-architecture.md) describes the metadata and URL pipeline.

## Reading content

| Interface | Where to use it | Publication and authentication |
|---|---|---|
| Application content engine | Server-side code in this project | Trusted internal API; apply publication and authorization rules at your boundary |
| `@madori/sdk` | Node.js code with direct access to content files | List reads default to published; single reads need an explicit publication check; no session enforcement |
| Public entry API and client hooks | Browser reads of published entries | `/api/public/entries/{collection}/{slug?}`; drafts are not exposed |
| GraphQL and generated operations | Authenticated tools and integrations | `/api/graphql`; protected content operations require a valid session and permissions |

Run `pnpm madori generate` to produce types, schemas and SDK helpers in `.madori/generated/`. Generation uses the conventional `resources/` directory. See [SDK and content access](content/collections/docs/sdk.md), [GraphQL](content/collections/docs/graphql.md), and [CLI](content/collections/docs/cli.md) for setup, examples and limits.

## Project layout

```text
my-site/
├── content/
│   ├── collections/          # Markdown entries
│   ├── taxonomies/           # YAML terms
│   ├── globals/              # Global values
│   ├── navigation/           # Navigation trees (singular directory)
│   ├── forms/                # Stored submissions; private data
│   └── seo/redirects/        # Authored redirect rules
├── resources/
│   ├── collections/          # Collection definitions
│   ├── taxonomies/           # Taxonomy definitions
│   ├── globals/              # Global definitions
│   ├── forms/                # Form definitions
│   ├── navigations/          # Navigation definitions (plural directory)
│   ├── blueprints/           # Field schemas, organised by content kind
│   ├── fieldsets/            # Reusable field layouts and blocks
│   ├── roles/                # Permission roles
│   └── seo/                  # Site and section SEO defaults
├── public/assets/            # Uploads and private metadata sidecars
├── users/                    # Private account files; never publish or commit
├── .sessions/                # Private sessions; default location
├── storage/                  # Operational state and regenerable caches
├── .madori/generated/        # Generated types, schemas and clients
├── src/app/(cp)/             # Control Panel and its authenticated APIs
├── src/app/api/              # GraphQL, public API and health routes
├── src/components/          # Control Panel and frontend components
├── src/lib/                  # CMS, auth, content, SEO and infrastructure
├── packages/                 # CLI and workspace tooling
└── madori.config.ts          # Application configuration
```

Paths are configurable. Git sync is opt-in and tracks content (excluding form submissions) and resources by default; assets require explicit inclusion. Users, sessions, backups and credentials belong outside published source history.

## Configuration

Set public site URLs for correct canonicals, sitemaps and cache origin matching. Example configuration:

```ts
import type { MadoriConfigInput } from './src/lib/config/schema'

const config: MadoriConfigInput = {
  contentPath: './content',
  resourcesPath: './resources',
  usersPath: './users',
  assetsPath: './public/assets',
  sites: [
    { handle: 'default', url: 'http://localhost:3000', locale: 'en-GB', default: true },
  ],
  cp: { enabled: true, path: '/cp' },
  graphql: {
    enabled: true,
    path: '/api/graphql',
    introspection: process.env.NODE_ENV !== 'production',
  },
}

export default config
```

Replace the local site URL before production. Project configuration is statically imported: rebuild and restart after changing it in production. Runtime site settings and authored content have separate write paths. [Configuration reference](content/collections/docs/configuration.md) covers authentication, SEO, Git and static caching.

## Working on this repository

```bash
git clone https://github.com/madori-dev/madori.git
cd madori
pnpm install --frozen-lockfile
pnpm madori make:user
pnpm dev
```

Cloning does not run the scaffolder or create an account. The interactive `make:user` command creates one; select the `admin` role for local Control Panel access.

Common checks:

```bash
pnpm lint
pnpm exec tsc --noEmit --incremental false
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm e2e
```

Browser tests build the application and use disposable fixtures. CI also checks all workspace package types and production dependencies; use the complete [release gate](docs/operations/production.md#release-gate) before shipping. Read [AGENTS.md](AGENTS.md) before changing code; this checkout's Next.js documentation is bundled under `node_modules/next/dist/docs/`.

## Documentation

| Task | Guide |
|---|---|
| Set up a site | [Getting started](content/collections/docs/getting-started.md) |
| Edit and publish content | [Editor guide](content/collections/docs/editor-guide.md) |
| Model content | [Collections](content/collections/docs/collections.md), [blueprints](content/collections/docs/blueprints.md), [fieldsets](content/collections/docs/fieldsets.md), [field types](content/collections/docs/field-types.md) |
| Organise shared content | [Taxonomies](content/collections/docs/taxonomies.md), [globals](content/collections/docs/globals.md), [navigation](content/collections/docs/navigation.md) |
| Manage media and submissions | [Assets](content/collections/docs/assets.md), [forms](content/collections/docs/forms.md) |
| Build an integration | [SDK](content/collections/docs/sdk.md), [GraphQL](content/collections/docs/graphql.md), [CLI](content/collections/docs/cli.md) |
| Configure access and publishing | [Authentication](content/collections/docs/authentication.md), [configuration](content/collections/docs/configuration.md), [Git sync](content/collections/docs/git-sync.md) |
| Configure SEO | [SEO architecture](content/collections/docs/seo-architecture.md) |
| Deploy and operate | [Deployment](content/collections/docs/deployment.md), [production runbook](docs/operations/production.md), [incident response](docs/operations/incident-response.md) |

Docs under `content/collections/docs/` also render as site documentation. Dated [audit records](docs/audits/2026-09-06/final-audit.md) preserve findings and verification at their recorded revision; they are historical evidence, not live reference pages.

## Production and security

Run one writable process on durable storage, use TLS, configure the real site origin, and verify off-host backups. Production requires a Node.js server; a static export cannot host the writable Control Panel. Static HTML caching is disabled by default and only caches eligible anonymous HTML; private, authenticated and no-store responses bypass it.

Use `/api/health/live` and `/api/health/ready` for monitoring. Follow the [production runbook](docs/operations/production.md) for storage, release, backup and rollback requirements. Report vulnerabilities privately using the process in [SECURITY.md](SECURITY.md).

## License

Madori uses the custom terms in [LICENSE.md](LICENSE.md). Review those terms before use or redistribution.
