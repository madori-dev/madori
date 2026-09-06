---
title: Deployment
slug: deployment
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-09-06T00:00:00.000Z
---

# Deployment

Madori's writable CMS runs on a Node.js server with persistent storage. Content is stored as flat files; no database is required. Build the Next.js application and preserve writable data across application releases.

For Control Panel functionality (content editing, asset uploads, user management), run one application process per writable project storage location. File locks and cache generations are local to that process; multiple writers are not supported by the bundled storage implementation. A separate read-only frontend can use bundled content or a remote content API, with the integration described below.

---

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Set to `production` for secure cookies, disabled introspection, and optimised builds |
| `PORT` | No | `3000` | Port for the Node.js server |

Use `cp.enabled: false` in `madori.config.ts` for a frontend-only deployment. Pass an explicit bind address to Next with `pnpm start -H 0.0.0.0` when required.

### Build Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build the Next.js application for production |
| `pnpm start` | Start the production server |
| `pnpm dev` | Start the development server with hot reload |

### madori.config.ts (Deployment-Relevant Options)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `graphql.introspection` | `boolean` | `true` in dev | Set to `false` in production to hide schema from public inspection |
| `cp.enabled` | `boolean` | `true` | Disable the CP if deploying frontend-only |
| `auth.storeConfig.sessionDurationMs` | `number` | `86400000` | Session expiry — consider shortening for production |
| `sites` | `SiteDefinitionConfig[]` | one local default | Public origins/locales used for canonical URLs and host routing |
| `seo.operationalStoragePath` | `string` | `./storage/seo` | Writable operational storage for 404 observations and report snapshots |
| `seo.errorTracking` | `boolean` | `true` | Enable bounded, normalized public 404 observation recording |
| `seo.redirects` | `boolean` | `true` | Enable authored redirects and public redirect execution |
| `seo.reports` | `boolean` | `true` | Enable audit report generation and report API |
| `staticCache.enabled` | `boolean` | `false` | Enable bounded public HTML caching; requires writable cache storage and matching configured site origin |

### System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Node.js | 22+ | Current supported LTS |
| RAM | Depends on workload | Size for content, build, and asset workload |
| Disk | Project size + assets | SSD for responsive CP |
| pnpm | Project package-manager version | Latest compatible version |

---

## Usage Examples

### Basic Production Build

```bash
pnpm build
pnpm start
```

This starts a production Next.js server on port 3000.

### VPS Deployment (Recommended for Full CP)

A VPS provides a persistent filesystem, meaning the Control Panel works fully — content editing, asset uploads, and user management all persist between deploys.

**Providers:** DigitalOcean, Hetzner, Vultr, Linode, AWS EC2

**Deploy script:**

```bash
git pull origin main
pnpm install --frozen-lockfile
pnpm build
# Restart your process manager
pm2 restart madori
```

### Nginx Reverse Proxy

Run Next.js on a private local port and point Nginx to that exact port. SSL can terminate at Nginx or Cloudflare; Madori does not need an internal callback URL for Control Panel authentication.

```bash
pnpm start -p 3001
```

```nginx
server {
    listen 80;
    server_name yoursite.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;

        proxy_buffer_size 16k;
        proxy_buffers 8 16k;
        proxy_busy_buffers_size 32k;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

The Control Panel Proxy only checks for the `madori_session` cookie before rendering. Protected API handlers perform authoritative session validation. This avoids a request from the Next.js Proxy back into the same server and works with custom ports, SSL termination, and Cloudflare proxying without extra environment variables.

### Process Management with systemd

```ini
[Unit]
Description=Madori CMS
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/var/www/my-site
ExecStart=/usr/bin/pnpm start -p 3001
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Process Management with PM2

```bash
pm2 start pnpm --name madori -- start -p 3001
pm2 save
pm2 startup
```

Keep PM2 and Nginx ports identical. If PM2 starts Madori on `3001`, `proxy_pass` must use `http://127.0.0.1:3001`.

### Vercel / Netlify (Frontend Only)

Serverless platforms work for the frontend site but the Control Panel won't persist changes — the filesystem is read-only and ephemeral.

Good for: marketing sites, documentation, and blogs where content is committed to Git.

### Railway / Render

Configure an always-on service with an attached persistent volume and one application instance. Map every writable data path to that volume; do not assume the service's default deployment filesystem persists. Verify the storage and restart behavior of your chosen plan before enabling editorial writes.

---

## Common Patterns

### SEO Runtime Storage

SEO has two storage classes:

- Versioned content: `resources/seo/sites`, `resources/seo/sections`, and `content/seo/redirects`. These files can live in the application repository or an explicitly tracked separate content repository.
- Operational state: `seo.operationalStoragePath` stores 404 observations and report snapshots. Keep this directory writable, persistent, backed up, and outside Git sync paths. SEO resolution caching is in memory; persistent redirect-hit counters are not implemented.

Do not deploy a shared writable operational directory across unrelated sites. Give each site or deployment its own storage scope. Never expose this directory through static hosting.

### Multi-Site Routing

Configure every public origin in `sites`. Domain sites are selected from the request host; a shared-host deployment may use a path prefix in its reverse proxy and still keeps canonical URLs scoped to the configured site. Set a trusted `Host`/forwarded-host policy at the edge and do not let clients select a site through arbitrary headers.

Public SEO routes are generated dynamically: `/sitemap.xml`, `/robots.txt`, and `/humans.txt`. Authored redirects run before page rendering for `GET` and `HEAD` requests. Control Panel and API paths are excluded from public redirect handling.

### SEO in Serverless Deployments

Read-only metadata and sitemap rendering can run on serverless infrastructure when content is bundled or fetched from a stable source. 404 tracking, report snapshots, and CP writes require a persistent writable filesystem. Disable `cp.enabled`, `seo.errorTracking`, `seo.reports`, `git.enabled`, and `staticCache.enabled` when no durable writable storage is available. A custom frontend must supply its own remote data integration; the bundled file engine does not switch to remote storage automatically.

### Content in Git

For automatic commits and GitHub pushes from the Control Panel, see [Git Content Sync](/docs/git-sync). Automatic sync needs persistent writable storage for content, each `.git` directory, and `git.statePath`; ephemeral serverless filesystems are not suitable.

Commit authored content to your repository, excluding private submissions and operational data. For example:

```bash
git add content/collections/blog/example-post.md
git commit -m "Update blog posts"
git push
```

This gives you:
- Version history for all content changes
- Pull request workflow for content review
- Easy rollback if something goes wrong
- Consistent content across dev/staging/production

### Automated Deployment on Push

Use GitHub Actions or similar CI to deploy on push to main:

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ssh deploy@yourserver.com "cd /var/www/my-site && git pull && pnpm install --frozen-lockfile && pnpm build && pm2 restart madori"
```

### Separate Frontend and CP Deployments

Deploy the frontend to a CDN/serverless platform and the CP to a VPS:

```ts
// madori.config.ts on the frontend deployment
const config = {
  cp: { enabled: false },
  graphql: { enabled: false },
  seo: { errorTracking: false, reports: false },
  git: { enabled: false },
  staticCache: { enabled: false },
}

export default config
```

This disables the local Control Panel and write-dependent options; it does not connect the frontend to the CMS. Adapt frontend reads to the public published-entry API or use authenticated GraphQL from server-side code against the separate CMS origin. Keep GraphQL credentials server-side. If content is bundled instead, arrange a rebuild after publishing. See [SDK and content access](/docs/sdk) for transport and authentication choices.

### SSL with Let's Encrypt

Use Certbot for free SSL certificates:

```bash
sudo certbot --nginx -d yoursite.com
```

Most server management tools (Ploi, Forge, Coolify) handle SSL with one click.

### Troubleshooting Control Panel 502 Errors

If the marketing site works but `/cp` returns `502 Bad Gateway`:

1. Confirm PM2 is running the expected command and port:

   ```bash
   pm2 show madori
   pm2 logs madori
   ```

2. Request the Control Panel directly from the server, bypassing Nginx and Cloudflare:

   ```bash
   curl -I http://127.0.0.1:3001/cp
   ```

   A `307` redirect to `/cp/login` without a session is expected.

3. Confirm Nginx `proxy_pass` uses the same host and port as the PM2 process.
4. Remove obsolete `INTERNAL_URL` configuration from older deployments. Current Madori versions do not make an internal session-validation HTTP request.
5. Check the Nginx error log. `upstream sent too big header while reading response header from upstream` means the upstream response headers exceeded Nginx's buffer. Deploy the latest Madori build and ensure the location block includes:

   ```nginx
   proxy_buffer_size 16k;
   proxy_buffers 8 16k;
   proxy_busy_buffers_size 32k;
   ```

   These values provide headroom for framework-generated headers and future application changes.
6. Reload Nginx and restart Madori after configuration or build changes:

   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   pm2 restart madori
   ```

### Health Check Endpoint

Use the dedicated liveness or readiness endpoint:

```bash
curl -f http://localhost:3000/api/health/live
curl -f http://localhost:3000/api/health/ready
```

These endpoints return `200` when their corresponding health check succeeds.

### Asset Backup

Back up uploaded assets separately since they're not always in Git:

```bash
# Rsync assets to backup location
rsync -avz /var/www/my-site/public/assets/ /backups/assets/
```
