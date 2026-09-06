# Audit remediation — 6 September 2026

Fixes developed in three parallel Luna medium agents, then reviewed and integrated in the main task. Spark was unavailable through the subagent tool. The original [audit](audit.md) remains a record of the pre-fix checkout; this document records remediation.

Final review and additional fixes are recorded in [final-audit.md](final-audit.md). Existing user changes to AGENTS.md were preserved and excluded from the audit commit. No live deployment or external service configuration changes were made.

## Findings and changes

| Findings | Implemented change | Verification |
|---|---|---|
| S1, S6 | Publish permission checked for effective create/status transitions; reserved metadata rejected in custom entry data. | Route permission matrix and real entry persistence regressions. |
| S2 | Shared file locks cover read/hash/merge/write and source/destination names across engine instances. | Concurrent writers using one hash produce one success and one conflict. |
| S3, S9, S11 | Password changes and deletion revoke sessions; unsupported revocation fails closed. Login/lifecycle changes serialized. Email normalized and unique under store lock; role/profile edits validated. | Real composed auth reset, delete/recreate, duplicate email and profile/login tests; session I/O failure tests. |
| S4, F21 | Settings writer edits TypeScript source ranges, retains export bindings and environment expressions, and skips unchanged values from full browser submissions. Config writes serialized. | Environment-secret/full-form, alternate export, concurrent edit and unsafe computed-source regressions. |
| S5, S7, S8, S13, S14 | Upload collisions rejected; HTML/scripts blocked; assets and metadata moved/deleted together with rollback. Dynamic configured-root serving precedes physical public-file lookup; SVG downloads sandboxed. | Real file operations with injected failures; production upload, rename, collision, GET/HEAD and public-file precedence tests. |
| S10 | Global mutations reported after writes instead of reads. | Mutation reporter tests for both operations. |
| S12 | Updating an absent term returns not found. | Store and HTTP regressions. |
| S15 | Core field labels connected to unique controls; help/error IDs also unique, invalid state exposed; text, number and date controls use shared UI components. | Field checks and production label-based interaction. |
| S16 | Tiptap packages updated together to 3.31.3. | Production dependency audit; rich-text create/edit/reload browser workflow. |
| F1 | Anonymous eligible HTML captured through a bounded, trusted-origin render callback. Locks released on failure/timeout; private, authenticated and RSC traffic bypassed. Headers retained; disk generations coordinate invalidation and prevent stale in-flight renders from repopulating caches. | Cold concurrent rendering, retries, timeouts, header preservation, privacy bypass, cross-runtime generation and site-root/glob invalidation tests. |
| F2, F3, F7, F8, F9 | GraphQL naming/collision checks, shared filter types, separate single/list names, union resolution and original field-key resolution. | Actual schema execution across hyphenated/shared/plural handles, sanitized fields and multi-set blocks. |
| F4, F10 | GraphQL reads application singleton; schema rebuilt from current definitions. Semantic writes and filesystem changes invalidate content/SEO caches. | Real watcher and singleton tests; schema/resolver integration tests. |
| F5, F12 | Generated operations use real GraphQL documents, schema-compatible selections and explicit wire/data mappings; asset/relation types aligned with stored values. | Generated-output compilation and imported client get/list execution against real generated schema. |
| F6 | Introspection policy runs during GraphQL validation after request decoding; normal `__typename` permitted. | JSON, escaped JSON, multipart and GET validation tests; production HTTP check. |
| F11, F22 | SDK hook loading/error state follows request identity; filters encoded for public REST requests and included in request identity. | SDK and public transport contract checks. |
| F13 | Navigation examples request JSON `items` using its actual schema shape. | Documentation/schema review. |
| F14 | Invalid file-like content identifiers skipped at public lookup boundary. | Resolver regression and production missing-file 404 check. |
| F15–F19 | Server and client share field validation, including required rules/emptiness, visibility, asset cardinality, numeric clearing, patterns and ranges. | Shared/server validation suite and browser form checks. |
| F20 | Dirty internal links and history traversal guarded; cancellation preserves editor values; save/create navigation remains usable. | Production Chromium cancellation, acceptance, save and navigation regressions. |

The additional account lost-update risk noted in the audit is covered by serialized provider updates and a concurrent profile/last-login regression. CI now checks SDK, CLI and scaffolder types alongside application types.

## Release checks

| Check | Final result |
|---|---|
| Unit/property/integration tests | 248 files; 1,973 tests passed |
| Production Chromium browser suite | 27 tests passed, including fresh production build |
| Standard production build | Passed |
| Application types | Passed with incremental cache disabled |
| SDK, CLI and scaffolder types | All three passed |
| ESLint | Passed, zero warnings/errors |
| Production dependency audit | Zero vulnerabilities reported |
| Diff whitespace check | Passed |

Latest release logs are retained in `evidence/final/`; earlier remediation logs remain in `evidence/remediation/`.

## Operational boundaries and follow-ups

- File-write and auth lifecycle locks target the project's documented single writable application process. They are not distributed locks for multiple independent writers.
- Static HTML caching requires a matching configured site origin and an eligible response. Cookies, authorization, RSC/prefetch requests and private/no-store/no-cache responses pass through. Dynamic routes that prohibit caching remain dynamic. Warming must target the configured origin. Cache lifecycle tests run at the middleware/driver boundary; the production browser suite uses caching disabled.
- GraphQL schema currently rebuilds per request for correctness. Revision-keyed schema reuse is a future performance improvement.
- Successful rollback is tested after primary file-operation failures. Simultaneous storage and rollback failure still requires operational recovery from backups.
- Browser verification uses Chromium. This is not a full assistive-technology audit or a cross-browser certification.
- Context-engine searches still include generated build files. Its exclusion configuration is not present in this repository; index configuration cleanup remains a tooling follow-up.
- No live deployment, multi-process load test, external backup restore, or scaffold download/install was performed.
