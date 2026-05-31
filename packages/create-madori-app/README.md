# create-madori-app

Scaffold a new [MADORI](https://github.com/madori-dev/madori) project in seconds.

MADORI is a flat-file CMS for React/Next.js applications — inspired by Statamic, powered by TypeScript.

## Usage

```bash
pnpm dlx create-madori-app@latest my-site
```

or

```bash
npx create-madori-app@latest my-site
```

Then:

```bash
cd my-site
pnpm install
pnpm dev
```

## What you get

- **Control Panel** at `/cp` — a polished admin UI for managing content
- **GraphQL API** at `/api/graphql` — auto-generated from your blueprints
- **Flat-file storage** — content as Markdown/YAML, version-controlled alongside your code
- **Blueprints** — flexible field schemas (text, markdown, assets, replicators, and more)
- **Collections, Taxonomies, Globals, Forms, Navigation** — all the content primitives you need
- **Asset management** — upload, organise, and browse files from the CP
- **Authentication & roles** — built-in user management with role-based permissions

## Requirements

- Node.js 18+
- pnpm (recommended) or npm

## Default credentials

After scaffolding, log in to the control panel with:

- **Email:** admin@example.com
- **Password:** changeme

⚠️ Change these after first login.

## Documentation

See the [MADORI repository](https://github.com/madori-dev/madori) for full documentation.

## License

See [LICENSE.md](https://github.com/madori-dev/madori/blob/main/LICENSE.md) for details.
