# Madori Roadmap

This roadmap outlines the planned development of Madori — a flat-file CMS for React/Next.js. Each phase builds on the last, moving from a solid foundation toward features that make Madori a compelling choice for agencies and teams.

---

## Phase 0 — Core CMS Completion - COMPLETE ✅

**Goal:** Complete the feature set required to confidently call Madori a production-ready CMS.

Before hardening begins, the core platform needs to fully deliver on the content-management experience promised by the project vision.

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

---

## Phase 1 — Stabilisation - COMPLETE ✅

**Goal:** Make the core reliable enough for production use.

Before adding new capabilities, the existing feature set needs to be bulletproof. Bugs at the content layer erode trust fast, and a CMS that occasionally loses or corrupts content won't survive real-world use.

| Area | What it means |
|------|---------------|
| **Blueprint validation** | Strict runtime validation of blueprint schemas — catch malformed field definitions early rather than surfacing cryptic errors in the control panel or GraphQL layer. |
| **GraphQL robustness** | Edge-case handling for deeply nested blueprints, replicator fields, taxonomy relations, and empty collections. The auto-generated schema should never produce invalid responses. |
| **Permission enforcement** | Role-based access must be consistent across the control panel UI, API routes, and GraphQL resolvers. |
| **Content integrity** | Guarantees around file writes — no partial saves, atomic operations, safe concurrent editing, and orphan detection. |
| **Automated tests** | Unit, integration, and end-to-end test coverage across the content engine, GraphQL schema generation, permissions, and Control Panel. |
| **Upgrade safety** | Versioned migrations and upgrade tooling for future releases. |

**Why this comes first:** Everything else on the roadmap assumes a stable content layer. Shipping new features on shaky foundations means shipping new bugs.

---

## Phase 2 — Agency Usability - COMPLETE ✅

**Goal:** Reduce the time from "new project" to "first content entry" for agencies managing multiple client sites.

Agencies are the primary audience for a Statamic-inspired flat-file CMS in the React ecosystem. They need fast project setup, repeatable patterns, and minimal boilerplate.

| Feature | Description |
|---------|-------------|
| **Collection scaffolding** | A CLI command that generates collection definitions, blueprints, and example content in one step. |
| **Blueprint generator** | Interactive blueprint creation from examples, existing content, or schema definitions. |
| **Import/export** | Move blueprints, collections, and content between projects. |
| **Starter site packages** | Marketing site, blog, documentation, SaaS, and agency-focused starters. |
| **Content migration tools** | Import content from WordPress, Statamic, Markdown repositories, and other CMS platforms. |
| **Project presets** | Opinionated project structures for common agency use cases. |

**Why this comes second:** Once the core is stable, the biggest friction point is setup time. Agencies evaluate tools by how quickly a new developer can ship a first site.

---

## Phase 3 — Developer Experience & Type Safety - COMPLETE ✅

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

---

## Phase 4 — Performance & Scale - COMPLETE ✅

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

---

## Phase 5 — Optional Storage Drivers

**Goal:** Let teams opt into alternative storage engines without changing their content model.

Flat-file remains the default and recommended approach.

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

**Why this comes last:** The vast majority of Madori sites should never need a database. Database support exists to remove scale objections, not to redefine the product.

---

## Future Exploration

These areas may be explored after the core roadmap is complete:

- Collaborative editing
- WebSocket-powered live updates
- Content revisions
- Localisation
- Visual previewing
- Extension system
- Marketplace
- AI-assisted content modelling
- AI-assisted blueprint generation
- AI-assisted content migration

---

## Contributing

If any of these phases interests you, contributions are welcome. Check the issues tagged with the relevant phase label, or open a discussion to propose an approach.