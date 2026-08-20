---
title: SEO Architecture
slug: seo-architecture
status: published
createdAt: 2026-08-19T00:00:00.000Z
updatedAt: 2026-08-19T00:00:00.000Z
---

# SEO Architecture

This document freezes Madori SEO Wave 0 contracts before implementation. Fixtures in `tests/fixtures/seo` are normative examples; implementation must satisfy them without changing their meaning.

## Goals

Madori must match Statamic-style SEO editorial workflows: global defaults, collection and taxonomy defaults, record overrides, inheritance, social previews, structured data, redirects, reporting, and multi-site URL handling. Madori goes beyond baseline parity by returning field provenance, sharing one resolver between preview and published output, and keeping operational data out of content Git history.

## Versioned storage

Editorial configuration is Git-versioned:

| Concern | Path |
|---|---|
| Site defaults | `resources/seo/sites/{site}.yaml` |
| Collection defaults | `resources/seo/sections/collection/{handle}.yaml` |
| Taxonomy defaults | `resources/seo/sections/taxonomy/{handle}.yaml` |
| Entry override | Nested `seo` object in entry front matter |
| Term override | Nested `seo` object in term YAML |
| Redirect definition | `content/seo/redirects/{id}.yaml` |

Every SEO document contains `version: 1`. Readers reject unsupported future versions with an actionable error. Writers use atomic replacement and content mutation events, so Git sync sees complete files.

Generated or observed state is operational and is never staged by default:

| Concern | Path family |
|---|---|
| Resolved metadata cache | `storage/seo/cache/` |
| 404 observations | `storage/seo/observations/` |
| Redirect hit counters | `storage/seo/metrics/` |
| Crawl/report snapshots | `storage/seo/reports/` |

Operational records use opaque IDs. Query secrets, credentials, full referrer paths, and visitor identifiers are not retained. Authored redirect rules remain Git-versioned; their counters do not.

## Cascade

Resolution order, lowest to highest priority:

1. Safe system fallback from subject title and URL.
2. Site defaults.
3. Collection or taxonomy section defaults.
4. Entry or term override.

Field behavior:

- Omitted field: inherit.
- `null`: inherit.
- Empty string: normalize to unset, then inherit.
- Explicit value: override lower layers.
- `enabled: false` on site, section, or record: exclude affected scope or subject from SEO processing, reports, and sitemap output. It does not expose lower-layer metadata.
- `enabled: false` on a channel such as `social` or `jsonLd`: suppress only that channel.

Resolver returns final value and source for every field. Templates do not reproduce cascade logic.

## URL rules

Canonical URLs use configured site origin plus localized route. Domain-based and subdirectory-based sites share same resolver contract. Canonicals remove fragments, tracking parameters, duplicate slashes, and default ports.

Localized subjects emit valid alternates for published translations plus one configured `x-default`. Page one uses clean archive URL. Page two and later preserve only normalized pagination parameter. Paginated results expose previous and next URLs where applicable and add localized page suffix to title.

Canonical overrides must use `http` or `https`, contain no credentials, and belong to an allowed origin unless external canonicals are explicitly enabled.

## Social metadata and JSON-LD

Record social image overrides site image. Missing record image falls back to site default. Images resolve to absolute public URLs at output boundary. Open Graph and Twitter may be disabled independently of index metadata.

JSON-LD is an array of valid objects. Core types initially include `WebSite`, `WebPage`, `Article`, `BreadcrumbList`, and organization/person authors. Resolver supplies canonical identifiers and dates. User-provided JSON-LD is schema-validated and cannot inject HTML.

## Redirects and 404s

Redirect definitions contain opaque ID, site, normalized source, destination, status (`301`, `302`, `307`, or `308`), and enabled state. Validation rejects self-loops, duplicate active sources, chains, cycles, unsafe schemes, credential-bearing destinations, and control characters. Runtime lookup must be bounded and deterministic.

404 observations aggregate normalized site and path. They store first seen, last seen, count, and optional referrer origin. Query values are discarded or redacted. Robots, assets, health checks, and configured noise patterns may be excluded. Promoting an observation creates a separate versioned redirect; it never mutates observation history into content.

## API contracts

Success responses use `{ data, meta }`. Validation failures use `{ error: { code, message, fields }, meta: { requestId } }`.

Resolved response:

```json
{
  "data": {
    "subject": { "type": "entry", "id": "entry-1", "site": "en" },
    "title": "Welcome | Madori",
    "canonical": "https://example.com/welcome",
    "robots": ["index", "follow"],
    "alternates": {},
    "openGraph": null,
    "twitter": null,
    "jsonLd": []
  },
  "meta": {
    "version": 1,
    "sources": { "title": "record", "canonical": "computed" },
    "warnings": []
  }
}
```

Settings responses include site, enabled state, defaults, version, and storage class. Report collections include page, per-page, total, and `storage: operational`. APIs never expose server paths.

## Permissions

| Action | Permission |
|---|---|
| View SEO and 404 reports | `view seo reports` |
| Edit site/section defaults | `edit seo defaults` |
| Create, edit, delete redirects | `manage seo redirects` |
| Edit entry/term SEO | Existing permission to edit that entry or term |

Super users retain all access. SEO permissions never grant access to otherwise forbidden content. Preview resolution requires view access to subject. Public rendering does not expose provenance or draft values.

## Backward migration

Legacy top-level fields remain readable during transition:

| Legacy | Version 1 |
|---|---|
| `meta_title` | `seo.title` |
| `meta_description` | `seo.description` |
| `og_image` | `seo.social.image` |

Nested version 1 values win when both shapes exist. Migration is idempotent, lossless, dry-runnable, atomic, and creates per-file backups. It preserves unknown fields. Successful writes emit normal content mutations so Git records migration. Legacy fields are removed only after compatibility window and explicit operator confirmation.

## Exact parity acceptance checklist

- [ ] Site defaults resolve independently per site.
- [ ] Collection and taxonomy defaults resolve without changing their definition files.
- [ ] Entry and term overrides inherit omitted and null fields.
- [ ] Disabled site, section, or record is excluded from metadata, reports, and sitemap.
- [ ] Disabled social or JSON-LD channel suppresses only that channel.
- [ ] Canonical URLs pass domain, subdirectory, locale, and pagination fixtures.
- [ ] Alternates include published locales and configured `x-default` only.
- [ ] Open Graph and Twitter values use record image then site fallback.
- [ ] JSON-LD output validates and contains no executable markup.
- [ ] Redirect validation rejects duplicate sources, chains, cycles, loops, and unsafe destinations.
- [ ] 404 observations aggregate operationally without entering Git.
- [ ] Resolver, preview, public metadata, REST, and GraphQL adapters share same domain result.
- [ ] Permission matrix passes for super user, SEO manager, editor, and viewer.
- [ ] Legacy fields read and migrate according to version 1 fixture.

## Beyond-parity acceptance checklist

- [ ] Every resolved field includes stable provenance.
- [ ] Preview and published output use same resolver with explicit publication context.
- [ ] Operational APIs expose opaque IDs and redact sensitive query data.
- [ ] Cache invalidation follows site, section, record, asset, and domain dependencies.
- [ ] Contract fixtures remain versioned and backward compatible.
- [ ] Domain and subdirectory multi-site strategies pass same URL contract.

## Frozen safety and compatibility decisions

- External canonical origins are rejected by default. An operator may explicitly opt in; record content can never enable them itself.
- Redirect chains are rejected at write time. Madori will not silently flatten editorial intent.
- Legacy fields remain readable for at least one major release and are removed only by an explicit migration command.
- Report retention uses both a 90-day window and a maximum of 50 snapshots by default.
- First release supports `WebSite`, `WebPage`, `Article`, `BreadcrumbList`, `Organization`, and `Person`; custom nodes remain validated data rather than executable templates.
