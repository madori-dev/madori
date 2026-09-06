# Madori Roadmap

Status reviewed 6 September 2026. This roadmap separates implemented foundations from remaining work and future plans. Madori remains pre-1.0; phase labels are not production support guarantees. See [README.md](README.md) for current capabilities and the [production runbook](docs/operations/production.md) for supported deployment limits.

---

## Phase 0 — Core CMS Completion - Baseline implemented; hardening continues

**Goal:** Complete the feature set required to confidently call Madori a production-ready CMS.

Core editorial workflows exist. The areas below continue to need maintenance and edge-case coverage alongside production hardening.

| Area | What it means |
|------|---------------|
| **Control Panel polish** | Complete unfinished workflows, improve UX consistency, and eliminate areas that feel obviously "alpha". |
| **Blueprint coverage** | Ensure all field types, validation rules, conditional logic, and blueprint capabilities behave consistently. |
| **Replicator maturity** | Complete drag-and-drop, nested fieldsets, and complex page-building workflows. |
| **Asset workflows** | Improve upload, browsing, folder management, metadata editing, and asset selection experiences. |
| **Forms** | Complete form management, submission handling, validation, and export capabilities. |
| **Navigation management** | Finalise nested navigation editing and frontend integration. |
| **Documentation foundation** | Establish developer and editor documentation before public adoption increases. |

**Why this comes first:** Stabilising incomplete systems often hardens bugs and design flaws. The platform should first reach feature completeness for its intended scope.

Current status is baseline coverage across these areas; production hardening and
edge-case verification remain tracked in Phase 1.

---

## Phase 1 — Stabilisation - In progress

**Goal:** Make the core reliable enough for production use.

Prioritise data integrity, access control, and regression coverage before expanding capabilities. Existing atomic writes and process-local coordination support one writable application process, not concurrent independent instances.

| Area | What it means |
|------|---------------|
| **Blueprint validation** | Strict runtime validation of blueprint schemas — catch malformed field definitions early rather than surfacing cryptic errors in the control panel or GraphQL layer. |
| **GraphQL robustness** | Edge-case handling for deeply nested blueprints, replicator fields, taxonomy relations, and empty collections. The auto-generated schema should never produce invalid responses. |
| **Permission enforcement** | Role-based access must be consistent across the control panel UI, API routes, and GraphQL resolvers. |
| **Content integrity** | Guarantees around file writes — no partial saves, atomic operations, safe concurrent editing, and orphan detection. |
| **Automated tests** | Unit, integration, and end-to-end test coverage across the content engine, GraphQL schema generation, permissions, and Control Panel. |
| **Upgrade safety** | Versioned migrations and upgrade tooling for future releases. |

**Why this comes first:** Everything else on the roadmap assumes a stable content layer. Shipping new features on shaky foundations means shipping new bugs.

Open work includes deeper GraphQL/blueprint edge cases, cache invalidation,
and continued permission and content-integrity regression coverage.

---

## Phase 2 — Agency Usability - Baseline implemented; starter packages deferred

**Goal:** Reduce the time from "new project" to "first content entry" for agencies managing multiple client sites.

Agencies are the primary audience for a Statamic-inspired flat-file CMS in the React ecosystem. They need fast project setup, repeatable patterns, and minimal boilerplate.

| Feature | Description |
|---------|-------------|
| **Collection scaffolding** | A CLI command that generates collection definitions, blueprints, and example content in one step. |
| **Blueprint generator** | Interactive blueprint creation from examples, existing content, or schema definitions. |
| **Import/export** | Move blueprints, collections, and content between projects. |
| **Starter site packages** | Deferred until distributable starter packages exist. |
| **Content migration tools** | Import content from WordPress, Statamic, Markdown repositories, and other CMS platforms. |
| **Project presets** | Opinionated project structures for common agency use cases. |

**Why this comes second:** Once the core is stable, the biggest friction point is setup time. Agencies evaluate tools by how quickly a new developer can ship a first site.

CLI scaffolding, migration, registry, and preset paths are implemented. Starter
site packages remain deferred until distributable packages and release support
are available.

---

## Phase 3 — Developer Experience & Type Safety - Baseline implemented; contract hardening continues

**Goal:** Make Madori the most developer-friendly CMS in the React ecosystem.

This is the major differentiator. Madori should feel native to TypeScript developers rather than merely compatible with TypeScript.

### Features

| Feature | Description |
|---------|-------------|
| **Blueprint-generated types** | Generate TypeScript types directly from content schemas. |
| **Typed content SDK** | Query collections and entries with full type safety. |
| **Typed GraphQL client** | Automatically generate strongly typed GraphQL operations. |
| **Schema inference** | Generate Zod schemas and runtime validators from blueprints. |
| **IDE tooling** | Autocomplete, field documentation, and schema awareness. |
| **Developer hooks** | Framework-friendly utilities for querying content in React and Next.js. |

### Why this matters

- Catches content-shape bugs at build time.
- Provides first-class editor support.
- Keeps content and application code synchronised.
- Creates a compelling reason to choose Madori over traditional headless CMS platforms.

Generation and SDK foundations exist, while cross-boundary schema and client
contracts still require ongoing compatibility testing.

---

## Phase 4 — Performance & Scale - Partial; follow-up work required

**Goal:** Support larger projects without compromising the flat-file philosophy.

Most projects will remain perfectly suited to flat-file storage, but larger content sets require additional optimisation.

| Feature | Description |
|---------|-------------|
| **Content indexing** | Faster lookups and querying for large collections. |
| **Search indexing** | Built-in content search capabilities. |
| **Media transforms** | Responsive images, thumbnails, and optimisation pipelines. |
| **Content caching** | Intelligent caching of expensive content operations. |
| **Incremental rebuilds** | Reduce build times for large sites. |
| **Background jobs** | Asset processing and indexing tasks. |

**Why this comes before database drivers:** Most scaling concerns can be solved without abandoning the flat-file architecture.

Indexing, search, background jobs, and cache/incremental rebuild guarantees
remain follow-up work; this phase is not a production-scale completion claim.

---

## Phase 5 — Optional Storage Drivers — Planned

**Goal:** Let teams opt into alternative storage engines without changing their content model.

Flat-file remains the implemented storage approach. The drivers below are planned, not available integrations.

| Driver | Use case |
|--------|----------|
| **SQLite** | Faster queries on medium-sized projects with minimal operational overhead. |
| **PostgreSQL** | Large installations requiring advanced querying and concurrent write performance. |

### Design principles

- Flat-file remains canonical.
- Content structures remain unchanged.
- Control Panel behaviour remains unchanged.
- Migration paths remain straightforward.
- Drivers remain optional.

These proposed drivers would offer alternative query and concurrency options while preserving the content model.

---

## Future Exploration

These areas may be explored after the core roadmap is complete:

- Collaborative editing
- WebSocket-powered live updates
- Content revisions
- Full content localisation (site origins/locales and SEO alternate URLs already have configuration support)
- Visual previewing
- Extension system
- Marketplace
- AI-assisted content modelling
- AI-assisted blueprint generation
- AI-assisted content migration

---

## Contributing

If any of these phases interests you, contributions are welcome. Check the issues tagged with the relevant phase label, or open a discussion to propose an approach.
