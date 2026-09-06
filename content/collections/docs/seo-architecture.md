---
title: SEO Architecture
slug: seo-architecture
status: published
createdAt: 2026-08-19T00:00:00.000Z
updatedAt: 2026-09-06T00:00:00.000Z
---

# SEO Architecture

Madori's SEO implementation separates authored defaults and overrides from resolution, output adapters and operational reports. This page describes current code; the earlier Wave 0 implementation checklist has been replaced by the working contracts below. Fixtures under `tests/fixtures/seo` and tests under `tests/unit/seo` record compatibility expectations.

## Components and data flow

1. `FileSeoRepository` reads and writes site/section defaults; entry and term overrides remain part of content records.
2. `SeoRuntime` obtains published content, configured sites and routes, then resolves the cascade. Authenticated preview can evaluate draft content through its preview path.
3. The resolver returns values, provenance and explanation steps. Output adapters derive Next metadata, JSON-LD and sitemap entries.
4. `SeoApplication` coordinates preview, reports, redirect promotion and invalidation. `getMadori()` supplies the shared services used by routes and GraphQL.
5. Public route adapters in `src/lib/seo/next/` share request-local results between metadata and rendered content. Mutation events and filesystem watchers invalidate application content/SEO caches.

SEO metadata caching is in memory. It is distinct from optional static HTML caching and from separately configured Next SDK tag caches.

## Authored storage

Paths below are relative to configured resource/content roots:

| Concern | Path |
|---|---|
| Site defaults | `resources/seo/sites/{site}.yaml` |
| Collection defaults | `resources/seo/sections/collection/{handle}.yaml` |
| Taxonomy defaults | `resources/seo/sections/taxonomy/{handle}.yaml` |
| Entry override | Nested `seo` in Markdown frontmatter |
| Term override | Nested `seo` in term YAML |
| Redirect definition | `content/seo/redirects/{id}.yaml` |

Standalone default documents carry `version: 1`, a `kind`, their site/section identity, and `seo` values. Record overrides are an `seo` value object, without the standalone document wrapper. Redirects have their own versioned shape. Unsupported versions fail validation. Repository writes use atomic replacement; callers can supply a SHA-256 `expectedRevision` from an earlier read to detect conflicting edits. These locks target one writable process, not distributed writers.

Example site defaults:

```yaml
version: 1
kind: site
site: default
seo:
  title:
    kind: template
    value: "{title} | Example"
  description:
    kind: literal
    value: "News and guides from Example."
  robots:
    indexing: index
    following: follow
  sitemap:
    enabled: true
  jsonLd:
    enabled: true
    type: WebPage
```

Example record override:

```yaml
seo:
  title:
    kind: literal
    value: "A title for search results"
  description:
    kind: field
    value: summary
```

## Cascade and source values

Precedence runs from safe system fallback to site defaults, collection/taxonomy defaults, then record overrides. Section defaults are keyed by section kind and handle; they are not separate per-site documents.

Author title, description, canonical and social-image sources using these forms:

| Source | Meaning |
|---|---|
| Omitted or `{ kind: inherit }` | Keep lower-priority value |
| `{ kind: literal, value: "…" }` | Use explicit text |
| `{ kind: field, value: summary }` | Read a subject field |
| `{ kind: template, value: "{title} | Example" }` | Interpolate supported subject/site tokens |
| `{ kind: disabled }` | Suppress this source value |

Compatibility readers normalize legacy strings, nulls and blanks; new API writes use the validated source objects above. Whole-scope `seo.enabled: false` excludes that scope from SEO output. `sitemap.enabled` and `jsonLd.enabled` control those channels. Do not invent a `social.enabled` field in authored documents: it is not accepted by the current public write schema.

Resolved results contain `provenance` and `explain`. Source labels include `system`, `site`, `scope`, `record`, suppressed variants, and `generated`. Public metadata uses the resolved values rather than exposing editorial explanation data.

## URLs, locales and publication

`sites` in `madori.config.ts` declares site handle, URL, locale and default identity. Configure the real public origins before deployment. The URL resolver uses configured collection/taxonomy routes, trailing-slash policy, localized paths and optional pagination context.

Canonical policy rejects unsafe schemes and credentials; external canonicals require explicit configuration. Localized alternates depend on supplied localized paths/publication context. This URL support does not constitute a complete translated-content editor or automatically create translations.

Published SEO adapters exclude draft entries; terms are public unless explicitly marked draft. Authenticated preview uses the same resolver but permits a distinct publication context. Custom frontends must preserve that separation when choosing content adapters.

## Output and feature switches

Configuration flags include `enabled`, `metadata`, `structuredData`, `sitemap`, `robots`, `humans`, `reports`, `redirects`, `errorTracking`, and `socialImages`. SEO is enabled by default; generated social images are disabled by default. Site-specific social-image references and generated image endpoints are separate concerns.

Outputs include Next metadata with canonical, robots, Open Graph and Twitter descriptors; JSON-LD graphs; `/sitemap.xml`; `/robots.txt`; and `/humans.txt`. JSON-LD supports configured WebPage, Article, Organization, Person and BreadcrumbList types, plus bounded custom data with an `@type`; a WebSite node is derived when site data supports it. Use the JSON-LD serializer to escape HTML-sensitive characters when embedding a graph.

The current writer does not offer independent Open Graph/Twitter enable switches. Avoid treating every low-level resolver option as a persisted configuration setting.

## Redirects, observations and reports

Redirects use `301`, `302`, `307` or `308`. Validation rejects unsafe destinations, self-loops, duplicate active sources, chains and cycles. External redirect destinations require exact origin inclusion in `seo.allowedRedirectOrigins`; ordinary same-site path redirects do not.

Operational storage defaults to `storage/seo` and is configurable through `seo.operationalStoragePath`:

| State | Current storage |
|---|---|
| Resolved SEO cache | Process memory |
| 404 observations | `not-found-observations.json` |
| Report snapshots | `reports/snapshots.json` |

404 observations store opaque IDs, normalized site/path, first/last seen times, hit counts, and optional referrer origin. Query values are omitted or marked redacted; visitor identifiers are not retained. The public adapter filters common noise and throttles repeated observations, so these counts are not access-log totals. Default storage retains at most 1,000 observations, pruning by the configured retention window during writes.

Reports are generated on request and persisted as snapshots. Defaults retain up to 50 snapshots within 90 days; configure `reportSnapshotLimit` and `reportRetentionDays`. Redirect hit-counter persistence and a disk metadata cache are not current storage contracts.

Authored defaults and redirects participate in content Git sync. Operational storage is excluded from its default tracked roots; keep it out of source history when configuring custom roots. Promotion creates a redirect and can remove the selected observation; it does not turn an observation file into authored content.

## APIs and permissions

Control Panel SEO APIs live under `/api/seo`; GraphQL exposes SEO queries/mutations when the corresponding feature ports are enabled. Both use application services and permission checks. Control Panel responses use `{ data, meta }`, with `meta.requestId` and version where appropriate; errors use `{ error: { code, message, fields? }, meta: { requestId } }`. Revisions are returned for optimistic writes; public responses omit internal filesystem paths.

The REST resolved-preview response wraps a runtime/preview result, including its `resolved` and output fields. GraphQL maps that result into its own explicit field types. It is not the same JSON shape as a Next metadata object. See [GraphQL API](/docs/graphql) for query examples.

| Control Panel action | Resource/action |
|---|---|
| Read defaults or preview | `seo` / `view` |
| Edit/delete defaults | `seo` / `edit` |
| Read / run reports | `seo-reports` / `view` or `edit` |
| Read / save / delete redirects | `seo-redirects` / `view`, `edit` or `delete` |
| Read / delete 404 observations | `seo-errors` / `view` or `delete` |
| Promote a 404 to redirect | `seo-redirects` / `create` |

Scopes and content-access checks further constrain these operations. Editing entry/term SEO follows that content's editing permissions. SEO permissions do not grant general access to otherwise forbidden records.

## Legacy migration

Compatibility readers recognize `meta_title`, `meta_description` and `og_image`. Migration copies them into `seo.title`, `seo.description` and `seo.social.image` without overwriting existing nested values or removing legacy keys. It preserves unknown fields and supports dry-run, per-file backups and a rollback plan. Runtime compatibility normalization accepts the migrated values; newly authored documents should use current source objects.

Use the `seo:migrate` and `seo:rollback` commands documented in [CLI](/docs/cli). Keep verified operational backups before bulk edits or deployment; a migration backup is not a substitute for the [production backup/restore process](/docs/deployment).
