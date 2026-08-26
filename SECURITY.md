# Security policy

## Supported versions

Pre-1.0 Madori supports latest commit on `main` and latest published `0.1.x` release only. Security fixes may require upgrading to newest patch release.

## Reporting a vulnerability

Use repository's private GitHub security advisory flow. Do not open public issue containing exploit details, credentials, personal data, or unredacted logs.

Include affected version or commit, deployment topology, reproduction steps, impact, and suggested mitigation when known. Maintainers should acknowledge report within three business days, provide status within seven, and coordinate disclosure after fix is available.

## Operator responsibilities

Production operators must follow [production operations](docs/operations/production.md), remove generated bootstrap credentials, restrict writable storage, keep dependencies patched, retain verified off-host backups, and monitor health/error signals.
