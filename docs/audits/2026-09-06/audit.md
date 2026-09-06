# Madori project audit — 6 September 2026

Follow-up: [remediation status and verification](remediation.md). Findings below describe the original audited checkout.

**Result: release-blocking security, data-integrity, caching and integration defects remain despite passing release checks.** This report records findings against current checkout `a20012d09a83013f04d38ce121b120a8ab72ca12`.

Scope covered authentication/permissions, account lifecycle, filesystem writes, entries/definitions/blueprints, assets, Control Panel editing, public routing, forms/navigation, GraphQL, SDK/code generation, Git synchronization, SEO/static caching, configuration, scaffolder source and production/CI documentation. Review combined source tracing, existing suites, isolated service reproductions and targeted Chromium checks. No product fixes applied. Existing user edit to AGENTS.md preserved.

**38 findings:** 16 Standards and 22 Spec, plus one explicitly unconfirmed follow-up risk. Findings remain separate under Standards and Spec; priority applies within each axis. **P1:** address before production release or enabling affected feature. **P2:** material correctness/security/usability defect. **P3:** lower-impact defect. Runtime reproduction and source-only evidence are identified per finding; source-only findings are not claimed as observed production incidents.

| Check | Result |
|---|---|
| Unit/property/integration suite | 237 files, 1,905 tests passed |
| Lint | Passed |
| Application types | Passed; incremental cache disabled |
| SDK, CLI and scaffolder types | All three package checks passed |
| Production build and Chromium suite | Build passed; 19 browser tests passed |
| Production dependency audit | One moderate Tiptap advisory; zero high/critical advisories |
| Targeted probes | Reproduced data loss, session persistence/ID reuse, secret serialization, asset collisions/metadata loss, validation mismatches, unsaved navigation, GraphQL defects and static-cache lock hang |

Passing tests establish existing coverage, not absence of bugs. No live deployment, external account/service, scaffold download/install, backup restoration or load benchmark performed. Temporary test servers, public probe files and disposable browser fixtures removed. Reproduction logs retained alongside this report.

## Standards

Security, data integrity, implementation contracts and documented project conventions.



### S1 — P1: Enforce publish authorization on entry writes

- Location: [src/app/(cp)/api/[...path]/route.ts:1025](</Volumes/Personal/madori/src/app/(cp)/api/[...path]/route.ts:1025>), `1044-1047`; [src/app/(cp)/api/handlers/entries.ts:129](</Volumes/Personal/madori/src/app/(cp)/api/handlers/entries.ts:129>), `171-180`.
- Both POST and PUT authorize only `entries:create` or `entries:edit` for collection; status passed directly into engine. `publish` exists as separate role action, but these paths never check it.
- Trigger: custom role with blog create/edit but no publish submits `status: "published"`. A collection defaultStatus of published also publishes omitted-status creates.
- Impact: draft-only editors bypass editorial approval and publish or unpublish content.
- Fix: authorize effective status transition in shared application operation; cover defaults and all transports. Test create, update, and defaultStatus using role lacking publish.
- Confidence: high, complete route-to-storage trace. Engine persistence checked by isolated reproduction; HTTP authorization wrapper verified by source trace; no live accounts modified.

### S2 — P1: Make optimistic concurrency check atomic with write

- Location: [src/lib/content/engine.ts:361](</Volumes/Personal/madori/src/lib/content/engine.ts:361>) (read/hash check and intervening await); final writes at 412/431.
- Two requests using same current contentHash can both read same file and pass verification, then both succeed and last rename silently overwrites first update. AtomicFileWriter guarantees whole-file replacement, not compare-and-swap. Single process topology does not prevent this.
- Reproduction: `/Volumes/Personal/madori/docs/audits/2026-09-06/evidence/madori-standards-audit.ts.txt` holds two reads at barrier, then concurrently updates different custom fields from same hash. Output: both promises fulfilled; final file keeps one original field and one edited field. Rerun: copy stored `.ts.txt` probe into a temporary `.ts` file, then execute it with `pnpm exec tsx --tsconfig tsconfig.json <temporary-file.ts>` from project root.
- Impact: silent editorial data loss despite advertised conflict handling. Create duplicate check and rename destination check similarly race.
- Fix: shared per-entry lock covering read/hash/merge/write, and consistent source/destination locking for create/rename/delete. Return 409 for stale second update.
- Confidence: high, deterministic isolated real-filesystem reproduction.

### S3 — P1: Revoke sessions when credentials or user identity change

- Location: [src/lib/auth/composer.ts:83](</Volumes/Personal/madori/src/lib/auth/composer.ts:83>); [src/lib/auth/stores/file.ts:74](</Volumes/Personal/madori/src/lib/auth/stores/file.ts:74>); CP session resolver [src/app/(cp)/api/[...path]/route.ts:226](</Volumes/Personal/madori/src/app/(cp)/api/[...path]/route.ts:226>).
- updateUser/password changes and deleteUser touch only provider; session store retains every token until expiry. Session files identify user only by reusable id.
- Reproduction: issue token for `a-editor`; change password => old token still valid. Delete `a-editor`, recreate same id with admin role => old token resolves replacement account with admin role. Isolated script prints `Session after password reset true`, `Old session after id reuse [ 'admin' ]`.
- Impact: stolen sessions survive password remediation, and removed account sessions can acquire privileges of a newly created account reusing its id.
- Fix: revoke all sessions for affected user on delete/password reset; bind tokens to immutable user identity/session generation and implement optional current-session rotation for self-service password change.
- Confidence: high, deterministic isolated real-filesystem reproduction plus complete composition trace.

### S4 — P1: Preserve environment-backed secrets when saving settings

- Location: [src/lib/settings/config.ts:56](</Volumes/Personal/madori/src/lib/settings/config.ts:56>), `70-72`.
- write imports/evaluates entire config, deep-merges public edit, serializes entire evaluated object back into tracked madori.config.ts. readPublic redacts auth adapter options from browser, but write still materializes their values.
- Reproduction: temp config `export default {auth:{driverConfig:{apiKey:process.env.MADORI_AUDIT_SECRET}}}`; set dummy env secret; save unrelated cp.enabled; dummy secret appears literally in file afterward. No real credentials inspected.
- Impact: routine settings saves turn environment-only credentials into plaintext source, subsequently exposed through source-control/release backups. Also freezes all environment-dependent configuration.
- Fix: edit allowed AST properties while preserving expressions; or store CP overrides separately from executable/environment-backed config.
- Confidence: high, real service reproduction. Arbitrary auth options supported by schema; service explicitly documents credential-bearing options.

### S5 — P1: Keep uploaded active content off authenticated origin

- Location: [src/lib/content/upload-constraints.ts:21](</Volumes/Personal/madori/src/lib/content/upload-constraints.ts:21>); [src/app/(cp)/api/handlers/assets.ts:28](</Volumes/Personal/madori/src/app/(cp)/api/handlers/assets.ts:28>); [src/lib/content/assets.ts:191](</Volumes/Personal/madori/src/lib/content/assets.ts:191>); `next.config.ts:3-12`.
- Default upload accepts every extension/type, writes raw HTML/SVG into public/assets. Static assets share origin with cookie-authenticated CP and receive no CSP sandbox or attachment disposition.
- Trigger: user with assets:create uploads HTML containing script, administrator opens asset link. Script can call same-origin CP APIs with administrator cookie; HttpOnly prevents reading cookie but does not prevent authenticated fetches.
- Production nuance: Next snapshots public paths at server setup, so newly named uploads become serveable after restart; overwrites of existing served assets work immediately. Development or static reverse proxy may serve immediately. No automatic HTML-in-<img> execution claimed: direct asset navigation required.
- Fix: isolated asset origin without CP cookies, or reject active formats; serve untrusted downloads with attachment/sandbox headers. MIME request header alone is attacker-controlled.
- Confidence: high source trace of accepted active content and unsandboxed same-origin hosting; production Chromium verification completed: harmless HTML served HTTP 200 on same application origin; script changed document title to Madori audit script executed; no CSP or attachment disposition headers. Probe file removed afterward.

### S6 — P2: Prevent custom data from overwriting reserved entry metadata

- Location: [src/lib/content/engine.ts:308](</Volumes/Personal/madori/src/lib/content/engine.ts:308>), `400-401`.
- Object.assign overlays untrusted data bag after trusted title/slug/status/timestamps fields. Engine response built separately still reports original fields.
- Reproduction: create title Draft, slug hidden, status draft, data `{status:'published', title:'Shadow title', slug:'different'}`. Response reports draft/hidden; stored Markdown reports published/different/Shadow title.
- Impact: records unexpectedly publish, filename and slug diverge, timestamps/authorship can be forged; later reads disagree with successful save response. Top-level publish guard alone would remain bypassable through this bag.
- Fix: reject reserved keys in custom data and/or serialize reserved system fields last; reserve these names in blueprint creation too.
- Confidence: high, isolated real engine reproduction.

### S7 — P2: Reject upload collisions or require edit authorization

- Location: [src/lib/content/assets.ts:191](</Volumes/Personal/madori/src/lib/content/assets.ts:191>); upload authorization [src/app/(cp)/api/[...path]/route.ts:563](</Volumes/Personal/madori/src/app/(cp)/api/[...path]/route.ts:563>).
- Upload always atomically replaces existing pathname without collision check; route only requires assets:create.
- Reproduction: upload `folder/photo.txt` twice with different bytes; second succeeds and disk contains replacement. Included in isolated script.
- Impact: selecting common filename destroys existing asset, and create-only role can overwrite any known existing asset despite lacking edit/delete.
- Fix: exclusive create with conflict or generated unique name; explicit replacement operation must require assets:edit. Handle duplicate files in multi-upload similarly.
- Confidence: high, real filesystem reproduction plus authorization trace.

### S8 — P2: Move and delete asset sidecars together with asset

- Location: [src/lib/content/assets.ts:227](</Volumes/Personal/madori/src/lib/content/assets.ts:227>), `252-256`.
- Metadata writes alt into `<asset>.meta.yaml`; moveAsset and deleteAsset only touch binary, unlike filename updates. Bulk operations delegate to affected methods.
- Reproduction: upload photo.txt, set alt, move to folder/photo.txt. New getAsset has no alt; original photo.txt.meta.yaml remains. Deleting last asset likewise leaves invisible sidecar, causing empty-looking directory deletion to fail and later reupload to inherit old alt.
- Fix: treat binary+sidecar as one operation, rollback both, report all affected paths to mutation bus.
- Confidence: high, real filesystem reproduction.

### S9 — P2: Enforce unique login email on create and profile edits

- Location: [src/lib/auth/providers/yaml.ts:93](</Volumes/Personal/madori/src/lib/auth/providers/yaml.ts:93>), `114-135`, `140-144`; self-profile route allows email edits for any authenticated user.
- Provider checks only id collision; getByEmail returns first sorted filename with exact matching email. Both create and update permit duplicate login email.
- Reproduction: create a-editor and z-admin; a-editor changes own email to admin@example.com; getByEmail(admin@example.com) returns a-editor. Admin's correct password then authenticates against wrong account and fails.
- Impact: accidental duplicate accounts make one unreachable; existing low-permission account with earlier id can intentionally shadow another login. No admin privilege takeover claimed from duplicate email alone.
- Fix: normalized unique email constraint shared across creation/update under user-store lock; reject duplicates with 409.
- Confidence: high, real filesystem reproduction and login trace.

### S10 — P2: Emit global mutation after write, never on read

- Location: [src/lib/content/globals.ts:50](</Volumes/Personal/madori/src/lib/content/globals.ts:50>), `75-94`.
- getGlobal reports update on cache miss; updateGlobal writes new file and caches it without reporting mutation. CP PUT /api/globals/{handle} invokes latter.
- Reproduction: injected recording mutation reporter; reading existing global emits one update; writing global emits zero. Script prints `Global read reports 1`, `Global write reports 0`.
- Impact: Git auto-sync misses real global changes, while reads enqueue false changes and wrong actor attribution. Potentially commits unrelated pending manual edits when merely viewing global.
- Fix: move mutation report from read to successful write, with correct actor context supplied by composition.
- Confidence: high, isolated real-file reproduction.



### S11 — P2: User update payload bypasses role/profile validation

Source: [src/app/(cp)/api/handlers/users.ts:149](</Volumes/Personal/madori/src/app/(cp)/api/handlers/users.ts:149>). Update validates email and password but forwards roles/name/theme without equivalent create validation. An authorized user manager can persist a malformed roles value or nonexistent role, leaving account unusable or authorization checks failing. Use one validated account-update contract with role existence/uniqueness checks and retain self-profile allowlist. Evidence: complete handler/provider source trace; malformed HTTP payload not executed against real accounts.

### S12 — P2: Term update can create content without create permission

Source: [src/lib/content/store.ts:181](</Volumes/Personal/madori/src/lib/content/store.ts:181>), [src/app/(cp)/api/[...path]/route.ts:1093](</Volumes/Personal/madori/src/app/(cp)/api/[...path]/route.ts:1093>). Updating absent term creates its file, while route authorizes only taxonomies:edit. Edit-only users can create terms through PUT. Return 404 for absent update target or authorize effective create operation separately. Evidence: handler-to-storage trace.

### S13 — P3: Bulk move duplicate preflight never rejects duplicates

Source: [src/lib/content/assets.ts:273](</Volumes/Personal/madori/src/lib/content/assets.ts:273>). Preflight tests `!set.add(value)`; Set.add always returns truthy Set. Duplicate source/destination checks never run. Later collision handling normally rolls back, so silent data loss is not asserted. Check membership before insertion. Evidence: source and JavaScript API semantics.

### S14 — P2: Uploaded assets lack working production serving contract

Source: [src/lib/content/assets.ts:191](</Volumes/Personal/madori/src/lib/content/assets.ts:191>), [src/app/(cp)/api/handlers/assets.ts:28](</Volumes/Personal/madori/src/app/(cp)/api/handlers/assets.ts:28>). Upload writes configured assetsPath; no dynamic public route serves that root. Browser fixture uploaded text successfully (HTTP 201), but `/assets/audit-upload.txt` returned 404. Custom assetsPath was outside Next public directory, as supported by configuration. Default public directory also cannot serve newly named files after production server starts: installed Next snapshots public file paths at startup ([node_modules/next/dist/server/lib/router-utils/filesystem.js:195](</Volumes/Personal/madori/node_modules/next/dist/server/lib/router-utils/filesystem.js:195>)). A harmless file added after startup fell through to application route instead of being served.

Implement explicit serving route honoring assetsPath with containment and safe content headers, or require/document a static host for that root. Verify fetch of a newly uploaded and renamed file after production startup. Evidence: real production Chromium/HTTP probe plus installed framework source. This differs from Spec F14's erroneous 500 on file-like missing URLs.

### S15 — P2: Core field controls lack accessible labels

Source: [src/components/cp/fields/TextField.tsx:16](</Volumes/Personal/madori/src/components/cp/fields/TextField.tsx:16>), [src/components/cp/fields/NumberField.tsx:16](</Volumes/Personal/madori/src/components/cp/fields/NumberField.tsx:16>), [src/components/cp/fields/DateField.tsx:16](</Volumes/Personal/madori/src/components/cp/fields/DateField.tsx:16>). Labels are siblings of inputs with neither htmlFor/id association nor aria-label. Parent FieldRenderer group supplies descriptions but no input name. Screen-reader users cannot reliably identify these fields; clicking label does not focus input. Assign unique input IDs and connected labels/help/errors. Use existing shadcn Input/Label components, consistent with AGENTS.md's Control Panel rule. Evidence: rendered component structure, not a complete assistive-technology audit.

### S16 — P2: Lockfile retains vulnerable Tiptap core

Production dependency audit resolves `@tiptap/core` 3.30.3 and flags moderate advisory [GHSA-cp6q-959q-f8rh](https://github.com/advisories/GHSA-cp6q-959q-f8rh). Patched release is 3.30.4. Vulnerable attribute merging can produce executable DOM attributes when untrusted attributes reach affected helper; application-specific exploitability is not established by dependency audit alone. Update compatible Tiptap packages and lockfile, then verify rich-text roundtrips. Existing CI high-severity threshold intentionally permits this moderate advisory.

### Follow-up risk, not counted as confirmed finding

[src/lib/auth/providers/yaml.ts:140](</Volumes/Personal/madori/src/lib/auth/providers/yaml.ts:140>) rewrites full user record without lock; login updates lastLogin through same provider ([src/lib/auth/composer.ts:51](</Volumes/Personal/madori/src/lib/auth/composer.ts:51>)). Concurrent login/profile/password updates could overwrite another change. Source suggests same lost-update pattern as S2, but separate deterministic account race not reproduced. Add barrier-controlled test before promoting to confirmed defect.


## Spec

Documented feature behavior and cross-component integration.



### F1 — P1: Enabling static cache hangs subsequent requests

Source: [src/lib/static-cache/middleware.ts:81](</Volumes/Personal/madori/src/lib/static-cache/middleware.ts:81>) (acquire), `:86` (unbounded wait), `:95` (unimplemented response hook). Supporting [src/lib/static-cache/lock.ts:12](</Volumes/Personal/madori/src/lib/static-cache/lock.ts:12>).

Trigger: set supported `staticCache.enabled: true`, request same uncached public URL twice. First request acquires lock and returns to Next; no production caller stores rendered response or releases/fails this lock. Second request waits forever. CacheLock has no timeout. Proxy actively invokes this path at [src/proxy.ts:111](</Volumes/Personal/madori/src/proxy.ts:111>).

Verification: direct `handleStaticCache` calls with NextRequest and application driver returned `first null`, then Promise.race reported `second still pending` after 100ms. Source search found no afterResponse implementation or lock release outside tests. Test-only cleanup released lock afterward.

Fix: wire response capture/cache write/release in actual rendering lifecycle; always release on errors/timeouts. Until lifecycle exists, do not expose working-cache claim or acquire unreleasable lock. Spec: module's explicit contract `:43-46`, supported config schema and proxy integration.

### F2 — P1: Valid hyphenated collection handles crash entire GraphQL schema

Source: [src/lib/graphql/schema-generator.ts:240](</Volumes/Personal/madori/src/lib/graphql/schema-generator.ts:240>) and `:244` use raw handle as GraphQL field; corresponding resolver naming [src/lib/graphql/resolvers.ts:160](</Volumes/Personal/madori/src/lib/graphql/resolvers.ts:160>).

Trigger: create valid collection `case-studies` with matching blueprint. GraphQLObjectType construction throws `Names must only contain [_a-zA-Z0-9] but "case-studies" does not.` Because getYoga builds all collections together, every GraphQL query becomes unavailable.

Verification: generated real schema from one synthetic blueprint/collection, observed exact error above via `pnpm exec tsx`.

Fix: one shared camelCase GraphQL-name mapping for schema, resolvers and generators, with collision validation. Spec [content/collections/docs/graphql.md:47](</Volumes/Personal/madori/content/collections/docs/graphql.md:47>): `Singular query | camelCase of handle`; `:11` promises every collection queryable.

### F3 — P1: Reusing a blueprint across collections crashes GraphQL

Source: [src/lib/graphql/schema-generator.ts:239](</Volumes/Personal/madori/src/lib/graphql/schema-generator.ts:239>) creates new filter object for every collection; `:362-365` names each from blueprint handle.

Trigger: `news` and `blog` both reference blueprint `page`. Schema construction throws `Schema must contain uniquely named types but contains multiple types named "PageFilterInput".` All GraphQL unavailable. Same schema per collection is otherwise valid CMS configuration.

Verification: invoked actual generator with these definitions and captured exact error.

Fix: cache/reuse filter type per blueprint, or name filters per collection. Spec [content/collections/docs/collections.md:26](</Volumes/Personal/madori/content/collections/docs/collections.md:26>) defines blueprint reference; [content/collections/docs/graphql.md:11](</Volumes/Personal/madori/content/collections/docs/graphql.md:11>) promises schema from definitions.

### F4 — P1: GraphQL keeps stale content and schema until process restart

Source: [src/app/api/graphql/route.ts:35](</Volumes/Personal/madori/src/app/api/graphql/route.ts:35>), particularly private permanent `InMemoryContentCache` at `:45`; handler retained at `:36`. Entry cache [src/lib/content/engine.ts:229](</Volumes/Personal/madori/src/lib/content/engine.ts:229>) has no TTL.

Trigger: query entry/list, then change/publish/delete content through CP or filesystem. GraphQL's distinct content engine/cache has no watcher and no shared mutation bus. Singleton's watcher invalidates only singleton cache; cached GraphQL responses retain old entry and list state indefinitely. Blueprint, collection and fieldset changes also never rebuild yoga schema.

Verification: reproduced same unwatched-engine composition in temporary filesystem. After changing title on disk, reads printed `initial Before` and `after external write Before`. Temporary fixture removed. Source traced CP/singleton cache to separate instance.

Fix: share content engine and invalidation bus with application singleton; rebuild schema on blueprint/definition/fieldset changes. Spec [content/collections/docs/graphql.md:11](</Volumes/Personal/madori/content/collections/docs/graphql.md:11>): `The API updates automatically whenever you add or modify blueprints.`

### F5 — P1: Generated GraphQL SDK cannot execute any generated operation

Source: [packages/madori-cli/src/generators/graphql-sdk-generator.ts:87](</Volumes/Personal/madori/packages/madori-cli/src/generators/graphql-sdk-generator.ts:87>), `:152-160`, `:178`.

Trigger: run documented generate command, import `getBlogEntry`, call it. Generated DocumentNode has neither `loc` nor custom toString; request body contains `query: "[object Object]"`. Even fixing printing alone still leaves nonexistent `blogEntry`/`blogEntries` names, nonexistent ListOptions input, and missing entry selection sets. Actual schema uses `blog(slug)` and `blogs(filter,limit,offset,sort)`.

Verification: transpiled actual generated client and operation module in memory, stubbed fetch, called getBlogEntry. Captured `{"query":"[object Object]","variables":{"slug":"hello"}}`. Validating corrected text using `blogEntry` returned `Cannot query field "blogEntry" on type "Query".`

Fix: generate schema-valid documents with selected fields, print GraphQL AST or retain source string, and run generated operations against real schema in contract tests. Spec `/Volumes/Personal/madori/content/collections/docs/cli.md` Code Generation promises typed GraphQL SDK; [content/collections/docs/graphql.md:47](</Volumes/Personal/madori/content/collections/docs/graphql.md:47>) documents actual query naming.

### F6 — P2: Introspection setting blocks normal client queries and is bypassable

Source: [src/app/api/graphql/route.ts:237](</Volumes/Personal/madori/src/app/api/graphql/route.ts:237>).

Trigger: introspection false (production default), send ordinary GraphQL request containing `__typename` (normal Apollo behavior). Regex also matches this allowed field and returns 403. Conversely JSON-escape underscores (`\u005f`) in `__schema`; raw-body check misses them, JSON decoder restores actual introspection query, and Yoga has no AST validation rule to stop it.

Verification: exact regex returned true for normal __typename query; false for escaped body whose JSON-parsed query is `{__schema{queryType{name}}}`.

Fix: apply GraphQL AST introspection validation, not raw-body substring matching. Spec `/Volumes/Personal/madori/content/collections/docs/graphql.md`, Disabling Introspection: `This disables the __schema and __type queries while leaving all other queries functional.`

### F7 — P2: Collections ending in s lose single-entry GraphQL query

Source: [src/lib/graphql/schema-generator.ts:244](</Volumes/Personal/madori/src/lib/graphql/schema-generator.ts:244>); duplicated naming in `/Volumes/Personal/madori/src/lib/graphql/resolvers.ts`.

Trigger: any handle ending `s`, including shipped `pages` and `docs`. pluralize returns handle unchanged, so list query/resolver overwrite single-entry query/resolver. `pages(slug:"home")` fails `Unknown argument "slug" on field "Query.pages".` Handles colliding with another collection's plural have same overwrite issue.

Verification: actual schema generator and graphql execution reproduced exact unknown-argument error.

Fix: choose collision-free single/list naming contract and validate cross-collection collisions. Spec [content/collections/docs/graphql.md:47](</Volumes/Personal/madori/content/collections/docs/graphql.md:47>) promises both singular and plural queries for each collection.

### F8 — P2: Multi-set replicator queries return null blocks

Source: [src/lib/graphql/schema-generator.ts:423](</Volumes/Personal/madori/src/lib/graphql/schema-generator.ts:423>) creates GraphQLUnionType without resolveType/isTypeOf. Content uses `_type`, not GraphQL's recognized `__typename`.

Trigger: blueprint replicator has two resolvable fieldset handles; query blocks with inline fragments. GraphQL errors that abstract type must resolve to Object type; returns blocks `[null]` despite valid stored block.

Verification: actual generator + actual buildResolvers, synthetic hero/copy fieldsets and valid hero content returned `Abstract type "BlogBlocksUnion" must resolve to an Object type at runtime ...` and `blocks:[null]`.

Fix: map stored `_type` to generated set type names using resolveType. Spec schema generator's structured-replicator contract `:369-371`, GraphQL docs `:11` promises blueprint content queryable.

### F9 — P2: Sanitized GraphQL field names silently drop stored values

Source: [src/lib/graphql/schema-generator.ts:328](</Volumes/Personal/madori/src/lib/graphql/schema-generator.ts:328>); [src/lib/graphql/resolvers.ts:54](</Volumes/Personal/madori/src/lib/graphql/resolvers.ts:54>) copies raw keys.

Trigger: valid blueprint storage handle `featured-image`; schema exposes `featured_image`, but default resolver looks for that renamed property while response map retains original `featured-image`. Client gets null although value exists. Filter inputs use same renamed keys without reverse mapping, so filtering also misses data.

Verification: actual generator/buildResolvers execution returned `featured_image:null` with source data `{"featured-image":"value"}`.

Fix: attach field resolver reading original handle or translate response/filter keys consistently. Spec [content/collections/docs/graphql.md:46](</Volumes/Personal/madori/content/collections/docs/graphql.md:46>): type contains all blueprint fields; [content/collections/docs/blueprints.md:164](</Volumes/Personal/madori/content/collections/docs/blueprints.md:164>): handle is storage key.

### F10 — P2: SEO caches ignore external content edits and route-definition changes

Source: [src/lib/madori.ts:188](</Volumes/Personal/madori/src/lib/madori.ts:188>) invalidates only entry/term/asset/seo mutation types; `:222` file watcher callback reports Git changes only. [src/lib/seo/runtime/cache.ts:10](</Volumes/Personal/madori/src/lib/seo/runtime/cache.ts:10>) has no expiry; [src/lib/seo/runtime/runtime.ts:30](</Volumes/Personal/madori/src/lib/seo/runtime/runtime.ts:30>) and `:70-84` cache metadata/sitemap.

Trigger: prime SEO output, then edit Markdown/SEO YAML through filesystem/Git, or change collection/taxonomy route via CP. Content watcher refreshes ordinary content cache, but SEO cache never invalidates for filesystem events or definition mutation types. Old metadata, canonicals and sitemap URLs persist until restart.

Verification: source-traced event handlers and cache lifetime; no runtime end-to-end repro. Strong static finding; separate from GraphQL cache ownership finding F4.

Fix: connect filesystem/definition mutations to SEO dependency invalidation, including sitemap and affected record sections. Spec [content/collections/docs/seo-architecture.md:65](</Volumes/Personal/madori/content/collections/docs/seo-architecture.md:65>) canonical uses configured localized route; `:147` adapters share same domain result.

### F11 — P2: SDK client hooks cannot recover after failed fetch

Source: [packages/madori-sdk/src/hooks/client.ts:48](</Volumes/Personal/madori/packages/madori-sdk/src/hooks/client.ts:48>) and `:104-130`.

Trigger: first slug/collection fails, then component receives valid slug/collection. New request does not clear error or set isLoading true; successful result updates only data and isLoading. Error remains forever, so documented `if(error)` render stays error despite successful new fetch. Switching successfully loaded slug also keeps isLoading false with stale prior data while waiting.

Verification: full effect/state trace; no mounted React repro run.

Fix: reset loading/error for each request; decide and document stale-data policy. Spec `/Volumes/Personal/madori/content/collections/docs/graphql.md` Client Components example branches on isLoading/error.

### F12 — P2: Generated SDK models disagree with actual field values

Source: [packages/madori-cli/src/generators/type-generator.ts:86](</Volumes/Personal/madori/packages/madori-cli/src/generators/type-generator.ts:86>) maps asset to MadoriAsset and entries to MadoriEntryRef[]; [packages/madori-sdk/src/index.ts:109](</Volumes/Personal/madori/packages/madori-sdk/src/index.ts:109>) returns raw frontmatter unchanged. Client hooks `:60` / `:123` return REST entries with custom fields nested under data, whereas generated interfaces flatten custom fields.

Trigger: consume generated types with actual server/client SDK. Asset references are stored strings/string arrays and relation references strings, never hydrated objects; consumers trust generated type and access e.g. image.path or relation.slug, receiving undefined. Switching same generated type from server SDK to client hook also moves custom field from top level to data unexpectedly.

Verification: real createClient against temporary Markdown fixture plus TypeGenerator.mapFieldToType printed `asset declared MadoriAsset actual "photo.jpg"` and `entries declared MadoriEntryRef[] actual ["blog/other"]`. Fixture removed. Client-side nested-data mismatch additionally source-traced; separate from F5 operation transport failure.

Fix: align generated types, server SDK normalization and public REST adaptation to one verified wire/data contract; real-content integration tests.

### F13 — P3: Published navigation GraphQL examples are invalid

Source: [src/lib/graphql/schema-generator.ts:166](</Volumes/Personal/madori/src/lib/graphql/schema-generator.ts:166>) declares Navigation.items JSON scalar. Docs [content/collections/docs/graphql.md:204](</Volumes/Personal/madori/content/collections/docs/graphql.md:204>), `:416-421` select items.label/url/children.

Verification: executed documented query shape against actual generated schema: `Field "items" must not have a selection since type "JSON!" has no subfields.`

Fix: implement recursive NavigationItem output type to support promised query, or update every example and contract to request JSON `items` without selections.

### F14 — P2: Missing file-like public URLs raise 500 instead of 404

Source: [src/lib/seo/next/runtime.ts:67](</Volumes/Personal/madori/src/lib/seo/next/runtime.ts:67>), [src/lib/routing/route-matcher.ts:123](</Volumes/Personal/madori/src/lib/routing/route-matcher.ts:123>), [src/lib/content/identifiers.ts:3](</Volumes/Personal/madori/src/lib/content/identifiers.ts:3>).

Trigger: request `/missing.txt` (or unavailable file-like route) with shipped pages collection fallback `/{slug}`. Route matcher accepts `missing.txt`; `getPublishedEntry` passes it to content engine, identifier guard throws ValidationError because dots are forbidden; no public resolver catches error. Public page/generateMetadata error before normal notFound handling. Ordinary `/missing` reaches null and 404.

Verification: actual matchPublicContentRoutes + assertContentIdentifier reproduced `/missing` accepted and `/missing.txt ValidationError Invalid entry slug`. Production browser probe independently observed HTTP 500 for newly written post-build public txt file. Separate from assets-at-runtime issue: even truly nonexistent file URLs must return 404.

Fix: reject candidates with invalid content identifiers at public lookup boundary, or translate expected ValidationError to no-match/404. Spec public page's explicit `notFound()` contract, [src/app/[...slug]/page.tsx:45](</Volumes/Personal/madori/src/app/[...slug]/page.tsx:45>).



### F15 — P1: Server entry validation ignores configured validation rules

Source: [src/lib/blueprints/repository.ts:438](</Volumes/Personal/madori/src/lib/blueprints/repository.ts:438>), invoked by [src/lib/content/engine.ts:685](</Volumes/Personal/madori/src/lib/content/engine.ts:685>). Server builds separate type-only schema and never applies field.validate. An entry violating max/min/regex/email or numeric-range rules can be persisted through direct API, although editor rejects it. Real registry probe accepted `far-too-long` for `validate: ['max:3']`; shared client validator rejected identical value. Docs [content/collections/docs/blueprints.md:415](</Volumes/Personal/madori/content/collections/docs/blueprints.md:415>) promises these rules. Use one authoritative validation implementation for browser, API, CLI and forms, then add transport tests with invalid values.

### F16 — P2: Multi-asset fields cannot be saved as entries

Source: [src/lib/blueprints/repository.ts:452](</Volumes/Personal/madori/src/lib/blueprints/repository.ts:452>). All asset fields compile to z.string(), ignoring max_files/min_files and editor's array representation. Probe with max_files:3 and two filenames failed `Invalid input: expected string, received array`. Blueprint/editor can configure gallery, but server rejects save. Use existing getAssetCardinality contract when generating server schema; verify array limits and clear behavior through create/edit/reload. Docs [content/collections/docs/blueprints.md:248](</Volumes/Personal/madori/content/collections/docs/blueprints.md:248>) explicitly supports string or string array.

### F17 — P2: Invisible required field prevents editor save

Source: [src/lib/validation/rules.ts:94](</Volumes/Personal/madori/src/lib/validation/rules.ts:94>), [src/hooks/use-field-validation.ts:65](</Volumes/Personal/madori/src/hooks/use-field-validation.ts:65>). FieldRenderer hides conditional field, but client validation loops through every field without visibility check. Probe with enabled:false and required details visible only when enabled:true returned visible:false and validation failure for details. User cannot fill hidden field or save. Docs [content/collections/docs/blueprints.md:378](</Volumes/Personal/madori/content/collections/docs/blueprints.md:378>) explicitly says hidden-field rules are not enforced. Apply same visibility semantics as server registry before validation; evaluate against full form state.

### F18 — P2: Clearing optional number produces an unsaveable form

Source: [src/components/cp/fields/NumberField.tsx:24](</Volumes/Personal/madori/src/components/cp/fields/NumberField.tsx:24>), [src/lib/validation/rules.ts:78](</Volumes/Personal/madori/src/lib/validation/rules.ts:78>). Empty input emits null; optional number validator accepts undefined but rejects null. Probe reproduced expected-number/received-null error. Client blocks save before existing entry API's null-clear behavior can run. Normalize empty numeric input consistently and preserve explicit clearing through transport; cover create/edit and nested grid numbers.

### F19 — P2: Required validation rule is a no-op; empty required selections pass

Source: [src/lib/validation/rules.ts:66](</Volumes/Personal/madori/src/lib/validation/rules.ts:66>), `:175`. Rule handler treats required as handled elsewhere, but elsewhere checks field.required only. Real probe `type:text, validate:['required']` accepted missing value. Required select with empty string also passed shared validator; required arrays and empty rich-text objects have similarly weak presence checks. Docs [content/collections/docs/blueprints.md:452](</Volumes/Personal/madori/content/collections/docs/blueprints.md:452>) explicitly promises required property/rule equivalence. Derive requiredness from both sources and enforce meaningful emptiness for each field type. Distinct from F15: fixing server's separate validator alone would retain these shared-validator defects.

### F20 — P2: Internal navigation silently discards unsaved edits

Source: [src/hooks/use-unsaved-changes.ts:81](</Volumes/Personal/madori/src/hooks/use-unsaved-changes.ts:81>), [src/app/(cp)/cp/layout.tsx:145](</Volumes/Personal/madori/src/app/(cp)/cp/layout.tsx:145>). Dirty hook registers beforeunload only; Next Link navigation retains document and never triggers event. Chromium probe changed entry summary, waited for Unsaved changes indicator, clicked Collections sidebar link: navigation completed with zero confirmation dialogs; persisted summary remained Before. Add navigation interception/confirmation or recoverable draft mechanism for internal links and back navigation. Test real in-app navigation, not only browser reload.

### F21 — P2: Config save removes default export for valid alternate variable names

Source: [src/lib/settings/config.ts:165](</Volumes/Personal/madori/src/lib/settings/config.ts:165>), `:192`. Writer recognizes export default config literally. Valid input `const settings = {}; export default settings` is rewritten to const config without any default export. Real rewriteConfigFile probe confirmed absence. Subsequent config load/build fails or falls back incorrectly. Parse export binding or store runtime overrides separately; test named exports, alternate variable names and environment expressions. Separate from Standards S4's secret exposure.

### F22 — P2: Client list hook silently ignores filter option

Source: [packages/madori-sdk/src/hooks/client.ts:99](</Volumes/Personal/madori/packages/madori-sdk/src/hooks/client.ts:99>), `:107`, `:137`. Public signature accepts shared ListOptions.filter, but hook sends only limit/offset/sort/status and excludes filter from effect dependencies. Filtered client list shows unfiltered records; changing only filter never fetches again. Server SDK does apply filter. Implement and validate equivalent REST filter encoding, or expose a narrower explicit API instead of silently accepting unsupported option. Evidence: complete option-to-request/effect source trace.


## Improvements linked to findings

1. **Consolidate application composition and cache ownership.** GraphQL, SEO, public routes and Control Panel should consume one content contract and mutation/invalidation mechanism. Duplicated engines currently produce persistent stale state.
2. **Consolidate field semantics.** One validation/schema contract should define requiredness, visibility, null clearing, asset cardinality and nested fields. Keep UI rendering separate from value rules. Three independently maintained representations currently disagree.
3. **Add cross-boundary tests.** Run generated SDK operations against real generated GraphQL schema; exercise shared/hyphenated/plural collection handles, multi-set replicators, published/draft transitions, role matrices, simultaneous writers and production asset URLs. Existing 1,905 tests and 19 browser tests missed these failures.
4. **Include package type checks in required CI.** Root tsconfig excludes packages ([tsconfig.json:44](/Volumes/Personal/madori/tsconfig.json:44)), but CI invokes only root tsc ([.github/workflows/ci.yml:46](</Volumes/Personal/madori/.github/workflows/ci.yml:46>)). Package checks currently pass; preserve that result as enforced gate. Use dedicated generation/consumer contract checks, since valid TypeScript alone cannot establish wire compatibility.
5. **Unify Control Panel fields around shadcn and accessible identifiers.** Native controls duplicate Input/Label styling and omit associations. Carry IDs through FieldRenderer and recursively nested fields; verify keyboard focus, label activation and error announcement.
6. **Repair context index exclusions.** Search repeatedly returned generated `.next-e2e` bundles and trace manifests over authored files. Exclude .next, .next-e2e, node_modules, test artifacts and caches; verify source chunk expansion works. Retrieval noise made source verification slower and risks stale/generated evidence in future work.

## Evidence and scope limits

[Evidence directory](/Volumes/Personal/madori/docs/audits/2026-09-06/evidence) contains release-check logs, dependency audit JSON, isolated service probes and targeted browser transcript. Probes use dummy credentials and temporary fixtures; no real account secrets included. Existing main test suite uses repository's disposable fixtures. Browser probes ran built production app, not development server.

Most service defects reproduced through actual modules. Some permission and invalidation findings rely on complete source traces rather than HTTP or full lifecycle reproduction; each says so. Unsafe-asset execution was observed with harmless script setting its own document title; no credential access or privileged mutation performed. No claim that Tiptap advisory is independently exploitable in current app.

Scaffolder source inspected and package typechecked, but external download/install/release distribution not exercised. Backups/runbooks reviewed; no destructive restore drill. Performance review was structural, not benchmark-based. Audit is comprehensive across subsystems, not a guarantee that every defect is listed.
