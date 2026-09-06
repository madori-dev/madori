# Security policy

## Supported versions

Pre-1.0 Madori's supported source is the latest commit on `main`; the published `create-madori-app` scaffolder is on the `0.1.x` line. The CMS, CLI and SDK source revision in a generated application must also be kept current: updating a scaffolder alone does not patch an existing site. Security fixes may require upgrading source and its lockfile.

## Reporting a vulnerability

Use repository's private GitHub security advisory flow. Do not open public issue containing exploit details, credentials, personal data, or unredacted logs.

Include affected version or commit, deployment topology, reproduction steps, impact, and suggested mitigation when known. Maintainers should acknowledge report within three business days, provide status within seven, and coordinate disclosure after fix is available.

## Operator responsibilities

Production operators must follow [production operations](docs/operations/production.md), remove generated bootstrap credentials, restrict writable storage, keep dependencies patched, retain verified off-host backups, and monitor health/error signals.

Use one writable application process per data set. File SDK access is trusted server-side access and does not enforce session permissions; public consumers should use publication-filtered APIs/adapters. Password resets and account deletion through the application revoke existing sessions. Preserve protected asset serving and metadata-sidecar exclusions when introducing proxies or CDNs.
