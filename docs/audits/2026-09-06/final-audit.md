# Final audit — 6 September 2026

Reviewed working changes against baseline `a20012d09a83013f04d38ce121b120a8ab72ca12`, using original audit’s 38 findings as requirements. Two independent Luna medium reviewers checked standards and requirements; parent verified reports, fixed remaining defects, and ran release checks. Final reviewer signoff found no remaining confirmed blockers in reviewed changes. This is a code and regression audit, not a guarantee that every possible defect is absent.

## Standards

Two confirmed findings, both fixed:

- Disabling introspection also rejected ordinary GraphQL GET queries. GET queries now reach Yoga validation; GraphiQL is explicitly disabled. Production HTTP regression covers normal queries, introspection rejection, and UI suppression.
- File caching rejected separated query-string keys. Driver now encodes variants reversibly for reads and glob invalidation, protects path containment, and separates authored `_root`/`index.html` segments from reserved storage names.

No additional confirmed standards blocker remained at signoff.

## Spec

Two confirmed findings from initial independent review, both fixed:

- Nested GraphQL sets lacked original-key resolvers after field-name sanitization. Recursive set fields now read authored keys; runtime regression asserts nested values.
- Generated selections did not reliably resolve imported fieldsets. Pipeline now reads collection definitions, resolves referenced blueprints and fieldset imports, retains source blueprint filter names, and excludes unrelated blueprints. Missing/circular imports fail before replacing existing generated output.

Initial claim that ordinary hyphenated field names used incompatible mappings was rejected after checking actual server sanitizer. Label uniqueness and programmatic post-save navigation concerns did not establish additional defects; successful saves intentionally suppress dirty prompts. Separate fallback-history defects were reproduced and fixed below.

No remaining confirmed requirements blocker remained at signoff.

## Additional defects found during parent verification

- Collection and blueprint identities were conflated in generation. Two collections sharing a differently named blueprint now compile and validate all generated get/list operations against actual schema.
- Reserved GraphQL handles were checked after underscore collapse in CLI; checks now match server ordering.
- Hyphenated collection names produced invalid schema namespace exports; generated exports now quote such names.
- Returning to failed SDK request A while request B remains pending showed stale error/loading state. Both hooks now reset on each request-key transition; cancelled responses remain ignored.
- Optional fields with defaults became required; `required` with `min:0` accepted empty strings; block fields accepted malformed scalar/object values. Shared validation regressions reproduce and cover all three fixes.
- Non-Navigation-API history cancellation guessed direction, raced restoration, and registered after Next’s synchronous traversal handler. Persistent root history tracking now runs before that handler, restores indexed traversal deltas, and preserves edited values. Production tests disable Navigation API and exercise cancelled and accepted Back/Forward through real client links.

## Final release checks

| Check | Result |
|---|---|
| Unit/property/integration tests | 248 files, 1,973 tests passed |
| Production Chromium browser suite | 27 tests passed with fresh production build |
| Standard production build | Passed |
| Application types, incremental cache disabled | Passed |
| SDK, CLI and scaffolder types | Passed |
| ESLint | Passed, zero warnings/errors |
| Production dependency audit | No known vulnerabilities found |
| Diff whitespace | Passed |

Logs: [evidence/final](evidence/final); trailing whitespace normalized for version control. Failed diagnostic runs remain named `navigation-debug*`; `browser.txt` records successful final full suite. Generated-output checks compile actual files against SDK declarations emitted from source and validate/execute operations using actual GraphQL schema. SDK hook lifecycle tests use a mocked React lifecycle; browser history tests use production application.

Pre-existing AGENTS.md newline edit is excluded from commit. Main and origin/main matched baseline before changes were committed. Operational boundaries remain in [remediation.md](remediation.md#operational-boundaries-and-follow-ups), including single-writer locking, no live deployment, no distributed load/backup-restore test, and Chromium-only browser verification. Context Engine was unavailable (`Transport closed`); source reads and this report preserve review evidence.

Standards: 2 findings, 2 fixed, 0 open. Spec: 2 confirmed findings, 2 fixed, 0 open. No remaining worst issue within either axis.
