# Production operations

Madori's flat-file storage requires an explicit deployment contract. Treat content, resources, users, assets, sessions, SEO operational data, and schema manifest as stateful data.

## Supported topology

- Run one writable Madori application instance per configured data set.
- Mount configured paths on persistent storage. Container-local ephemeral filesystems are not supported for production content.
- Do not let multiple application instances write the same flat-file paths. Use one writer behind a reverse proxy; scale read-only frontend workloads separately.
- Terminate TLS at the platform or reverse proxy. Forward the original HTTPS scheme and client address only from trusted proxies.
- Set HSTS and request-body limits at TLS proxy. Application supplies frame, MIME-sniffing, referrer, and browser-permission headers.
- Use Node.js 22 or newer as required by `package.json`; CI tests Node.js 22. Use the repository-pinned pnpm version (currently 11.22.0).
- Keep `users/`, `.sessions/`, backup archives, rollback copies, and deployment credentials out of source control.

## Release gate

Release core repository only from clean commit that passes `Required CI`. Locally, equivalent checks are:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm exec tsc --noEmit --incremental false
pnpm exec tsc --noEmit -p packages/madori-sdk/tsconfig.json
pnpm exec tsc --noEmit -p packages/madori-cli/tsconfig.json
pnpm exec tsc --noEmit -p packages/create-madori-app/tsconfig.json
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm e2e
pnpm audit --prod --audit-level high
```

Generated applications include smaller `Required CI` workflow and matching gate:

```bash
pnpm verify
```

Record deployed commit SHA, Node version, lockfile hash, backup identifier, and deployment time.

The generated application's gate does not include the core repository's unit/browser suites. Record which gate ran. Browser coverage currently targets Chromium, including a forced fallback for browsers without the Navigation API; it is not full cross-browser certification.

## Configuration and caches

Set `sites` to the deployment's public URLs and keep exactly one default site. Defaults point to localhost. `madori.config.ts` is statically imported, so rebuild and restart after changing it in production, including changes written by the Control Panel project-configuration editor. Runtime values in `content/settings.yaml` are separate from project configuration.

Static HTML caching is disabled by default. When enabled, it needs a matching configured site origin and writable `staticCache.storagePath` for generation coordination. Cookies, authorization, RSC/prefetch traffic and private/no-store/no-cache responses bypass it. Enabling caching does not make every dynamic Next.js route cacheable. Application content/SEO caches and optional SDK tag caches are separate; custom SDK tag-cache integrations need their own invalidation.

The application serves configured assets through `/assets/...`, including files uploaded after startup. Keep the application's serving route in front of physical files: serving the entire asset directory directly at the proxy can expose `.meta.yaml` sidecars and bypass SVG download/sandbox headers. Configure any separate CDN/origin to preserve these restrictions.

## Pre-deploy backup

Write backups outside application checkout and persistent data mounts when possible:

```bash
pnpm madori backup /secure-backups/madori/pre-deploy-$(date +%Y%m%dT%H%M%S)
pnpm madori backup:verify /secure-backups/madori/pre-deploy-YYYYMMDDTHHMMSS.tar.gz
```

Backup contains a SHA-256 manifest covering configured content, resources, users, assets, SEO operational storage, sessions, configuration, and schema manifest. Custom user/session paths are taken from authentication configuration. Regenerable static caches and Git-sync operational state are not included as dedicated backup roots. Encrypt backup storage, restrict access, copy off-host, and apply retention policy.

Set site-specific recovery objectives before launch. Recommended starting point: hourly backup for active editorial sites, daily off-host copy, 30-day retention, quarterly restore drill.

## Deploy

1. Drain editor traffic or announce short write freeze.
2. Create and verify pre-deploy backup.
3. Deploy exact tested commit with frozen lockfile.
4. Start one writable instance.
5. Check `GET /api/health/live`; require HTTP 200.
6. Check `GET /api/health/ready`; require HTTP 200 before routing traffic.
7. Smoke-test login, one read, one reversible draft edit, GraphQL query, asset read, and logout.
8. End write freeze. Watch structured error logs and readiness for at least 15 minutes.

Health responses intentionally expose only status, check names, and timings. Never add paths, credentials, user data, or raw exception messages.

## Rollback

Code-only failure:

1. Remove failed instance from traffic.
2. Deploy previous known-good commit and its lockfile.
3. Confirm liveness/readiness and run smoke checks.

Data or migration failure:

1. Stop all writers.
2. Preserve current failed state with another backup for investigation.
3. Verify intended pre-deploy archive.
4. Restore with explicit confirmation:

```bash
pnpm madori restore /secure-backups/madori/pre-deploy-YYYYMMDDTHHMMSS.tar.gz --yes
```

Restore verifies checksums first and retains displaced data under `.madori/restore-rollbacks/`. Do not delete rollback copies until content owners validate restored state.

## Restore drill

At least quarterly, restore latest backup into an isolated checkout with empty data paths. Run `pnpm madori check`, build, start, health checks, and editorial smoke tests. Record duration, missing data, and corrective work. Untested backups do not satisfy recovery requirements.

## Monitoring

Monitor:

- liveness failure for process restart;
- readiness failure for traffic removal and operator alert;
- HTTP 5xx rate and structured `request.failed` events;
- filesystem capacity, inode capacity, and write latency;
- backup age and verification failure;
- certificate expiry and upstream availability.

Apply client-IP login throttling at trusted edge in addition to application account throttling. Strip and rewrite forwarding headers before using them for edge policy.

Avoid logging request bodies, cookies, authorization headers, user files, or Git credentials.
